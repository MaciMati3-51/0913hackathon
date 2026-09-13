// 結合テスト: PC操作画面(index.html) → デバイス設定(pair.html) → スマホ表示(display.html)
// usage: node integration.mjs <baseUrl>
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:8792').replace(/\/$/, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const browser = await chromium.launch();
const pcCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pc = await pcCtx.newPage();
const phone = await phoneCtx.newPage();
pc.on('pageerror', (e) => fail(`PC page error: ${e.message}`));
phone.on('pageerror', (e) => fail(`phone page error: ${e.message}`));

try {
  // 1. PC: デバイス設定画面でコード発行
  await pc.goto(`${base}/pair.html`);
  await pc.waitForFunction(() => /^\d{4}$/.test(document.getElementById('code').textContent.trim()), null, { timeout: 15000 });
  const code = (await pc.textContent('#code')).trim();
  log('pair code', code);
  const stored = await pc.evaluate(() => localStorage.getItem('pairingCode'));
  if (stored !== code) fail(`pairingCode not stored in localStorage (got ${stored})`);

  // 2. スマホ: QRのURLで接続 → pair.html が接続済みになる
  await phone.goto(`${base}/display.html?code=${code}`);
  await pc.waitForSelector('#status.connected', { timeout: 15000 });
  log('pair.html shows connected');
  if (!(await phone.isHidden('#formScreen'))) fail('phone still shows code form');

  // 3. PC: ホームに戻り、シーン生成 → 体験開始
  await pc.goto(`${base}/`);
  await pc.waitForFunction(() => /接続済み/.test(document.getElementById('pairStatus').textContent), null, { timeout: 10000 })
    .catch(() => fail('PC home does not show phone as connected'));
  log('PC pair status pill:', (await pc.textContent('#pairStatus')).trim());
  // ヒアリング: チップ（time=sunset, density=quiet）→ Q2 は body → 選択で完了（2問）
  await pc.evaluate(() => localStorage.removeItem('pref.body'));
  await pc.click('button[data-chip="chip_sunset"]');
  await pc.waitForSelector('#interviewView.is-active', { timeout: 15000 });
  log('interview question:', (await pc.textContent('#questionTitle')).trim(), '|', (await pc.textContent('#interviewStep')).trim());
  if (!/体はどうしたい/.test(await pc.textContent('#questionTitle'))) fail('expected the body question after the sunset chip');
  await pc.click('button[data-option="cool"]');
  await pc.waitForSelector('#sceneView.is-active', { timeout: 20000 });
  log('summary:', (await pc.textContent('#sceneSummary')).trim());
  log('scene generated:', (await pc.textContent('#sceneLocation')).trim(), '/', (await pc.textContent('#lightSpec')).trim(), '/', (await pc.textContent('#temperatureSpec')).trim(), (await pc.textContent('#windSpec')).trim());
  if (!/20%/.test(await pc.textContent('#lightSpec'))) fail('preset light 20% not applied');
  if (!/24℃/.test(await pc.textContent('#temperatureSpec'))) fail('preset temperature 24℃ not applied');
  if (await pc.evaluate(() => localStorage.getItem('pref.body')) !== 'cool') fail('body preference not remembered');
  await pc.click('#startExperience');
  await pc.waitForSelector('#experienceView.is-active');

  // 4. スマホ: 映像・音が切り替わる（ポーリング1.5秒）
  await phone.waitForFunction(() => document.getElementById('video').src.includes('scene1-shonan-sunset'), null, { timeout: 10000 });
  const audioSrc = await phone.evaluate(() => document.getElementById('audio').src);
  log('phone video src set; audio src:', audioSrc.split('/').pop());
  if (!audioSrc.includes('scene1-ocean-waves')) fail('phone audio src not set');
  log('phone scene label:', (await phone.textContent('#sceneName')).trim());
  const before = await phone.evaluate(() => document.getElementById('video').style.filter);
  log('phone filter:', before, '| audio2:', await phone.evaluate(() => document.getElementById('audio2').getAttribute('src') ?? '(none)'));
  if (!/sepia/.test(before)) fail('sunset time filter not applied on phone');

  // 5. PC: 会話で暗くする → スマホの明るさフィルタが下がる
  const lightBefore = (await pc.textContent('#lightValue')).trim();
  await pc.fill('#chatInput', 'もう少し暗くして');
  await pc.click('#sendButton');
  await pc.waitForFunction((prev) => document.getElementById('lightValue').textContent.trim() !== prev, lightBefore, { timeout: 15000 });
  const lightAfter = (await pc.textContent('#lightValue')).trim();
  log(`PC light ${lightBefore} -> ${lightAfter}`);
  await phone.waitForFunction((prev) => document.getElementById('video').style.filter !== prev, before, { timeout: 10000 });
  log(`phone video filter ${before} -> ${await phone.evaluate(() => document.getElementById('video').style.filter)}`);

  // 6. 実データ確認: KV上のシーン
  const state = await pc.evaluate(async (c) => (await fetch(`/api/scene/${c}`)).json(), code);
  log('KV scene:', JSON.stringify(state));
  if (state.visual !== 'shonan_sunset' || state.connected !== true) fail('KV state mismatch');
  if (Number(state.light?.brightness) >= Number(lightBefore)) fail('brightness in KV did not decrease');

  log(process.exitCode ? 'INTEGRATION TEST FAILED' : 'INTEGRATION TEST PASSED');
} catch (error) {
  fail(error.message);
  await pc.screenshot({ path: 'pc-fail.png' }).catch(() => {});
  await phone.screenshot({ path: 'phone-fail.png' }).catch(() => {});
} finally {
  await browser.close();
}
