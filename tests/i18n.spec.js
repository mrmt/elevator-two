// 表示言語。ja と en でキー集合が一致していることと、切り替えが効くことを見る。
import { test, expect } from '@playwright/test';

test('ja と en のキー集合が一致する', async ({ page }) => {
  await page.goto('/index.html');
  const diff = await page.evaluate(() => {
    const ja = Object.keys(I18N.ja).sort();
    const en = Object.keys(I18N.en).sort();
    return {
      missingInEn: ja.filter(k => !(k in I18N.en)),
      missingInJa: en.filter(k => !(k in I18N.ja)),
    };
  });
  expect(diff.missingInEn).toEqual([]);
  expect(diff.missingInJa).toEqual([]);
});

test('data-i18n を持つ要素に空文字が残らない', async ({ page }) => {
  await page.goto('/index.html');
  const empty = await page.evaluate(() =>
    [...document.querySelectorAll('[data-i18n]')]
      .filter(el => !el.textContent.trim())
      .map(el => el.dataset.i18n));
  expect(empty).toEqual([]);
});

test('切り替えると表示が変わり、次に開いても保たれる', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#lang')).toHaveText('JA');
  await expect(page.locator('[data-i18n="tab.scene"]')).toHaveText('シーン');

  await page.locator('#lang').click();
  await expect(page.locator('#lang')).toHaveText('EN');
  await expect(page.locator('[data-i18n="tab.scene"]')).toHaveText('scene');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.locator('#lang')).toHaveText('EN');
});

test('シーン名も訳し分けられる', async ({ page }) => {
  await page.goto('/index.html');
  const ja = await page.locator('#scenename').textContent();
  await page.locator('#lang').click();
  const en = await page.locator('#scenename').textContent();
  expect(en).not.toBe(ja);
  expect(en).toMatch(/^[a-z ]+$/);
});
