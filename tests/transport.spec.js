// 進行 (第1層 シーン / 第2層 フレーズ / 第3層 イベント) が回っているかを見る。
// この段階ではまだ音源が無いので、確認手段は画面の表示だけになる。
import { test, expect } from '@playwright/test';

// 「scene 12/64」のような表示から現在の小節を読む
async function sceneBar(page) {
  const txt = await page.locator('#pbarpos').textContent();
  const m = txt.match(/scene (\d+)\//);
  return m ? parseInt(m[1], 10) : -1;
}
// 「4/16 (scene ...)」の左側。フレーズ内の位置
async function phraseBar(page) {
  const txt = await page.locator('#pbarpos').textContent();
  const m = txt.match(/^(\d+)\/(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('再生すると小節とステップが進む', async ({ page }) => {
  await expect(page.locator('#rbar')).toHaveText('—');

  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('data-on', '1');

  // 16分ステップの点灯が動く
  await expect(page.locator('#steps i.now')).toHaveCount(1, { timeout: 5000 });

  const first = await sceneBar(page);
  expect(first).toBeGreaterThan(0);
  await page.waitForTimeout(6000);
  const later = await sceneBar(page);
  expect(later).toBeGreaterThan(first);
});

test('一時停止すると進行が止まる', async ({ page }) => {
  await page.locator('#play').click();
  await page.waitForTimeout(2500);
  await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveAttribute('data-on', '1');
  await expect(page.locator('#rbar')).toHaveText('—');

  const stopped = await sceneBar(page);
  await page.waitForTimeout(2500);
  expect(await sceneBar(page)).toBe(stopped);
  // 止めたらステップの点灯も消える
  await expect(page.locator('#steps i.now')).toHaveCount(0);
});

test('16小節でフレーズが切り替わる', async ({ page }) => {
  // 1小節はおよそ1.8秒。16小節で30秒近くかかるので、この1本だけ長めに取る
  test.setTimeout(120000);
  // BPM を上げて待ち時間を詰める
  await page.locator('#s_bpm').fill('140');
  await page.locator('#play').click();

  // フレーズの最後の小節まで進むのを待つ
  await expect.poll(() => phraseBar(page), { timeout: 60000, intervals: [500] }).toBe(16);
  const atEnd = await sceneBar(page);
  // 次の小節でフレーズ内の位置が1へ戻る。シーン側の小節は戻らず進み続ける
  await expect.poll(() => phraseBar(page), { timeout: 15000, intervals: [200] }).toBe(1);
  expect(await sceneBar(page)).toBeGreaterThan(atEnd);
  await expect(page.locator('#pphrase')).not.toHaveText('—');
});

test('4小節ごとにイベントの判定が走る', async ({ page }) => {
  test.setTimeout(120000);
  // 発火は確率なので、判定機会の数を稼がないと取りこぼす。
  // 最速のシーン (疾走) を選び、BPM も上げて4小節を6秒台まで詰める
  await page.locator('.scenebtn').nth(12).click();
  await page.locator('#s_bpm').fill('140');
  // グリッチを上げるとグリッチ系イベントの重みも上がる
  await page.locator('#s_glitch').fill('1');
  await page.locator('#play').click();

  await expect(page.locator('#pevent')).toContainText('@bar', { timeout: 90000 });
  const txt = await page.locator('#pevent').textContent();
  const bar = parseInt(txt.match(/@bar (\d+)/)[1], 10);
  // 判定は4小節の節目でのみ走る。開始直後の1小節目には出さない
  expect(bar).toBeGreaterThan(0);
  expect(bar % 4).toBe(0);
});

test('「次へ」でシーンが変わる', async ({ page }) => {
  const before = await page.locator('#scenename').textContent();
  // 直近3つを避けて引くので、数回押せば必ず別のシーンになる
  await page.locator('#next').click();
  const after = await page.locator('#scenename').textContent();
  expect(after).not.toBe(before);
});

test('一覧から選ぶとそのシーンになる', async ({ page }) => {
  const btn = page.locator('.scenebtn').nth(9);   // 遠望 vista
  const name = await btn.locator('span').first().textContent();
  await btn.click();
  await expect(page.locator('#scenename')).toHaveText(name);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
});

test('スライダーを触ると (edit) が付く', async ({ page }) => {
  await expect(page.locator('#scenename')).not.toContainText('(edit)');
  await page.locator('#s_drive').fill('0.9');
  await expect(page.locator('#scenename')).toContainText('(edit)');
});
