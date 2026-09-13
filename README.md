# 0913hackathon

PC操作画面・デバイス設定画面・スマホ表示画面とCloudflare Pages Functionsの土台です。

## URL

| 用途 | URL |
| --- | --- |
| 開発・PC操作画面 | http://localhost:8788/ |
| 開発・デバイス設定画面 | http://localhost:8788/pair.html |
| 開発・スマホ表示画面 | http://localhost:8788/display.html |
| 本番 | https://0913hackathon.pages.dev |

本番のデバイス設定画面: https://0913hackathon.pages.dev/pair.html

本番のスマホ表示画面: https://0913hackathon.pages.dev/display.html

GitHubリポジトリとproduction branch `main` は設定済み。初回デプロイはAPIから起動し、約27秒で成功しました。本番3画面とKV読み取りを確認済みです。

GitHubアプリのリポジトリアクセス認可済み。`main` のpushを本番、その他のブランチのpushをプレビューへ自動デプロイする設定です。

## ローカル開発

Node.js 22以上を使用します。

```sh
npm ci
npm run dev
```

`npm run dev` は静的ファイルを `dist/` にコピーし、Pages Functionsとローカル専用の `APP_KV` を起動します。本番KV認証は不要です。HTMLやassetsの変更後は再起動してください。

```sh
npm run check
curl --fail http://localhost:8788/api/health
```

`/api/health` はKVの読み取りが成功したら `{"ok":true,"kv":"connected"}`、未設定・接続失敗なら503を返します。KVへの書き込みは行いません。

## 構造

```text
index.html           PC操作画面
pair.html            デバイス設定画面
display.html         スマホ表示画面
functions/api/       Pages Functions（env.APP_KVを使用）
assets/videos/       映像素材
assets/audio/        音声素材
scripts/build.mjs    公開するファイルだけをdist/へコピー
wrangler.toml        PagesとKVの設定
```

## KV設定

1. リポジトリのディレクトリでCloudflareへログインします。

   ```sh
   npx wrangler login
   npx wrangler kv namespace create APP_KV
   npx wrangler kv namespace create APP_KV_PREVIEW
   ```

2. 出力された実際のnamespace IDを `wrangler.toml` の対応するブロックへ記入します（このアカウント用のnamespaceは作成・設定済み）。

   ```toml
   [[kv_namespaces]]
   binding = "APP_KV"
   id = "作成した本番namespace ID"

   [[env.preview.kv_namespaces]]
   binding = "APP_KV"
   id = "作成したプレビューnamespace ID"
   ```

   binding名は両環境とも `APP_KV`。本番とプレビューのデータを分離します。namespace IDは設定値としてコミットします。APIトークンはコミットしないでください。

3. 設定をmainへpushして再デプロイします。`wrangler.toml` がバインディング設定の正本です。本番・プレビューのnamespaceは作成済みです。

## Cloudflare PagesのGitHub連携（初回）

1. Cloudflareダッシュボードの **Workers & Pages** で **Pages** を選択し、Gitリポジトリを接続してプロジェクトを作成します。
2. GitHub連携を認可し、`MaciMati3-51/0913hackathon` を選択します。
3. 以下で保存・デプロイします。

   | 設定 | 値 |
   | --- | --- |
   | プロジェクト名 | `0913hackathon`（使用可能な場合） |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | リポジトリルート |

4. Productionの自動デプロイを有効にします。以降mainへのpushでビルドとデプロイが実行されます。
5. 発行された本番URLをこのREADMEに記載し、以下を確認します。

   - `/`、`/pair.html`、`/display.html` の3画面が開く。
   - `/api/health` がHTTP 200と `kv: connected` を返す。
   - mainへの次のpushでDeploymentsに同じcommit SHAが表示され、ページ変更が反映される。

デプロイ時間はCloudflareの待ち行列・ビルド時間に依存します。数十秒での反映は実測して確認してください。

公式資料: [Git連携](https://developers.cloudflare.com/pages/get-started/git-integration/)、[Wrangler設定](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)、[KV bindings](https://developers.cloudflare.com/pages/functions/bindings/)。

## シーン生成API（モック / Issue #2）

```sh
curl --fail http://localhost:8788/api/generate-scene \
  -H 'Content-Type: application/json' \
  -d '{"text":"2026年8月の夕方の湘南の海にして"}'
```

`POST /api/generate-scene` はScene1のJSONを直接返します（`scene` 等のラッパーなし）。
「湘南」「海」「夕方」を含む入力も、それ以外・空文字の入力も同じScene1にフォールバックします。
不正なJSONや文字列ではない `text` は400、POST以外は405です。

生成処理は `lib/scene-generator.js` の `mockGenerateScene(text)` に分離しています。
Issue #5ではこのAdapterをLLM呼び出しへ差し替えます。現時点では外部API・KVを使用しません。

`npm test` で入力例、フォールバック、不正入力、メソッド制限を検証できます。

## 会話変更API（モック / Issue #3）

```sh
curl --fail http://localhost:8788/api/adjust-scene \
  -H 'Content-Type: application/json' \
  -d '{"scene":{"light":{"brightness":20,"color":"warm"},"temperature":26,"fan":"low"},"text":"もう少し暗くして"}'
```

`POST /api/adjust-scene` は `scene`（現在のシーンJSON）と `text`（体験中の発話）を受け取り、更新後のシーンJSONをそのまま返します（ラッパーなし）。
UI側は送信前のシーンと比較して「Brightness 20% → 10%」のような差分表示ができます。

| 発話に含まれる語 | 変更 |
| --- | --- |
| 暗く | `light.brightness` −10 |
| 明るく | `light.brightness` +10 |
| 風 + 強 | `fan` を1段階上げる（low → medium → high） |
| 風 + 弱 | `fan` を1段階下げる |
| 寒 | `temperature` +2℃ |
| 暑 | `temperature` −2℃ |
| 夕方 / 夕暮れ | `light.brightness` −10、`fan` 1段階上、`time: "sunset"`、`light.color: "warm"` |

複数の語を含む発話（「暗くして風を強くして」）は該当する変更を全て適用します。該当しない発話は入力のシーンをそのまま返します。
安全制限（要件14.3）として `light.brightness` は0〜100、`temperature` は18〜30℃にクランプします。
`scene` がオブジェクトでない、`text` が文字列でない場合は400、POST以外は405です。

判定処理は `lib/scene-adjuster.js` の `mockAdjustScene(scene, text)` に分離しています。Issue #5でLLM呼び出しへ差し替えます。
