const FAN_LEVELS = ['low', 'medium', 'high'];
const BRIGHTNESS_STEP = 10;
const TEMPERATURE_STEP = 2;
// 要件14.3の安全制限。極端な明るさ・室温にはしない。
const BRIGHTNESS_RANGE = [0, 100];
const TEMPERATURE_RANGE = [18, 30];

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

function shiftBrightness(scene, delta) {
  const current = Number(scene.light?.brightness);
  if (!Number.isFinite(current)) return;
  scene.light.brightness = clamp(current + delta, BRIGHTNESS_RANGE);
}

function shiftFan(scene, delta) {
  const index = FAN_LEVELS.indexOf(scene.fan);
  if (index === -1) return;
  scene.fan = FAN_LEVELS[clamp(index + delta, [0, FAN_LEVELS.length - 1])];
}

function shiftTemperature(scene, delta) {
  const current = Number(scene.temperature);
  if (!Number.isFinite(current)) return;
  scene.temperature = clamp(current + delta, TEMPERATURE_RANGE);
}

const RULES = [
  { match: (t) => t.includes('暗く'), apply: (s) => shiftBrightness(s, -BRIGHTNESS_STEP) },
  { match: (t) => t.includes('明るく'), apply: (s) => shiftBrightness(s, BRIGHTNESS_STEP) },
  { match: (t) => t.includes('風') && t.includes('強'), apply: (s) => shiftFan(s, 1) },
  { match: (t) => t.includes('風') && t.includes('弱'), apply: (s) => shiftFan(s, -1) },
  { match: (t) => t.includes('寒'), apply: (s) => shiftTemperature(s, TEMPERATURE_STEP) },
  { match: (t) => t.includes('暑'), apply: (s) => shiftTemperature(s, -TEMPERATURE_STEP) },
  // デモ台本（要件18 STEP5）「もう少し夕方っぽくして」: 照明↓・夕暮れ・風を少し強く
  {
    match: (t) => t.includes('夕方') || t.includes('夕暮れ'),
    apply: (s) => {
      shiftBrightness(s, -BRIGHTNESS_STEP);
      shiftFan(s, 1);
      s.time = 'sunset';
      if (s.light) s.light.color = 'warm';
    },
  },
];

// Replace this adapter with an LLM call when implementing issue #5.
export function mockAdjustScene(scene, text) {
  const next = structuredClone(scene);
  for (const rule of RULES) {
    if (rule.match(text)) rule.apply(next);
  }
  return next;
}
