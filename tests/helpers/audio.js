// アプリのオーディオグラフはIIFEの中に閉じているので、外からノードを掴めない。
// AudioNode.prototype.connect をラップして、destination へ繋がる信号を
// AnalyserNode にも分岐させ、テストから波形を読めるようにする。

export async function installAudioProbe(page) {
  await page.addInitScript(() => {
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
        const probe = dest.context.createAnalyser();
        probe.fftSize = 2048;
        origConnect.call(this, probe);
        window.__audioProbe = probe;
      }
      return origConnect.call(this, dest, ...rest);
    };
  });
}

/** プローブから現在の波形レベルを取る。プローブ未設置なら null */
export function readLevel(page) {
  return page.evaluate(() => {
    const probe = window.__audioProbe;
    if (!probe) return null;
    const buf = new Float32Array(probe.fftSize);
    probe.getFloatTimeDomainData(buf);
    let peak = 0;
    let sum = 0;
    for (const v of buf) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / buf.length), state: probe.context.state };
  });
}

/** 一定時間ポーリングして観測できた最大のピークを返す */
export async function maxPeakOver(page, ms, intervalMs = 250) {
  const deadline = Date.now() + ms;
  let peak = 0;
  let last = null;
  while (Date.now() < deadline) {
    last = await readLevel(page);
    if (last && last.peak > peak) peak = last.peak;
    await page.waitForTimeout(intervalMs);
  }
  return { peak, last };
}

/**
 * 低域の包絡を音声スレッド側で録る。
 *
 * AnalyserNode をメインスレッドから一定間隔で叩く方式だと、並列実行で
 * ポーリングが痩せたときに打点の時刻がぶれる。ScriptProcessorNode の
 * `playbackTime` は音声時計の値なので、メインスレッドの都合に左右されない。
 * 128サンプルごとの実効値を積むので、時間の粒度は約2.7msになる。
 */
export async function recordLowEnvelope(page, ms, cutoffHz = 130) {
  return page.evaluate(async ([ms, cutoffHz]) => {
    const probe = window.__audioProbe;
    const ctx = probe.context;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoffHz;
    lp.Q.value = 0.7;
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const env = [];
    sp.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      const t0 = e.playbackTime;
      for (let i = 0; i < d.length; i += 128) {
        let s = 0;
        for (let j = 0; j < 128; j++) { const v = d[i + j] || 0; s += v * v; }
        env.push([t0 + i / ctx.sampleRate, Math.sqrt(s / 128)]);
      }
    };
    probe.connect(lp).connect(sp).connect(mute).connect(ctx.destination);
    await new Promise(r => setTimeout(r, ms));
    sp.onaudioprocess = null;
    try { probe.disconnect(lp); } catch (_) {}
    return env;
  }, [ms, cutoffHz]);
}

/** 包絡から打点の時刻 (秒) を拾う */
export function findOnsets(env, { rise = 2.2, floor = 0.02, minGap = 0.1 } = {}) {
  const out = [];
  for (let i = 3; i < env.length; i++) {
    const [t, v] = env[i];
    const prev = Math.max(env[i - 1][1], env[i - 2][1], 1e-6);
    if (v > floor && v / prev > rise && (!out.length || t - out.at(-1) > minGap)) out.push(t);
  }
  return out;
}
