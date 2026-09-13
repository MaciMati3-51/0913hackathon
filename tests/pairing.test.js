import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as pair } from '../functions/api/pair.js';
import { onRequest as scene } from '../functions/api/scene/[code].js';
import { mockGenerateScene } from '../lib/scene-generator.js';

function kv() {
  const data = new Map();
  return {
    data,
    async get(key, type) {
      const value = data.get(key) ?? null;
      return value !== null && type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) { data.set(key, value); },
  };
}

function call(handler, store, method = 'GET', code = '0123', body) {
  return handler({
    env: { APP_KV: store }, params: { code },
    request: new Request('http://localhost/api/test', {
      method, ...(body === undefined ? {} : { body }),
    }),
  });
}

test('PC creates a pair, phone connects, and both read the updated scene', async () => {
  const store = kv();
  const issued = await call(pair, store, 'POST');
  assert.equal(issued.status, 201);
  const { code } = await issued.json();
  assert.match(code, /^\d{4}$/);
  assert.deepEqual(await (await call(scene, store, 'GET', code)).json(), { connected: false });
  const generated = mockGenerateScene('湘南');
  await call(scene, store, 'POST', code, JSON.stringify(generated));
  await call(scene, store, 'POST', code, '{"connected":true}');
  const read = await call(scene, store, 'GET', code);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await read.json(), { ...generated, connected: true });
  await call(scene, store, 'POST', code, '{"light":{"brightness":10,"color":"warm"}}');
  assert.deepEqual(await (await call(scene, store, 'GET', code)).json(), {
    ...generated, light: { brightness: 10, color: 'warm' }, connected: true,
  });
});

test('concurrent phone connection and PC update preserve both values', async () => {
  const store = kv();
  store.data.set('scene:0123', '{}');
  await Promise.all([
    call(scene, store, 'POST', '0123', '{"connected":true}'),
    call(scene, store, 'POST', '0123', '{"visual":"shonan_sunset"}'),
  ]);
  assert.deepEqual(await (await call(scene, store)).json(), {
    visual: 'shonan_sunset', connected: true,
  });
});

test('code allocation skips occupied codes without overwriting their state', async () => {
  const store = kv();
  let reads = 0;
  store.get = async () => ++reads === 1 ? '{"visual":"existing"}' : null;
  const response = await call(pair, store, 'POST');
  assert.equal(response.status, 201);
  assert.equal(reads, 2);
  assert.equal(store.data.size, 1);
});

test('allocation stops after bounded retries when codes are occupied', async () => {
  let reads = 0;
  const response = await call(pair, {
    async get() { reads++; return '{}'; },
    async put() { assert.fail('must not overwrite an existing code'); },
  }, 'POST');
  assert.equal(response.status, 503);
  assert.equal(reads, 32);
});

test('unknown codes cannot be read or implicitly created by POST', async () => {
  const store = kv();
  for (const method of ['GET', 'POST']) {
    const response = await call(scene, store, method, '0123', method === 'POST' ? '{}' : undefined);
    assert.equal(response.status, 404);
  }
  assert.equal(store.data.size, 0);
});

test('invalid codes and JSON updates are rejected without mutation', async () => {
  const store = kv();
  for (const code of ['123', '12345', 'abcd', '１２３４', ['0123']]) {
    assert.equal((await call(scene, store, 'GET', code)).status, 400);
  }
  for (const body of ['{', 'null', '[]', '42', '"text"', '{"connected":"true"}']) {
    assert.equal((await call(scene, store, 'POST', '0123', body)).status, 400);
  }
  assert.equal(store.data.size, 0);
});

test('unsupported methods return 405 with Allow', async () => {
  for (const [handler, allow] of [[pair, 'POST'], [scene, 'GET, POST']]) {
    const response = await call(handler, kv(), 'DELETE');
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allow);
  }
});

test('missing binding, read failures, and write failures return JSON 503', async () => {
  for (const handler of [pair, scene]) {
    for (const store of [undefined, {
      async get() { throw new Error('private storage detail'); },
    }, {
      async get() { return handler === pair ? null : {}; },
      async put() { throw new Error('private storage detail'); },
    }]) {
      const response = await call(handler, store, 'POST', '0123', '{"visual":"test"}');
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.doesNotMatch(JSON.stringify(await response.json()), /private storage detail/);
    }
  }
});
