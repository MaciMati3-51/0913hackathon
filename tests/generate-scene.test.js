import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/generate-scene.js';
import { mockGenerateScene } from '../lib/scene-generator.js';

const scene1 = {
  location: '湘南', season: 'summer', time: 'sunset',
  visual: 'shonan_sunset', sound: 'ocean_wave',
  light: { brightness: 20, color: 'warm' },
  temperature: 26, fan: 'low', aroma: 'ocean',
};

function post(body) {
  return onRequest({ request: new Request('http://localhost/api/generate-scene', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }) });
}

for (const text of ['2026年8月の夕方の湘南の海にして', '湘南', '海', '夕方', '静かな森', '', '   ']) {
  test(`POST returns Scene1 for ${JSON.stringify(text)}`, async () => {
    const response = await post(JSON.stringify({ text }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /application\/json/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), scene1);
  });
}

test('scene results do not share mutable light settings', () => {
  const first = mockGenerateScene('海');
  first.light.brightness = 100;
  assert.deepEqual(mockGenerateScene('海'), scene1);
});

for (const body of ['{', 'null', '{}', '[]', '{"text":42}', '{"text":null}']) {
  test(`invalid payload ${body} returns 400`, async () => {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  });
}

test('GET returns 405 and advertises POST', async () => {
  const response = await onRequest({ request: new Request('http://localhost/api/generate-scene') });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});
