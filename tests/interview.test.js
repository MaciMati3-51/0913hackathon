import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHIPS, QUESTIONS, applyPresets, extractSlotsByKeywords, interview, nextAxis, summarize, synthesizeText,
} from '../lib/interview.js';
import { onRequest } from '../functions/api/interview.js';

const start = (answer, slots = {}) => interview({ turn: 1, slots }, answer, {});

test('chip answer fills its tagged slots and asks the next most impactful axis', async () => {
  const result = await start('chip_quiet_beach');
  assert.equal(result.done, false);
  assert.deepEqual(result.state, { turn: 2, slots: { subject: 'beach', density: 'quiet' } });
  assert.equal(result.question.axis, 'time');
  assert.equal(result.question.text, QUESTIONS.time.text);
  assert.equal(result.question.options.length, 3);
  assert.equal(result.question.options[1].previewText, '照明 20% / 暖色');
});

test('chip label works the same as its id', async () => {
  const byLabel = await start('夕暮れをぼーっと眺めたい');
  assert.deepEqual(byLabel.state.slots, { time: 'sunset', density: 'quiet' });
  assert.equal(byLabel.question.axis, 'body');
});

test('finishes in two questions when Q1 already fixed time and density', async () => {
  const q2 = await start('chip_sunset');
  assert.equal(q2.question.axis, 'body');
  const done = await interview(q2.state, 'cool', {});
  assert.equal(done.done, true);
  assert.equal(done.state.turn, 2);
  assert.deepEqual(done.defaults, []);
  assert.equal(done.summary, '人のいない夕暮れの海で、涼しい風にあたる');
  assert.equal(done.source, 'mock');
  assert.deepEqual(done.scene, {
    location: '湘南', season: 'summer', time: 'sunset',
    visual: 'shonan_sunset', sound: 'ocean_wave',
    light: { brightness: 20, color: 'warm' },
    temperature: 24, fan: 'medium', aroma: 'ocean',
  });
});

test('three questions max: unresolved axes fall back to defaults and are reported', async () => {
  const q2 = await start('よくわからない');
  assert.equal(q2.question.axis, 'time');
  const q3 = await interview(q2.state, 'day', {});
  assert.equal(q3.question.axis, 'body');
  assert.equal(q3.state.turn, 3);
  const done = await interview(q3.state, 'mild', {});
  assert.equal(done.done, true);
  assert.deepEqual(done.defaults, ['density']);
  assert.equal(done.scene.time, 'day');
  assert.deepEqual(done.scene.light, { brightness: 60, color: 'white' });
  assert.equal(done.scene.sound, 'ocean_wave');
  assert.equal(done.scene.temperature, 27);
  assert.equal(done.scene.fan, 'low');
  assert.equal(done.summary, '人のいない昼の海で、ぬるい空気に浸る');
});

test('body remembered from a previous visit is not asked again', async () => {
  const q2 = await start('chip_quiet_beach', { body: 'cool' });
  assert.equal(q2.question.axis, 'time');
  const done = await interview(q2.state, 'night', {});
  assert.equal(done.done, true);
  assert.equal(done.scene.temperature, 24);
  assert.deepEqual(done.scene.light, { brightness: 8, color: 'warm' });
});

test('lively density selects the two-layer sound', async () => {
  const q2 = await start('chip_lively');
  assert.deepEqual(q2.state.slots, { density: 'lively', time: 'day' });
  const done = await interview(q2.state, 'cool', {});
  assert.equal(done.scene.sound, 'ocean_wave_breeze');
});

test('free text is parsed by keywords when no LLM is configured', async () => {
  assert.deepEqual(extractSlotsByKeywords('夜風にあたりながら、ひとりで海を見たい'),
    { time: 'night', density: 'quiet', body: 'cool', subject: 'beach' });
  assert.deepEqual(extractSlotsByKeywords('友達と賑やかに夕暮れの浜で'), { time: 'sunset', density: 'lively', subject: 'beach' });
  const result = await start('夜風にあたりながら、ひとりで海を見たい');
  assert.equal(result.done, true);
  assert.equal(result.summary, '人のいない夜の海で、涼しい風にあたる');
});

