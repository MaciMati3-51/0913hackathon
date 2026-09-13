# 0913hackathon

PC操作画面・デバイス設定画面・スマホ表示画面とCloudflare Pages Functionsの土台です。

## URL

| 用途 | URL |
| --- | --- |
| 開発・PC操作画面 | http://localhost:8788/ |
| 開発・デバイス設定画面 | http://localhost:8788/pair.html |
| 開発・スマホ表示画面 | http://localhost:8788/display.html |
| 本番 | **未作成・未確認**。Pages作成後にダッシュボードが発行するURLをここへ記載 |

プロジェクト名に `0913hackathon` が使用できた場合、本番URLは `https://0913hackathon.pages.dev` となる想定です。作成前のため確定URLではありません。

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
