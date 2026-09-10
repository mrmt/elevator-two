// 実際に音が出ているかを見る。ヘッドレスWebKitはAudioContextのresumeが不安定なためChromiumのみ。
import { test, expect } from '@playwright/test';
import { installAudioProbe, maxPeakOver } from './helpers/audio.js';

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

test('キックが拍に乗る', async ({ page }) => {
  test.setTimeout(60000);
  // 曙 (daybreak) は素直な4つ打ちのシーン。ここで拍とキックの間隔が合うことを見る
  await page.locator('.scenebtn').nth(10).click();
  await page.locator('#play').click();
  await page.waitForTimeout(1500);
  const bpm = parseInt(await page.locator('#rbpm').textContent(), 10);

  // 低域 (0〜115Hz) のエネルギーを拾い、立ち上がりの間隔を測る
  const series = await page.evaluate(async () => {
    const a = window.__audioProbe;
    a.smoothingTimeConstant = 0;
    const buf = new Uint8Array(a.frequencyBinCount);
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      a.getByteFrequencyData(buf);
      let e = 0;
      for (let i = 0; i < 5; i++) e += buf[i];
      out.push([performance.now() - t0, e / 5]);
      await new Promise(r => setTimeout(r, 20));
    }
    return out;
  });

  const onsets = [];
  for (let i = 2; i < series.length; i++) {
    const [t, v] = series[i];
    const prev = series[i - 1][1];
    if (v > 150 && v - prev > 25 && (!onsets.length || t - onsets.at(-1) > 180)) onsets.push(t);
  }
  expect(onsets.length).toBeGreaterThan(6);

  const iv = [];
  for (let i = 1; i < onsets.length; i++) iv.push(onsets[i] - onsets[i - 1]);
  iv.sort((a, b) => a - b);
  const median = iv[Math.floor(iv.length / 2)];
  const beat = 60000 / bpm;
  // 4つ打ちなので、隣り合うキックの間隔は1拍。取りこぼしと変形のぶんの幅を見る
  expect(median).toBeGreaterThan(beat * 0.8);
  expect(median).toBeLessThan(beat * 1.35);
});