test('free text uses the LLM extractor when configured and ignores unknown values', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ subject: 'beach', time: 'sunset', density: 'bogus', body: null }) }] }],
    }), { status: 200 });
  };
  const result = await interview({ turn: 1, slots: {} }, '海で夕方を過ごしたい', { OPENAI_API_KEY: 'k' }, { fetcher });
  assert.equal(calls[0].text.format.name, 'slots');
  assert.deepEqual(result.state.slots, { subject: 'beach', time: 'sunset' });
  assert.equal(result.question.axis, 'density');
});

test('LLM extraction failure falls back to keywords', async () => {
  const fetcher = async () => { throw new Error('timeout'); };
  const result = await interview({ turn: 1, slots: {} }, '夕暮れをひとりで', { OPENAI_API_KEY: 'k' }, { fetcher });
  assert.deepEqual(result.state.slots, { time: 'sunset', density: 'quiet' });
});

test('nextAxis keeps the last question for body', () => {
  assert.equal(nextAxis({}, 1), 'time');
  assert.equal(nextAxis({ time: 'day' }, 2), 'body');
  assert.equal(nextAxis({ time: 'day', density: 'quiet' }, 1), 'body');
  assert.equal(nextAxis({ body: 'cool' }, 1), 'time');
  assert.equal(nextAxis({ body: 'cool' }, 2), 'time');
  assert.equal(nextAxis({ body: 'cool', time: 'day' }, 2), 'density');
  assert.equal(nextAxis({ time: 'day', density: 'quiet', body: 'cool' }, 1), null);
  assert.equal(nextAxis({}, 3), null);
});

test('presets override whatever the LLM produced for the asked axes', () => {
  const llmScene = { location: '鎌倉', time: 'day', light: { brightness: 90, color: 'cool' }, sound: 'ocean_wave', temperature: 30, fan: 'high', aroma: 'forest' };
  assert.deepEqual(applyPresets(llmScene, { time: 'night', density: 'lively', body: 'mild' }), {
    location: '鎌倉', time: 'night', light: { brightness: 8, color: 'warm' }, sound: 'ocean_wave_breeze', temperature: 27, fan: 'low', aroma: 'forest',
  });
});

test('synthesized text and summary read naturally', () => {
  const slots = { subject: 'beach', time: 'sunset', density: 'quiet', body: 'cool' };
  assert.equal(synthesizeText(slots), '2026年8月の夕暮れの湘南の海。ほかに人はいない静かな浜。涼しい風にあたって過ごす。');
  assert.equal(summarize(slots), '人のいない夕暮れの海で、涼しい風にあたる');
});

test('every chip maps to known slot values', () => {
  for (const chip of CHIPS) {
    for (const [axis, value] of Object.entries(chip.slots)) {
      if (axis === 'subject') continue;
      assert.ok(QUESTIONS[axis].options.some((o) => o.id === value), `${chip.id}: ${axis}=${value}`);
    }
  }
});

function post(body) {
  return onRequest({ request: new Request('http://localhost/api/interview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }), env: {} });
}

test('POST /api/interview returns a question, then a scene with the source header', async () => {
  const first = await post(JSON.stringify({ state: { turn: 1, slots: {} }, answer: 'chip_sunset' }));
  assert.equal(first.status, 200);
  const q = await first.json();
  assert.equal(q.done, false);
  assert.equal(q.question.axis, 'body');
  const second = await post(JSON.stringify({ state: q.state, answer: 'cool' }));
  assert.equal(second.headers.get('X-Scene-Source'), 'mock');
  const done = await second.json();
  assert.equal(done.done, true);
  assert.equal(done.scene.temperature, 24);
});

test('POST without state starts a new interview', async () => {
  const response = await post(JSON.stringify({ answer: 'chip_quiet_beach' }));
  assert.equal((await response.json()).state.turn, 2);
});

for (const body of ['{', 'null', '{}', '{"answer":""}', '{"answer":42}', '{"answer":"x","state":[]}', '{"answer":"x","state":"s"}']) {
  test(`invalid payload ${body} returns 400`, async () => {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  });
}

test('GET returns 405 and advertises POST', async () => {
  const response = await onRequest({ request: new Request('http://localhost/api/interview'), env: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});
