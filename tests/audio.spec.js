// 実際に音が出ているかを見る。ヘッドレスWebKitはAudioContextのresumeが不安定なためChromiumのみ。
import { test, expect } from '@playwright/test';
import { installAudioProbe, maxPeakOver, recordLowEnvelope, findOnsets } from './helpers/audio.js';

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
  await page.goto('/index.html');
});

test('再生するとドラムが鳴る', async ({ page }) => {
  await page.locator('#play').click();
  const { peak } = await maxPeakOver(page, 6000);
  expect(peak).toBeGreaterThan(0.02);
});

test('一時停止すると無音になる', async ({ page }) => {
  await page.locator('#play').click();
  await page.waitForTimeout(3000);
  await page.locator('#pause').click();
  // 鳴っている音の残りが消えるのを待つ
  await page.waitForTimeout(2500);
  const { peak } = await maxPeakOver(page, 2000);
  expect(peak).toBeLessThan(0.01);
});

test('音量を0にすると無音になる', async ({ page }) => {
  await page.locator('#play').click();
  await page.waitForTimeout(1500);
  await page.locator('#s_volume').fill('0');
  await page.waitForTimeout(2000);
  const { peak } = await maxPeakOver(page, 2000);
  expect(peak).toBeLessThan(0.01);
});

test('打点が16分のグリッドに乗る', async ({ page }) => {
  test.setTimeout(60000);
  // 曙 (daybreak) は素直な4つ打ちのシーン。
  // 低域にはキックとベースの両方が出るので、間隔ではなく「拍に整列しているか」を見る
  await page.locator('.scenebtn').nth(10).click();
  // グリッチは32分に置き直す仕掛けなので、定義からしてこの格子には乗らない。
  // 空間 (リバーブとディレイ) の返しも立ち上がりを鈍らせるので、どちらも切ってから測る
  await page.locator('#s_glitch').fill('0');
  await page.locator('#s_space').fill('0');
  await page.locator('#s_glide').fill('3');
  await page.locator('#play').click();
  await page.waitForTimeout(4000);
  const bpm = parseInt(await page.locator('#rbpm').textContent(), 10);

  const env = await recordLowEnvelope(page, 9000);
  const onsets = findOnsets(env);
  expect(onsets.length).toBeGreaterThan(8);

  // 拍そのものではなく16分のグリッドで見る。ベースは8分や16分にも置かれるので、
  // 「すべての打点が同じ格子の上にある」ことが確かめたい不変条件になる。
  // 位相の原点は分からないので、ずれが最小になる原点を総当たりで探す
  const step = (60 / bpm) / 4;
  // 格子から 8% (約10ms) 以内に収まる打点の割合を、原点を動かしながら最大化する。
  // 中央値で見ると、立ち上がりの検出が遅れた数点に引きずられて紛れるため、割合で見る
  let best = 0;
  for (let k = 0; k < 400; k++) {
    const off = (step * k) / 400;
    const near = onsets.filter(t => {
      const r = ((t - off) % step + step) % step;
      return Math.min(r, step - r) / step < 0.08;
    }).length;
    best = Math.max(best, near / onsets.length);
  }
  // 打点が格子に乗っていなければこの割合は 0.16 前後まで落ちる (窓が 8%×2 のため)。
  // 実測はおおむね 0.8 以上なので、間に十分な開きがある
  expect(best).toBeGreaterThan(0.6);
});

test('Ladder フィルタが AudioWorklet で動く', async ({ page }) => {
  // 代替の BiquadFilter に落ちていないことを見る (D-10)
  await page.addInitScript(() => {
    window.__workletNodes = [];
    const Orig = window.AudioWorkletNode;
    window.AudioWorkletNode = function (ctx, name, opts) {
      window.__workletNodes.push(name);
      return new Orig(ctx, name, opts);
    };
    window.AudioWorkletNode.prototype = Orig.prototype;
  });
  await page.goto('/index.html');
  await page.locator('#play').click();
  await expect.poll(() => page.evaluate(() => window.__workletNodes), { timeout: 8000 })
    .toContain('ladder');
});

test('重さを上げると低域が増える', async ({ page }) => {
  test.setTimeout(90000);
  // 曙 (daybreak) はベースが16分で動くシーン。
  // 「押し出し」の効きはマスターのコンプに均されて測りにくいので、
  // ベースとキックの量そのものを動かす「重さ」で見る
  await page.locator('.scenebtn').nth(10).click();
  // スライダーの値は推移時間をかけて効くので、待ち時間ぶんで届くまで短くしておく
  await page.locator('#s_glide').fill('3');
  await page.locator('#play').click();
  await page.waitForTimeout(2000);

  const lowBand = async () => page.evaluate(async () => {
    const a = window.__audioProbe;
    a.fftSize = 4096;
    const buf = new Uint8Array(a.frequencyBinCount);
    let lo = 0, n = 0;
    for (let k = 0; k < 32; k++) {
      a.getByteFrequencyData(buf);
      for (let i = 3; i < 13; i++) lo += buf[i];   // 約30〜140Hz
      n++;
      await new Promise(r => setTimeout(r, 25));
    }
    return lo / n / 10;
  });

  // 並びは小節ごとに変わるので、交互に切り替えて複数回測り平均で見る
  const light = [], heavy = [];
  for (let round = 0; round < 3; round++) {
    await page.locator('#s_weight').fill('0');
    await page.waitForTimeout(3000);
    light.push(await lowBand());
    await page.locator('#s_weight').fill('1');
    await page.waitForTimeout(3000);
    heavy.push(await lowBand());
  }
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  expect(mean(heavy)).toBeGreaterThan(mean(light) * 1.02);
});
