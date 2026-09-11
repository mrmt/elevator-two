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
  // videos.list は生き死にと長さの確認に使う (D-35)
  await page.route('**/youtube/v3/videos*', route => {
    const ids = new URL(route.request().url()).searchParams.get('id').split(',');
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: ids.map(id => ({
          id,
          contentDetails: { duration: 'PT31M20S' },
          status: { embeddable: true, privacyStatus: 'public', license: 'creativeCommon' },
        })),
      }),
    });
  });
  await page.addInitScript(() => {
    window.__searches = [];
    window.__loaded = [];
    window.__starts = [];
    window.__rates = [];
    window.__verifies = [];
    const origFetch = window.fetch;
    window.fetch = function (url, ...rest) {
      if (String(url).includes('youtube/v3/search')) window.__searches.push(String(url));
      if (String(url).includes('youtube/v3/videos')) window.__verifies.push(String(url));
      return origFetch.call(this, url, ...rest);
    };
    window.YT = {
      Player: function (id, opts) {
        const el = document.getElementById(id);
        const f = document.createElement('iframe');
        f.id = id;
        el.replaceWith(f);
        this.loadVideoById = o => { window.__loaded.push(o.videoId); window.__starts.push(o.startSeconds); };
        this.setPlaybackRate = r => window.__rates.push(r);
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

test('取っておいた一覧は検索を繰り返さず、確認だけで済ませる', async ({ page }) => {
  // D-35。search.list は1回100単位、videos.list は1単位。
  // 一覧は30日取っておき、生き死にと長さの確認だけ1日1回行う
  await stubYouTube(page);
  await page.goto('/index.html');
  await page.locator('.scenebtn').nth(0).click();
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });
  expect(await page.evaluate(() => window.__searches.length)).toBe(1);
  expect(await page.evaluate(() => window.__verifies.length)).toBe(1);

  // 開き直しても、取ってある一覧は引き直さない。
  // 開いた直後のシーンは陰陽の波から引かれるので、そこは検索が走りうる。
  // 落ち着いてから数え直し、取ってあるシーンへ移っても増えないことを見る
  await page.reload();
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => [window.__searches.length, window.__verifies.length]);
  await page.locator('.scenebtn').nth(0).click();
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => [window.__searches.length, window.__verifies.length]))
    .toEqual(before);
});

test('埋め込めなくなった動画は一覧から外れる', async ({ page }) => {
  await stubYouTube(page);
  // 半分を埋め込み不可にして返す
  await page.route('**/youtube/v3/videos*', route => {
    const ids = new URL(route.request().url()).searchParams.get('id').split(',');
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: ids.map((id, i) => ({
          id,
          contentDetails: { duration: 'PT25M' },
          status: { embeddable: i % 2 === 0, privacyStatus: 'public', license: 'creativeCommon' },
        })),
      }),
    });
  });
  await page.goto('/index.html');
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });

  const cached = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('elevator-two:ytcache')));
  const items = Object.values(cached)[0].items;
  expect(items.length).toBe(3);            // 6件のうち偶数番目だけ残る
  expect(items.every(v => v.dur === 1500)).toBe(true);
});

test('見つからないときは検索語を減らして引き直す', async ({ page }) => {
  // D-45。語を絞ったまま諦めると、在庫の薄いシーンで背景が出ないままになる
  await page.addInitScript(() => {
    window.__searches = [];
    window.__loaded = [];
    window.__starts = [];
    window.__rates = [];
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
        this.loadVideoById = o => { window.__loaded.push(o.videoId); window.__starts.push(o.startSeconds); };
        this.setPlaybackRate = r => window.__rates.push(r);
        this.mute = () => {};
        this.playVideo = () => {};
        this.pauseVideo = () => {};
        setTimeout(() => opts.events.onReady({ target: this }), 10);
      },
    };
  });
  // 語が3つ以下のときだけ結果を返す = 絞り込んだ検索は空振りする
  await page.route('**/youtube/v3/search*', route => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const hit = q.trim().split(/\s+/).length <= 3;
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: hit ? ITEMS : [] }),
    });
  });
  await page.route('**/youtube/v3/videos*', route => {
    const ids = new URL(route.request().url()).searchParams.get('id').split(',');
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: ids.map(id => ({
          id,
          contentDetails: { duration: 'PT30M' },
          status: { embeddable: true, privacyStatus: 'public', license: 'creativeCommon' },
        })),
      }),
    });
  });

  await page.goto('/index.html');
  await page.locator('.scenebtn').nth(0).click();   // 潜行。語が6つある
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();

  // 語が減ったところで当たり、動画が出る
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 10000 });
  const qs = (await page.evaluate(() => window.__searches))
    .map(u => decodeURIComponent(new URL(u).searchParams.get('q')));
  expect(qs.length).toBeGreaterThan(2);
  // 語数が段々減っている
  const counts = qs.map(q => q.trim().split(/\s+/).length);
  expect(counts[0]).toBeGreaterThan(counts[counts.length - 1]);
  expect(counts[counts.length - 1]).toBeLessThanOrEqual(3);
});

test('再生開始位置と再生速度を毎回振る', async ({ page }) => {
  test.setTimeout(120000);
  // Issue #2。いつも先頭から等速で始まると飽きるうえ、
  // 冒頭がフェードインの動画では主題が映らないまま差し替わってしまう
  await stubYouTube(page);
  await page.goto('/index.html');
  await page.locator('#ytkey').fill('test-key');
  await page.locator('#ytkey').blur();
  await expect(page.locator('#vcap')).toContainText('CC BY', { timeout: 8000 });

  await page.locator('.scenebtn').nth(12).click();   // 疾走 dash。1小節が短い
  await page.locator('#s_bpm').fill('140');
  await page.locator('#play').click();

  // 4小節ごとに差し替わるので、何回かぶん貯める
  await expect.poll(() => page.evaluate(() => window.__starts.length),
    { timeout: 60000, intervals: [500] }).toBeGreaterThan(4);

  const starts = await page.evaluate(() => window.__starts);
  const rates = await page.evaluate(() => window.__rates);

  // 頭から始めない。スタブの動画は31分20秒なので、30秒より後ろから始まる
  expect(starts.every(v => v >= 30)).toBe(true);
  // 毎回同じ位置にはならない
  expect(new Set(starts).size).toBeGreaterThan(1);

  // 速度は等速・半速・倍速のどれか
  expect(rates.length).toBe(starts.length);
  expect(rates.every(r => r === 1 || r === 0.5 || r === 2)).toBe(true);
});
