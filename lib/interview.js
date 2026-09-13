import { generateScene, llmConfig, requestJSON } from './llm.js';

// docs/interview-flow.md: 質問は家電の値が変わる軸だけ。質問文・選択肢・プレビュー値はコードで固定する。
export const MAX_QUESTIONS = 3;
const ASK_ORDER = ['time', 'density', 'body'];
export const DEFAULTS = { subject: 'beach', time: 'sunset', density: 'quiet', body: 'mild' };
const EXTRACT_TIMEOUT_MS = 3000;

export const CHIPS = [
  { id: 'chip_quiet_beach', label: 'ひとりで静かに海を見たい', slots: { subject: 'beach', density: 'quiet' } },
  { id: 'chip_lively', label: '友達と賑やかに', slots: { density: 'lively', time: 'day' } },
  { id: 'chip_sunset', label: '夕暮れをぼーっと眺めたい', slots: { time: 'sunset', density: 'quiet' } },
  { id: 'chip_night_breeze', label: '夜風にあたりたい', slots: { time: 'night', body: 'cool' } },
];

// preview は選択時に scene へそのまま上書きする値。表示文言と実際の家電値を食い違わせない。
export const QUESTIONS = {
  time: {
    text: '空はどのくらいの時間？',
    options: [
      { id: 'day', label: 'まだ明るい昼', previewText: '照明 60% / 白色', preview: { time: 'day', light: { brightness: 60, color: 'white' } } },
      { id: 'sunset', label: '陽が落ちる夕方', previewText: '照明 20% / 暖色', preview: { time: 'sunset', light: { brightness: 20, color: 'warm' } } },
      { id: 'night', label: 'もう暗い夜', previewText: '照明 8% / 暖色', preview: { time: 'night', light: { brightness: 8, color: 'warm' } } },
    ],
  },
  density: {
    text: 'まわりに人はいてほしい？',
    options: [
      { id: 'quiet', label: '波の音だけ', previewText: '音：波', preview: { sound: 'ocean_wave' } },
      { id: 'lively', label: '海風の吹くにぎやかな浜', previewText: '音：波 ＋ 海風', preview: { sound: 'ocean_wave_breeze' } },
    ],
  },
  body: {
    text: '体はどうしたい？',
    options: [
      { id: 'cool', label: '涼しく、風を感じたい', previewText: 'エアコン 24℃ / 扇風機 中', preview: { temperature: 24, fan: 'medium' } },
      { id: 'mild', label: 'ぬるい夏の空気のまま', previewText: 'エアコン 27℃ / 扇風機 弱', preview: { temperature: 27, fan: 'low' } },
    ],
  },
};

const SLOT_VALUES = {
  subject: ['beach', 'festival'],
  time: ['day', 'sunset', 'night'],
  density: ['quiet', 'lively'],
  body: ['cool', 'mild'],
};

// 順序が優先度。「夜風」は night と cool の両方に、「夕暮れ」は sunset に当たる。
const KEYWORD_RULES = [
  ['time', 'night', /夜|星空|月明かり/],
  ['time', 'sunset', /夕|日が落|暮れ|サンセット|マジックアワー/],
  ['time', 'day', /昼|日中|真っ青|明るい空|午後/],
  ['density', 'lively', /賑|にぎ|友達|友人|家族|みんな|人の声|ざわめ|はしゃ/],
  ['density', 'quiet', /静か|ひとり|一人|だけで|ぼーっと|のんびり|誰もいない|人のいない/],
  ['body', 'cool', /涼し|風にあた|夜風|冷た|ひんや|クール/],
  ['body', 'mild', /ぬる|暖か|温か|そのまま|生ぬる|むわっ/],
  ['subject', 'festival', /祭|花火|屋台|縁日/],
  ['subject', 'beach', /海|浜|波|ビーチ|湘南|砂/],
];

const SLOTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'time', 'density', 'body'],
  properties: {
    subject: { type: ['string', 'null'], enum: ['beach', 'festival', null], description: '題材。海辺なら beach、祭り・花火なら festival' },
    time: { type: ['string', 'null'], enum: ['day', 'sunset', 'night', null], description: '時間帯' },
    density: { type: ['string', 'null'], enum: ['quiet', 'lively', null], description: '人の気配。静か=quiet、にぎやか=lively' },
    body: { type: ['string', 'null'], enum: ['cool', 'mild', null], description: '体感。涼しくしたい=cool、ぬるい空気のまま=mild' },
  },
};

const SYSTEM_EXTRACT = `ユーザーが「どんな雰囲気の中にいたいか」を述べた短い文から、明示または強く示唆されている項目だけを抜き出します。
読み取れない項目は必ず null にしてください。推測で埋めないでください。`;

