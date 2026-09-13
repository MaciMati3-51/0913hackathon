import Anthropic from '@anthropic-ai/sdk';
import { mockGenerateScene } from './scene-generator.js';
import { mockAdjustScene } from './scene-adjuster.js';

export const DEFAULT_MODEL = 'claude-sonnet-5';
// 要件14.2: シーン生成10秒以内・体験中の変更3秒以内。超えたらモックで即応答する。
const GENERATE_TIMEOUT_MS = 9000;
const ADJUST_TIMEOUT_MS = 3000;

const FAN_LEVELS = ['low', 'medium', 'high'];
const LIGHT_COLORS = ['warm', 'white', 'cool'];
// 映像・音は display.html が実素材にマッピングするため、素材が存在するキーだけ許可する。
const VISUALS = ['shonan_sunset'];
const SOUNDS = ['ocean_wave'];
const AROMAS = ['ocean', 'forest', 'summer_grass', 'festival', 'rain'];
const BRIGHTNESS_RANGE = [0, 100];
const TEMPERATURE_RANGE = [18, 30];

const SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['location', 'season', 'time', 'visual', 'sound', 'light', 'temperature', 'fan', 'aroma'],
  properties: {
    location: { type: 'string', description: '場所（日本語）' },
    season: { type: 'string', enum: ['spring', 'summer', 'autumn', 'winter'] },
    time: { type: 'string', enum: ['morning', 'day', 'sunset', 'night'] },
    visual: { type: 'string', enum: VISUALS },
    sound: { type: 'string', enum: SOUNDS },
    light: {
      type: 'object',
      additionalProperties: false,
      required: ['brightness', 'color'],
      properties: {
        brightness: { type: 'integer', description: '0〜100 (%)' },
        color: { type: 'string', enum: LIGHT_COLORS },
      },
    },
    temperature: { type: 'integer', description: '室温 ℃。18〜30' },
    fan: { type: 'string', enum: FAN_LEVELS },
    aroma: { type: 'string', enum: AROMAS },
  },
};

const SYSTEM_GENERATE = `あなたは「季節文化メーカー」のシーン設計AIです。
ユーザーが自然言語で指定した「時代・場所・季節・時間帯・体験」を、室内の各デバイス設定を表すシーンJSONに変換します。
- 曖昧な指示でも、その情景として最も自然な値を決めてください。
- visual と sound は用意されている素材の中から最も近いものを選びます。
- 安全性・快適性を優先し、temperature は 24〜28 の範囲を基本にします。
- 夕方や夜は照明を暗く暖色に、昼は明るくします。`;

const SYSTEM_ADJUST = `あなたは「季節文化メーカー」の体験中アシスタントです。
現在のシーンJSONと、体験中のユーザーの発話を受け取り、更新後のシーンJSON全体を返します。
- 発話が意味する項目だけを変え、他の値は現在の値をそのまま維持します。
- 変更は控えめに: brightness は10前後、temperature は2℃前後、fan は1段階。
- 「夕方っぽく」「夜っぽく」などの雰囲気指示は、time・brightness・color・fan を組み合わせて表現します。
- 安全のため temperature は 18〜30 の範囲を超えないようにします。
- 発話がシーンと無関係なら現在のシーンをそのまま返します。`;

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

function toInt(value, range, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), range) : fallback;
}

// LLMの出力をデバイスが受け付ける範囲に矯正する。欠けた項目は base の値で埋める。
export function normalizeScene(candidate, base) {
  const scene = candidate && typeof candidate === 'object' ? candidate : {};
  const light = scene.light && typeof scene.light === 'object' ? scene.light : {};
  const baseLight = base.light ?? {};
  return {
    ...base,
    ...scene,
    location: typeof scene.location === 'string' && scene.location.trim() ? scene.location.trim() : base.location,
    season: pick(scene.season, ['spring', 'summer', 'autumn', 'winter'], base.season),
    time: pick(scene.time, ['morning', 'day', 'sunset', 'night'], base.time),
    visual: pick(scene.visual, VISUALS, base.visual),
    sound: pick(scene.sound, SOUNDS, base.sound),
    light: {
      brightness: toInt(light.brightness, BRIGHTNESS_RANGE, baseLight.brightness),
      color: pick(light.color, LIGHT_COLORS, baseLight.color),
    },
    temperature: toInt(scene.temperature, TEMPERATURE_RANGE, base.temperature),
    fan: pick(scene.fan, FAN_LEVELS, base.fan),
    aroma: pick(scene.aroma, AROMAS, base.aroma),
  };
}

function createClient(env, timeout) {
  if (!env?.ANTHROPIC_API_KEY) return null;
  // リトライすると応答目標を超えるので、失敗したら即モックに切り替える。
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout, maxRetries: 0 });
}

async function requestScene(client, model, system, userContent, base) {
  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: { type: 'json_schema', schema: SCENE_SCHEMA } },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error(`LLM returned no scene (stop_reason: ${response.stop_reason})`);
  }
  return normalizeScene(response.parsed_output, base);
}

async function withFallback(env, timeout, mock, run, options) {
  const client = options.client ?? createClient(env, timeout);
  if (!client) return { scene: mock(), source: 'mock' };
  try {
    return { scene: await run(client, env?.LLM_MODEL || DEFAULT_MODEL), source: 'llm' };
  } catch (error) {
    console.warn('LLM call failed, falling back to mock:', error?.message ?? error);
    return { scene: mock(), source: 'mock' };
  }
}

export function generateScene(text, env, options = {}) {
  const mock = () => mockGenerateScene(text);
  return withFallback(env, GENERATE_TIMEOUT_MS, mock, (client, model) =>
    requestScene(client, model, SYSTEM_GENERATE, `体験したいシーン: ${text}`, mock()), options);
}

export function adjustScene(scene, text, env, options = {}) {
  const mock = () => mockAdjustScene(scene, text);
  const userContent = `現在のシーン:\n${JSON.stringify(scene)}\n\n体験中の発話: ${text}`;
  return withFallback(env, ADJUST_TIMEOUT_MS, mock, (client, model) =>
    requestScene(client, model, SYSTEM_ADJUST, userContent, scene), options);
}
