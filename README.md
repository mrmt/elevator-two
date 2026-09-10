# Elevator Two

自動生成のエレクトロを鳴らし続けるシングルファイルの楽器。
[elevator-one](https://github.com/mrmt/elevator-one) の技術的な骨格を踏襲しつつ、音楽的には別物を目指す。

**現在の状態: 設計中。実装はまだない。**

設計の議論と決定は [docs/DESIGN.md](docs/DESIGN.md) に集約している。

## elevator-one との関係

| | elevator-one | elevator-two |
| --- | --- | --- |
| 音楽 | アンビエント / ミニマル / ドローン | エレクトロ (minimal techno を土台に electro funk / dub techno / グリッチを混ぜる) |
| 時間軸 | 漂い続ける。明確な展開を持たない | 数分ごとの曲調変化と、4 / 8 / 16 小節ごとのブレイク |
| リズム | 独立した16ステップシーケンサ1系統 | 4つ打ちを基本とする多トラック構成 (生成方式は検討中) |
| 実装 | 単一 `index.html`、ビルド工程なし | 同左を踏襲 |

コードは共有せず、one から土台をコピーして分岐させる。共通化のための仕組みは持たない。

## ライセンス

MIT