export function extractSlotsByKeywords(text) {
  const slots = {};
  for (const [axis, value, pattern] of KEYWORD_RULES) {
    if (!slots[axis] && pattern.test(text)) slots[axis] = value;
  }
  return slots;
}

function cleanSlots(candidate) {
  const slots = {};
  for (const [axis, values] of Object.entries(SLOT_VALUES)) {
    if (values.includes(candidate?.[axis])) slots[axis] = candidate[axis];
  }
  return slots;
}

async function extractSlots(text, env, options) {
  const config = llmConfig(env, options);
  if (!config) return { slots: extractSlotsByKeywords(text), source: 'mock' };
  try {
    const parsed = await requestJSON(config, {
      system: SYSTEM_EXTRACT, input: text, schema: SLOTS_SCHEMA, name: 'slots', timeout: EXTRACT_TIMEOUT_MS,
    });
    return { slots: cleanSlots(parsed), source: 'llm' };
  } catch (error) {
    console.warn('Slot extraction failed, using keywords:', error?.message ?? error);
    return { slots: extractSlotsByKeywords(text), source: 'mock' };
  }
}

// チップID・選択肢ID・選択肢の文言はLLMを通さず確定させる。
function resolveFixedAnswer(answer) {
  const chip = CHIPS.find((c) => c.id === answer || c.label === answer);
  if (chip) return { ...chip.slots };
  for (const [axis, question] of Object.entries(QUESTIONS)) {
    const option = question.options.find((o) => o.id === answer || o.label === answer);
    if (option) return { [axis]: option.id };
  }
  return null;
}

export function nextAxis(slots, asked) {
  const unresolved = ASK_ORDER.filter((axis) => !slots[axis]);
  const remaining = MAX_QUESTIONS - asked;
  if (!unresolved.length || remaining <= 0) return null;
  // body は唯一AIが当てられない軸なので、最後の1問は必ず body に残す
  if (unresolved.includes('body') && (remaining === 1 || unresolved.length === 1)) return 'body';
  return unresolved.find((axis) => axis !== 'body') ?? 'body';
}

export function questionFor(axis) {
  const { text, options } = QUESTIONS[axis];
  return { axis, text, options: options.map(({ id, label, previewText, preview }) => ({ id, label, previewText, preview })) };
}

const TIME_JA = { day: '昼', sunset: '夕暮れ', night: '夜' };
const DENSITY_JA = { quiet: 'ほかに人はいない静かな浜', lively: '海風が吹き、にぎわいのある浜' };
const BODY_JA = { cool: '涼しい風にあたって過ごす', mild: 'ぬるい夏の空気のまま過ごす' };
const SUMMARY_DENSITY = { quiet: '人のいない', lively: 'にぎやかな' };
const SUMMARY_BODY = { cool: '涼しい風にあたる', mild: 'ぬるい空気に浸る' };

export function synthesizeText(slots) {
  return `2026年8月の${TIME_JA[slots.time]}の湘南の海。${DENSITY_JA[slots.density]}。${BODY_JA[slots.body]}。`;
}

export function summarize(slots) {
  return `${SUMMARY_DENSITY[slots.density]}${TIME_JA[slots.time]}の海で、${SUMMARY_BODY[slots.body]}`;
}

function optionPreview(axis, id) {
  return QUESTIONS[axis].options.find((o) => o.id === id).preview;
}

// 選択肢に見せた家電値を LLM の出力より優先する（プレビューと実機値の一致）。
export function applyPresets(scene, slots) {
  return {
    ...scene,
    ...optionPreview('time', slots.time),
    ...optionPreview('density', slots.density),
    ...optionPreview('body', slots.body),
  };
}

async function finish(slots, env, options) {
  const defaults = ASK_ORDER.filter((axis) => !slots[axis]);
  const resolved = { ...DEFAULTS, ...slots };
  const { scene, source } = await generateScene(synthesizeText(resolved), env, options);
  return {
    done: true,
    summary: summarize(resolved),
    defaults,
    scene: applyPresets(scene, resolved),
    source,
  };
}

export async function interview(state, answer, env, options = {}) {
  const asked = Number.isInteger(state?.turn) && state.turn > 0 ? state.turn : 1;
  const previous = cleanSlots(state?.slots);
  const fixed = resolveFixedAnswer(answer);
  const extracted = fixed ? { slots: fixed, source: 'fixed' } : await extractSlots(answer, env, options);
  const slots = { ...previous, ...extracted.slots };

  const axis = nextAxis(slots, asked);
  if (!axis) {
    const result = await finish(slots, env, options);
    return { state: { turn: asked, slots }, ...result };
  }
  return { state: { turn: asked + 1, slots }, done: false, question: questionFor(axis) };
}
