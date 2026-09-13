import { connectionKey, json, sceneKey } from '../../../lib/pairing.js';

export async function onRequest({ request, env, params }) {
  if (!['GET', 'POST'].includes(request.method)) {
    return json({ error: 'Method not allowed. Use GET or POST.' }, 405, { Allow: 'GET, POST' });
  }
  const code = params.code;
  if (typeof code !== 'string' || !/^\d{4}$/.test(code)) {
    return json({ error: 'code must be a four-digit string.' }, 400);
  }

  let update;
  if (request.method === 'POST') {
    try {
      update = await request.json();
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      return json({ error: 'The scene update must be a JSON object.' }, 400);
    }
    if ('connected' in update && typeof update.connected !== 'boolean') {
      return json({ error: 'connected must be a boolean.' }, 400);
    }
  }
  if (!env.APP_KV) return json({ error: 'KV is unavailable.' }, 503);

  try {
    const scene = await env.APP_KV.get(sceneKey(code), 'json');
    if (scene === null) return json({ error: 'Pairing code not found.' }, 404);
    let connected = await env.APP_KV.get(connectionKey(code), 'json') === true;
    let nextScene = scene;

    if (update) {
      const { connected: nextConnected, ...fields } = update;
      if (Object.keys(fields).length) {
        nextScene = { ...scene, ...fields };
        await env.APP_KV.put(sceneKey(code), JSON.stringify(nextScene));
      }
      // Separate keys preserve the PC's scene when the phone marks itself connected.
      if (nextConnected !== undefined) {
        await env.APP_KV.put(connectionKey(code), JSON.stringify(nextConnected));
        connected = nextConnected;
      }
    }
    return json({ ...nextScene, connected });
  } catch {
    return json({ error: 'KV is unavailable. Please retry.' }, 503);
  }
}
