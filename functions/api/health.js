export async function onRequestGet({ env }) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!env.APP_KV) {
    return Response.json({ ok: false, kv: 'unbound' }, { status: 503, headers });
  }
  try {
    await env.APP_KV.get('__healthcheck__');
    return Response.json({ ok: true, kv: 'connected' }, { headers });
  } catch {
    return Response.json({ ok: false, kv: 'unavailable' }, { status: 503, headers });
  }
}
