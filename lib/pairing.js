export function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export const sceneKey = (code) => `scene:${code}`;
export const connectionKey = (code) => `connected:${code}`;

export function randomCode() {
  // Rejection sampling avoids bias when mapping random integers to 10,000 codes.
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= 4294960000);
  return String(values[0] % 10000).padStart(4, '0');
}
