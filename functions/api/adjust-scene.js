import { mockAdjustScene } from '../../lib/scene-adjuster.js';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function onRequest({ request }) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed. Use POST.' },
      { status: 405, headers: { ...headers, Allow: 'POST' } },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers });
  }
  if (!isPlainObject(body?.scene)) {
    return Response.json({ error: 'scene must be an object.' }, { status: 400, headers });
  }
  if (typeof body.text !== 'string') {
    return Response.json({ error: 'text must be a string.' }, { status: 400, headers });
  }

  const scene = await mockAdjustScene(body.scene, body.text);
  return Response.json(scene, { headers });
}
