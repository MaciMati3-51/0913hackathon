# ペアリング・シーン共有API（Issue #4）

既存の `APP_KV` bindingを使用。HTML側の担当は #8 / #9 / #10。
すべてJSONレスポンスで `Cache-Control: no-store` を返す。

| リクエスト | 成功時 |
| --- | --- |
| `POST /api/pair`（body不要） | 201: `{"code":"0123"}` |
| `GET /api/scene/0123` | 200: 初期状態は `{"connected":false}` |
| `POST /api/scene/0123`、body `{"connected":true}` | 200: 現在のシーンと `connected:true` |
| `POST /api/scene/0123`、bodyにシーンJSONを直接指定 | 200: 更新後のシーンと接続フラグ |

コードは先頭の0を含む4桁の**文字列**として保持する。
シーンは `/api/generate-scene` の結果をそのままPOSTする（`scene` ラッパーなし）。
GETは `visual`、`sound`、`light` などがトップレベルにある同じ形式。
スマホは `connected` だけの初期状態では映像を再生せず待機する。
POSTはトップレベルの部分更新。`light` などの入れ子オブジェクトは全体を置換する。
接続フラグはシーンとは別のKVキーに保存されるので、接続通知がシーンを消すことはない。
`connected` は接続通知済みを表すだけで、切断検出やハートビートではない。

不正JSON・コード形式・bodyは400、未発行コードは404、未対応メソッドは405（Allow付き）、
KV未設定・読み書き失敗・コード確保失敗は503。エラー形式は `{"error":"..."}`。
POSTが503なら読み直して状態を確認し、最新の操作を間隔を空けて再送する。

## ローカル確認

`npm ci && npm run dev` 後、PC役とスマホ役で同じコードを使用する。

```sh
curl -sS -X POST http://localhost:8788/api/pair
# 以下の0123を発行されたコードへ置換
curl -sS http://localhost:8788/api/scene/0123
curl -sS http://localhost:8788/api/scene/0123 -H 'Content-Type: application/json' -d '{"connected":true}'
curl -sS http://localhost:8788/api/scene/0123 -H 'Content-Type: application/json' -d '{"visual":"shonan_sunset","sound":"ocean_wave","light":{"brightness":20,"color":"warm"}}'
curl -sS http://localhost:8788/api/scene/0123
```

## KVの制約と実機確認

- スマホは1〜2秒間隔でGETする。ただしKVは結果整合性で、別の拠点からの読み取りには60秒以上の遅延があり得る。HTTPの `no-store` ではKV内部キャッシュを無効化できない。**1〜2秒以内の反映は保証できない**ため、実際のPC・スマホのネットワークで測定する。厳密な即時同期が必要ならDurable Objects等への設計変更が必要。
- 同じキーへの書き込み上限は1秒に1回。PCは連続操作をまとめ、1秒より長い間隔で最新シーンを送る。コード発行直後のシーン書き込みにも適用される。
- 発行済みコードは再抽選するが、KVには原子的な「未存在なら作成」がない。同時発行や別拠点の古いキャッシュによる衝突を完全には防げない。コード発行はデモ用に少人数で順次行う前提。
- 有効期限・認証はハッカソン仕様では設けない。コードを知るクライアントは読み書きできる。個人情報や秘密情報は保存しない。
- PCのシーン更新者は1台を想定。複数PCによる同時の部分更新は保証しない。シーンと接続フラグ両方を含むPOSTは2回の書き込みとなり、途中で失敗した場合は片方だけ反映されることがある。

公式資料: [KVの整合性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、[書き込み制約](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)。
