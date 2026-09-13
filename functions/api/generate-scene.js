import { generateScene } from '../../lib/llm.js';

export async function onRequest({ request, env }) {
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
  if (typeof body?.text !== 'string') {
    return Response.json({ error: 'text must be a string.' }, { status: 400, headers });
  }

  const { scene, source } = await generateScene(body.text, env);
  return Response.json(scene, { headers: { ...headers, 'X-Scene-Source': source } });
}
