import { json, randomCode, sceneKey } from '../../lib/pairing.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST' });
  }
  if (!env.APP_KV) return json({ error: 'KV is unavailable.' }, 503);

  try {
    for (let attempt = 0; attempt < 32; attempt++) {
      const code = randomCode();
      if (await env.APP_KV.get(sceneKey(code)) !== null) continue;
      // KV has no atomic create-if-absent; see docs/pairing-api.md.
      await env.APP_KV.put(sceneKey(code), '{}');
      return json({ code }, 201);
    }
    return json({ error: 'Could not allocate a code. Please retry.' }, 503);
  } catch {
    return json({ error: 'KV is unavailable. Please retry.' }, 503);
  }
}
