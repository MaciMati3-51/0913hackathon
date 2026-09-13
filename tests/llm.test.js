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

function fakeFetch(handler) {
  const calls = [];
  return { calls, fetcher: async (url, init) => {
    calls.push({ url, ...init, body: JSON.parse(init.body) });
    return handler({ url, ...init, body: JSON.parse(init.body) });
  } };
}

const ok = (parsed) => new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(parsed) }));
const okRestShape = (parsed) => new Response(JSON.stringify({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }],
}));

test('generateScene uses mock when no API key is configured', async () => {
  const result = await generateScene('湘南の海', {});
  assert.deepEqual(result, { scene: scene1(), source: 'mock' });
});

test('generateScene returns the LLM scene with OpenAI Structured Outputs and the default model', async () => {
  const client = fakeFetch(() => ok(llmScene()));
  const result = await generateScene('夏の夜の鎌倉', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
  assert.deepEqual(result, { scene: llmScene(), source: 'llm' });
  const params = client.calls[0];
  assert.equal(params.url, 'https://api.openai.com/v1/responses');
  assert.equal(params.headers.Authorization, 'Bearer k');
  assert.equal(params.body.model, DEFAULT_MODEL);
  assert.equal(params.body.text.format.type, 'json_schema');
  assert.equal(params.body.text.format.strict, true);
  assert.equal(params.body.store, false);
  assert.match(params.body.input, /夏の夜の鎌倉/);
});

test('LLM_MODEL env overrides the model', async () => {
  const client = fakeFetch(() => ok(llmScene()));
  await generateScene('海', { OPENAI_API_KEY: 'k', LLM_MODEL: 'gpt-4.1' }, { fetcher: client.fetcher });
  assert.equal(client.calls[0].body.model, 'gpt-4.1');
});

test('generateScene parses the raw Responses API output array', async () => {
  const client = fakeFetch(() => okRestShape(llmScene()));
  const result = await generateScene('鎌倉', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
  assert.deepEqual(result, { scene: llmScene(), source: 'llm' });
});

test('generateScene falls back to mock when the LLM throws', async () => {
  const client = fakeFetch(() => { throw new Error('timeout'); });
  const result = await generateScene('海', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
  assert.deepEqual(result, { scene: scene1(), source: 'mock' });
});

test('generateScene falls back to mock on an incomplete response or invalid JSON', async () => {
  for (const response of [
    new Response(JSON.stringify({ status: 'incomplete' })),
    new Response(JSON.stringify({ status: 'completed', output_text: 'not json' })),
  ]) {
    const client = fakeFetch(() => response);
    const result = await generateScene('海', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
    assert.equal(result.source, 'mock');
  }
});

test('adjustScene sends the current scene and utterance, returns the LLM scene', async () => {
  const client = fakeFetch(() => ok({ ...scene1(), light: { brightness: 10, color: 'warm' } }));
  const result = await adjustScene(scene1(), 'もう少し暗くして', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
  assert.equal(result.source, 'llm');
  assert.equal(result.scene.light.brightness, 10);
  assert.match(client.calls[0].body.input, /"brightness":20/);
  assert.match(client.calls[0].body.input, /もう少し暗くして/);
});

test('adjustScene falls back to keyword mock when the LLM fails', async () => {
  const client = fakeFetch(() => { throw new Error('boom'); });
  const result = await adjustScene(scene1(), 'もう少し暗くして', { OPENAI_API_KEY: 'k' }, { fetcher: client.fetcher });
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
