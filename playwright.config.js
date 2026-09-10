// @ts-check
import { defineConfig, devices } from '@playwright/test';

const PORT = 8124;   // elevator-one (8123) と同時に走らせても衝突しないようにずらす

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI でも list を混ぜる。github reporter は失敗時の注釈しか出さないため、
  // これがないとログから「いまどのテストを実行しているか」が分からない
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // 表示言語はブラウザ言語で決まるので、既定を固定しないとCI環境依存になる
    locale: 'ja-JP',
  },

  // 静的HTML1枚なので配信はpython3で足りる
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },

  projects: [
    // 進行 (シーン / フレーズ / イベント)。AudioContext を動かすので Chromium のみ
    {
      name: 'transport-chromium',
      testMatch: /transport\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    // macOS相当。3カラムのデスクトップレイアウト
    {
      name: 'desktop-chromium',
      testMatch: /interaction\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // iOS相当。英語は日本語より文字列が長く、ヘッダーが折り返す危険が一番高い幅なので
    // 狭幅の検証は英語で走らせる
    {
      name: 'mobile-webkit',
      testMatch: /interaction\.spec\.js/,
      use: { ...devices['iPhone 14'], locale: 'en-US' },
    },
    {
      name: 'i18n-chromium',
      testMatch: /i18n\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
