# テスト

```
npm install
npx playwright install chromium webkit
npm test
```

`playwright.config.js` が `python3 -m http.server` で `index.html` を配信する。
ポートは 8124 で、elevator-one (8123) と同時に走らせても衝突しない。

## 何を見ているか

| ファイル | 対象 |
| --- | --- |
| `tests/transport.spec.js` | 進行。小節が進む、16小節でフレーズが変わる、4小節の節目にイベントが出る、シーンの切り替え |
| `tests/i18n.spec.js` | ja / en のキー集合の一致、切り替えと保存 |
| `tests/interaction.spec.js` | レイアウト。3カラムと狭幅タブ、XY パッドの操作、スクロールしないこと |

## 気をつけること

- **進行のテストは実時間がかかる**。1小節は 1.6〜1.9 秒で、フレーズの16小節は30秒近い。
  待ち時間を詰めるため BPM スライダーを上げ、速いシーンを選んでから再生している
- **イベントの発火は確率**。判定機会を十分な回数与えないと取りこぼす。
  最速のシーン (疾走) + BPM 140 で4小節あたり6秒台まで詰めてある
- 音の検証はまだ無い。音源を足したら elevator-one の `tests/helpers/audio.js`
  (AudioNode.prototype.connect を包んで波形を覗く) を持ってくる
