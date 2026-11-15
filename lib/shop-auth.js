import { timingSafeEqual } from 'node:crypto';

const failedAttempts = new Map();

export function shopAccessResponse(request) {
  const expected = process.env.SHOP_ACCESS_PASSWORD || '';
  if (!expected) {
    return Response.json({ error: 'Configurá SHOP_ACCESS_PASSWORD en el entorno del servidor para habilitar el acceso privado.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const supplied = request.headers.get('x-shop-password') || '';
  if (!supplied) return Response.json({ error: 'Ingresá la clave de acceso del local.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const attempt = failedAttempts.get(address);
  if (attempt && now - attempt.started < 5 * 60_000 && attempt.count >= 12) {
    return Response.json({ error: 'Demasiados intentos. Esperá unos minutos y probá otra vez.' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  const valid = expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  if (!valid) {
    if (!attempt || now - attempt.started >= 5 * 60_000) failedAttempts.set(address, { started: now, count: 1 });
    else attempt.count += 1;
    return Response.json({ error: 'La clave de acceso no es correcta.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  failedAttempts.delete(address);
  return null;
}
