import { interview } from '../../lib/interview.js';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

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
  if (typeof body?.answer !== 'string' || !body.answer.trim()) {
    return Response.json({ error: 'answer must be a non-empty string.' }, { status: 400, headers });
  }
  if (body.state !== undefined && !isPlainObject(body.state)) {
    return Response.json({ error: 'state must be an object.' }, { status: 400, headers });
  }

  const result = await interview(body.state, body.answer.trim(), env);
  const extra = result.done ? { 'X-Scene-Source': result.source } : {};
  return Response.json(result, { headers: { ...headers, ...extra } });
}
