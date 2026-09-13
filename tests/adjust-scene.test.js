import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/adjust-scene.js';
import { mockAdjustScene } from '../lib/scene-adjuster.js';

const scene1 = () => ({
  location: '湘南', season: 'summer', time: 'sunset',
  visual: 'shonan_sunset', sound: 'ocean_wave',
  light: { brightness: 20, color: 'warm' },
  temperature: 26, fan: 'low', aroma: 'ocean',
});

function post(body) {
  return onRequest({ request: new Request('http://localhost/api/adjust-scene', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }) });
}

const cases = [
  ['もう少し暗くして', {}, { light: { brightness: 10, color: 'warm' } }],
  ['明るくして', {}, { light: { brightness: 30, color: 'warm' } }],
  ['風を強くして', {}, { fan: 'medium' }],
  ['風を強くして', { fan: 'medium' }, { fan: 'high' }],
  ['風を強くして', { fan: 'high' }, { fan: 'high' }],
  ['風を弱くして', { fan: 'medium' }, { fan: 'low' }],
  ['風を弱くして', {}, { fan: 'low' }],
  ['ちょっと寒い', {}, { temperature: 28 }],
  ['暑い', {}, { temperature: 24 }],
  ['暗くして風を強くして', {}, { light: { brightness: 10, color: 'warm' }, fan: 'medium' }],
  ['もう少し夕方っぽくして', { time: 'day', light: { brightness: 50, color: 'white' } },
    { time: 'sunset', light: { brightness: 40, color: 'warm' }, fan: 'medium' }],
  ['花火を始めて', {}, {}],
  ['', {}, {}],
];

for (const [text, overrides, expected] of cases) {
  test(`${JSON.stringify(text)} with ${JSON.stringify(overrides)} -> ${JSON.stringify(expected)}`, async () => {
    const input = { ...scene1(), ...overrides };
    const response = await post(JSON.stringify({ scene: input, text }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /application\/json/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { ...input, ...expected });
  });
}

test('brightness is clamped to 0..100', () => {
  const dark = { ...scene1(), light: { brightness: 5, color: 'warm' } };
  assert.equal(mockAdjustScene(dark, '暗く').light.brightness, 0);
  const bright = { ...scene1(), light: { brightness: 95, color: 'warm' } };
  assert.equal(mockAdjustScene(bright, '明るく').light.brightness, 100);
});

test('temperature is clamped to 18..30', () => {
  assert.equal(mockAdjustScene({ ...scene1(), temperature: 29 }, '寒い').temperature, 30);
  assert.equal(mockAdjustScene({ ...scene1(), temperature: 19 }, '暑い').temperature, 18);
});

test('input scene is not mutated', () => {
  const input = scene1();
  mockAdjustScene(input, '暗くして風を強くして寒い');
  assert.deepEqual(input, scene1());
});

test('missing or malformed fields are left untouched', () => {
  const partial = { location: '湘南', fan: 'turbo', light: { brightness: 'dim' } };
  assert.deepEqual(mockAdjustScene(partial, '暗くして風を強くして寒い'), partial);
});

for (const body of ['{', 'null', '{}', '[]', '{"scene":[],"text":"暗く"}', '{"scene":null,"text":"暗く"}',
  '{"scene":{},"text":42}', '{"scene":{}}']) {
  test(`invalid payload ${body} returns 400`, async () => {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  });
}

test('GET returns 405 and advertises POST', async () => {
  const response = await onRequest({ request: new Request('http://localhost/api/adjust-scene') });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});
