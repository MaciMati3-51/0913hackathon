import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustScene, generateScene, normalizeScene, DEFAULT_MODEL } from '../lib/llm.js';
import { onRequest as generateRequest } from '../functions/api/generate-scene.js';
import { onRequest as adjustRequest } from '../functions/api/adjust-scene.js';

const scene1 = () => ({
  location: '湘南', season: 'summer', time: 'sunset',
  visual: 'shonan_sunset', sound: 'ocean_wave',
  light: { brightness: 20, color: 'warm' },
  temperature: 26, fan: 'low', aroma: 'ocean',
});

const llmScene = () => ({
  location: '鎌倉', season: 'summer', time: 'night',
  visual: 'shonan_sunset', sound: 'ocean_wave',
  light: { brightness: 10, color: 'warm' },
  temperature: 25, fan: 'medium', aroma: 'festival',
});

function fakeClient(handler) {
  const calls = [];
  return {
    calls,
    messages: { parse: async (params) => { calls.push(params); return handler(params); } },
  };
}

const ok = (parsed) => ({ stop_reason: 'end_turn', parsed_output: parsed });

test('generateScene uses mock when no API key is configured', async () => {
  const result = await generateScene('湘南の海', {});
  assert.deepEqual(result, { scene: scene1(), source: 'mock' });
});

test('generateScene returns the LLM scene with json_schema output and the default model', async () => {
  const client = fakeClient(() => ok(llmScene()));
  const result = await generateScene('夏の夜の鎌倉', { ANTHROPIC_API_KEY: 'k' }, { client });
  assert.deepEqual(result, { scene: llmScene(), source: 'llm' });
  const params = client.calls[0];
  assert.equal(params.model, DEFAULT_MODEL);
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.deepEqual(params.thinking, { type: 'disabled' });
  assert.match(params.messages[0].content, /夏の夜の鎌倉/);
});

test('LLM_MODEL env overrides the model', async () => {
  const client = fakeClient(() => ok(llmScene()));
  await generateScene('海', { ANTHROPIC_API_KEY: 'k', LLM_MODEL: 'claude-opus-5' }, { client });
  assert.equal(client.calls[0].model, 'claude-opus-5');
});

test('generateScene falls back to mock when the LLM throws', async () => {
  const client = fakeClient(() => { throw new Error('timeout'); });
  const result = await generateScene('海', { ANTHROPIC_API_KEY: 'k' }, { client });
  assert.deepEqual(result, { scene: scene1(), source: 'mock' });
});

test('generateScene falls back to mock on refusal or empty parsed output', async () => {
  for (const response of [{ stop_reason: 'refusal', parsed_output: null }, { stop_reason: 'end_turn', parsed_output: null }]) {
    const client = fakeClient(() => response);
    const result = await generateScene('海', { ANTHROPIC_API_KEY: 'k' }, { client });
    assert.equal(result.source, 'mock');
  }
});

test('adjustScene sends the current scene and utterance, returns the LLM scene', async () => {
  const client = fakeClient(() => ok({ ...scene1(), light: { brightness: 10, color: 'warm' } }));
  const result = await adjustScene(scene1(), 'もう少し暗くして', { ANTHROPIC_API_KEY: 'k' }, { client });
  assert.equal(result.source, 'llm');
  assert.equal(result.scene.light.brightness, 10);
  assert.match(client.calls[0].messages[0].content, /"brightness":20/);
  assert.match(client.calls[0].messages[0].content, /もう少し暗くして/);
});

test('adjustScene falls back to keyword mock when the LLM fails', async () => {
  const client = fakeClient(() => { throw new Error('boom'); });
  const result = await adjustScene(scene1(), 'もう少し暗くして', { ANTHROPIC_API_KEY: 'k' }, { client });
  assert.deepEqual(result, { scene: { ...scene1(), light: { brightness: 10, color: 'warm' } }, source: 'mock' });
});

test('normalizeScene clamps and repairs out-of-range LLM output', () => {
  const normalized = normalizeScene({
    location: '  ', season: 'monsoon', time: 'dusk', visual: 'festival_night', sound: 'cicada',
    light: { brightness: 140.7, color: 'purple' }, temperature: 5, fan: 'turbo', aroma: 'curry',
  }, scene1());
  assert.deepEqual(normalized, {
    ...scene1(),
    light: { brightness: 100, color: 'warm' },
    temperature: 18,
  });
});

test('normalizeScene fills missing fields from the base scene', () => {
  assert.deepEqual(normalizeScene({ temperature: 24 }, scene1()), { ...scene1(), temperature: 24 });
  assert.deepEqual(normalizeScene(null, scene1()), scene1());
});

function post(handler, path, body) {
  return handler({
    request: new Request(`http://localhost${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    env: {},
  });
}

test('API responses expose the scene source header (mock without key)', async () => {
  const generated = await post(generateRequest, '/api/generate-scene', { text: '海' });
  assert.equal(generated.headers.get('X-Scene-Source'), 'mock');
  assert.deepEqual(await generated.json(), scene1());

  const adjusted = await post(adjustRequest, '/api/adjust-scene', { scene: scene1(), text: '暑い' });
  assert.equal(adjusted.headers.get('X-Scene-Source'), 'mock');
  assert.equal((await adjusted.json()).temperature, 24);
});
