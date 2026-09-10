// 背景の動画 (D-32)。YouTube へは実際には繋がず、IFrame API と検索を差し替えて見る。
import { test, expect } from '@playwright/test';

const ITEMS = Array.from({ length: 6 }, (_, i) => ({
  id: { videoId: `vid${i}` },
  snippet: { title: `title ${i}`, channelTitle: `channel ${i}` },
}));

// 本物の IFrame API と検索の代わりを置く
async function stubYouTube(page) {
  await page.route('**/youtube/v3/search*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: ITEMS }) }));
  await page.addInitScript(() => {
    window.__searches = [];
    window.__loaded = [];
    const origFetch = window.fetch;
    window.fetch = function (url, ...rest) {
      if (String(url).includes('youtube/v3/search')) window.__searches.push(String(url));
      return origFetch.call(this, url, ...rest);
    };
    window.YT = {
      Player: function (id, opts) {
        const el = document.getElementById(id);
        const f = document.createElement('iframe');
        f.id = id;
        el.replaceWith(f);
        this.loadVideoById = o => window.__loaded.push(o.videoId);
        this.mute = () => {};
        this.playVideo = () => {};
        this.pauseVideo = () => {};
        setTimeout(() => opts.events.onReady({ target: this }), 10);
      },
    };
  });
}

test('キーが無ければ何も通信せず、背景も変わらない', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/index.html');
  await expect(page.locator('#bg')).toBeHidden();
  await expect(page.locator('#bgvideo')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#ytnote')).toContainText('キー');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__searches.length)).toBe(0);
});

test('キーを入れると背景に動画が出る', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/index.html');
  // 開始時のシーンは陰陽の波から引かれるので、検索語を確かめるために選び直す
  await page.locator('.scenebtn').nth(0).click();   // 潜行 submerge
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();

  await expect(page.locator('#bg')).toBeVisible();
  await expect(page.locator('#bgvideo')).toHaveAttribute('aria-pressed', 'true');
  // 検索は「いまのシーンの英語名」で、改変を許すライセンスに絞って行う
  const url = await expect.poll(async () => (await page.evaluate(() => window.__searches))[0],
    { timeout: 8000 }).not.toBeUndefined().then(() =>
      page.evaluate(() => window.__searches[0]));
  expect(url).toContain('videoLicense=creativeCommon');
  expect(url).toContain('videoEmbeddable=true');
  expect(url).toContain('videoDuration=long');
  expect(url).toContain('order=viewCount');
  // シーンの英語名に、そのシーンの性格を表す語と共通の footage が付く (D-33)
  const q = decodeURIComponent(new URL(url).searchParams.get('q'));
  expect(q).toContain('submerge');
  expect(q).toContain('footage');
  expect(q.split(' ').length).toBeGreaterThan(2);
  // 題名と制作者が出る (CC BY の表示義務)
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });
  await expect(page.locator('#vcap')).toContainText('channel');
});

test('キーは保存され、次に開いても動画が出る', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/index.html');
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#bg')).toBeVisible();

  await page.reload();
  await expect(page.locator('#bg')).toBeVisible();
  await expect(page.locator('#ytkey')).toHaveValue('test-key');
});

test('4小節ごとに別の動画へ差し替わる', async ({ page }) => {
  test.setTimeout(90000);
  await stubYouTube(page);
  await page.goto('/index.html');
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });

  await page.locator('.scenebtn').nth(12).click();   // 疾走 dash。1小節が短い
  await page.locator('#s_bpm').fill('140');
  await page.locator('#play').click();

  // 4小節でおよそ7秒。2回ぶん待って、読み込まれた動画が増えることを見る
  await expect.poll(() => page.evaluate(() => window.__loaded.length),
    { timeout: 40000, intervals: [500] }).toBeGreaterThan(2);
  const loaded = await page.evaluate(() => window.__loaded);
  // 同じ動画を続けて出さない
  for (let i = 1; i < loaded.length; i++) expect(loaded[i]).not.toBe(loaded[i - 1]);
  // 重なっているのは常に片方だけ
  expect(await page.locator('#bg .vid.on').count()).toBe(1);
});

test('トグルで止められる', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/index.html');
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#bg')).toBeVisible();

  await page.locator('#bgvideo').click();
  await expect(page.locator('#bg')).toBeHidden();
  await expect(page.locator('#vcap')).toHaveText('');
});
