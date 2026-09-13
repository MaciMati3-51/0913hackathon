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

## デモ手順（PC → スマホ）

1. PCで `/pair.html` を開く。4桁コードとQRが表示され、コードは `localStorage` に保存される（再読み込みしても同じコードを使い回す。「別のコードを発行する」で更新）
2. スマホでQRを読む（または `/display.html?code=XXXX` を開く）。pair.html が「接続済み」になる
3. PCで「← PC操作画面へ戻る」→ トップバーに「📱 スマホ接続済み · コード XXXX」が出る
4. 雰囲気をひとこと入力するかチップをタップ → AIが最大3問（時間帯・人の気配・体感）を聞く。選択肢の下の値がそのまま家電に設定される → 要約「〜でいい？」→「この季節を体験する」。この時点でシーンが `POST /api/scene/XXXX` に送られ、スマホが1.5秒以内に映像・音を再生する（スマホは最初に1回タップして再生を許可）
5. 体験中のチャット（「もう少し暗くして」等）は毎回シーンを送り直すので、スマホの映像の明るさも追従する

### 結合テスト（自動）

`scripts/e2e-integration.mjs` が Playwright（ヘッドレスChromium）で PC画面とスマホ画面を同時に動かし、コード発行 → 接続 → ヒアリング → 体験開始 → スマホの映像・音 → 会話変更の追従まで確認する。

```sh
npx playwright install chromium        # 初回のみ
npm run dev                            # 別ターミナルでローカルを起動する場合
npm run test:e2e -- http://localhost:8788
npm run test:e2e -- https://0913hackathon.pages.dev
```

`INTEGRATION TEST PASSED` が出れば通し動作OK。失敗時は `pc-fail.png` / `phone-fail.png` にスクリーンショットが残る。

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
pair.html            デバイス設定画面（スマホとのペアリング）
display.html         スマホ表示画面
devices.html         家電設定画面（6台の一覧。TV・スピーカーはスマホ代替の接続状態、他は仮想デバイス表示）
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
`OPENAI_API_KEY` が設定されていれば LLM（後述「LLM接続」）が使われ、未設定・失敗時はこのモックにフォールバックします。

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

判定処理は `lib/scene-adjuster.js` の `mockAdjustScene(scene, text)` に分離しています。`OPENAI_API_KEY` があれば LLM が優先され、失敗時はこのモックにフォールバックします。

## 雰囲気ヒアリングAPI（Issue #23 / docs/interview-flow.md）

`POST /api/interview` は、シーン確認の前に最大3問で雰囲気（`time` / `density` / `body`）を詰めます。state はクライアントが持ち回り、KV は使いません。

```sh
curl --fail http://localhost:8788/api/interview \
  -H 'Content-Type: application/json' \
  -d '{"state":{"turn":1,"slots":{}},"answer":"chip_sunset"}'
# → {"state":{"turn":2,"slots":{"time":"sunset","density":"quiet"}},"done":false,"question":{"axis":"body",...}}
curl --fail http://localhost:8788/api/interview \
  -H 'Content-Type: application/json' \
  -d '{"state":{"turn":2,"slots":{"time":"sunset","density":"quiet"}},"answer":"cool"}'
# → {"state":{...},"done":true,"summary":"人のいない夕暮れの海で、涼しい風にあたる","defaults":[],"scene":{...},"source":"mock|llm"}
```

- Q1（自由文）: チップID/文言や選択肢IDはそのまま確定。自由文は `OPENAI_API_KEY` があれば LLM（strict JSON Schema、3秒）で抽出、無い・失敗時はキーワード判定
- Q2/Q3 の質問文・選択肢・家電プレビュー値は `lib/interview.js` の固定テーブル。次に聞く軸は `time → density → body` の順で、最後の1問は必ず `body`
- 3問で埋まらない軸は既定値（sunset / quiet / mild）で埋め、`defaults` に列挙して UI で「AIが決めました」と表示
- 完了時は合成文を `generateScene` に渡し、選択肢で見せた値（照明・音・室温・風）で上書きする。`sound: ocean_wave_breeze` は display.html で波＋海風の2レイヤー再生、`time` は映像の色味フィルタで表現
- `body` は index.html が `localStorage`（`pref.body`）に保存し、2回目以降は聞かない（質問が3問→2問に減る）

## LLM接続（Issue #5）

`lib/llm.js` が `POST /api/generate-scene` と `POST /api/adjust-scene` の本体です。

- モデル: GPT-4.1 mini（`gpt-4.1-mini`、`wrangler.toml` の `LLM_MODEL` で変更可）
- OpenAI Responses API の Structured Outputs（JSON Schema）でシーンJSONの形を強制
- 出力は `normalizeScene` で安全範囲に矯正: `light.brightness` 0〜100、`temperature` 18〜30、`fan` は low/medium/high、`visual`/`sound` は素材が存在するキーのみ
- タイムアウト: シーン生成 9秒、会話変更 3秒（要件14.2）。リトライなし
- `OPENAI_API_KEY` 未設定・API エラー・タイムアウト・不完全な応答のときは既存モックにフォールバック。レスポンス本文の形は変わらない
- どちらが応答したかはレスポンスヘッダ `X-Scene-Source: llm | mock` で確認できる

### APIキーの設定

キーはコードに書かず、Cloudflare Pages の secret とローカルの `.dev.vars` に入れます（どちらも git 管理外）。

```sh
# 本番（Cloudflare Pages の secret）
npx wrangler pages secret put OPENAI_API_KEY --project-name 0913hackathon

# ローカル開発
echo 'OPENAI_API_KEY=sk-...' > .dev.vars
npm run dev
```

secret 登録後は次のデプロイから有効です。動作確認:

```sh
curl -si https://0913hackathon.pages.dev/api/generate-scene \
  -H 'Content-Type: application/json' \
  -d '{"text":"昭和の夏休みの夕方"}' | grep -i -E 'x-scene-source|location'
```

`X-Scene-Source: llm` になり、モックにない入力でも `location` 等がそれらしく変わればLLM接続が効いています。
