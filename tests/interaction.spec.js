// レイアウトと操作。広い画面では3カラム、狭い画面ではタブで1セクションずつ。
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('ページ自体は横にも縦にもスクロールしない', async ({ page }) => {
  const over = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(over.x).toBeLessThanOrEqual(1);
  expect(over.y).toBeLessThanOrEqual(1);
});

test('XYパッドをドラッグすると陰陽と密度が変わる', async ({ page, isMobile }) => {
  if (isMobile) await page.locator('.tab[data-tab="pad"]').click();
  const before = await page.locator('#ryy').textContent();

  const box = await page.locator('#plane').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 8 });
  await page.mouse.up();

  // 目標に追いつくまで時間がかかるので、値が動き出したことだけ見る
  await expect.poll(() => page.locator('#ryy').textContent(), { timeout: 8000 })
    .not.toBe(before);
});

test('狭い画面ではタブで切り替わる', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'デスクトップ幅ではタブを出さない');
  await expect(page.locator('#tabs')).toBeVisible();
  await page.locator('.tab[data-tab="scene"]').click();
  await expect(page.locator('#tab-scene')).toBeVisible();
  await expect(page.locator('#tab-pad')).toBeHidden();
  await page.locator('.tab[data-tab="sound"]').click();
  await expect(page.locator('#tab-sound')).toBeVisible();
});

test('広い画面では3セクションが同時に見える', async ({ page, isMobile }) => {
  test.skip(isMobile, '狭幅ではタブ表示になる');
  await expect(page.locator('#tabs')).toBeHidden();
  await expect(page.locator('#tab-scene')).toBeVisible();
  await expect(page.locator('#tab-pad')).toBeVisible();
  await expect(page.locator('#tab-sound')).toBeVisible();
});

test('ヘッダーが折り返さない', async ({ page }) => {
  const h = await page.locator('header').evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(90);
});

test('シーンは14種すべて並ぶ', async ({ page, isMobile }) => {
  if (isMobile) await page.locator('.tab[data-tab="scene"]').click();
  await expect(page.locator('.scenebtn')).toHaveCount(14);
  await expect(page.locator('#scenes .group')).toHaveCount(4);
});

test('見た目は EK 固定で、切り替えは無い', async ({ page }) => {
  // D-37。テーマの切り替えは廃止した (2026-09-12)
  await expect(page.locator('.themebtn')).toHaveCount(0);
  expect(await page.getAttribute('html', 'data-theme')).toBeNull();
  // EK の漆黒の下地が既定で当たっている
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(8, 8, 10)');
});

test('大きな再生ボタンがXYパッドの中央に出る', async ({ page, isMobile }) => {
  // Issue #1。右上の小さなボタンだけでは、まず押さないと鳴らないことに気づけない
  if (isMobile) await page.locator('.tab[data-tab="pad"]').click();
  await expect(page.locator('#bigplay')).toBeVisible();

  const pad = await page.locator('#plane').boundingBox();
  const btn = await page.locator('#bigplay').boundingBox();
  expect(Math.abs((btn.x + btn.width / 2) - (pad.x + pad.width / 2))).toBeLessThan(2);
  expect(Math.abs((btn.y + btn.height / 2) - (pad.y + pad.height / 2))).toBeLessThan(2);
  // 指でも押せる大きさ
  expect(btn.width).toBeGreaterThan(56);
});
