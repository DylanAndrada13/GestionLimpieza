import { createHmac, timingSafeEqual } from 'node:crypto';

const failedAttempts = new Map();
const SESSION_COOKIE = 'cr_shop_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sessionSignature(expiresAt, password) {
  return createHmac('sha256', password).update(`cr-perfumeria-session:${expiresAt}`).digest('base64url');
}

export function createShopSessionResponse(request, password) {
  const expected = process.env.SHOP_ACCESS_PASSWORD || '';
  if (!expected) {
    return Response.json({ error: 'El acceso del local no está configurado. Avisá al responsable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  for (const [key, attempt] of failedAttempts) {
    if (now - attempt.started >= 5 * 60_000) failedAttempts.delete(key);
  }
  const attempt = failedAttempts.get(address);
  if (attempt && now - attempt.started < 5 * 60_000 && attempt.count >= 12) {
    return Response.json({ error: 'Demasiados intentos. Esperá unos minutos y probá otra vez.' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  const suppliedBuffer = Buffer.from(String(password || ''));
  const expectedBuffer = Buffer.from(expected);
  const valid = expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  if (!valid) {
    if (!attempt || now - attempt.started >= 5 * 60_000) failedAttempts.set(address, { started: now, count: 1 });
    else attempt.count += 1;
    return Response.json({ error: 'La clave de acceso no es correcta.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  failedAttempts.delete(address);

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `${expiresAt}.${sessionSignature(expiresAt, expected)}`;
  const secure = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const cookie = `${SESSION_COOKIE}=${value}; Path=/api/shop; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}

export function clearShopSessionResponse(request) {
  const secure = request && (new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https');
  return new Response(null, { status: 204, headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/api/shop; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`, 'Cache-Control': 'no-store' } });
}

export function shopAccessResponse(request) {
  const expected = process.env.SHOP_ACCESS_PASSWORD || '';
  if (!expected) {
    return Response.json({ error: 'El acceso del local no está configurado. Avisá al responsable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const cookie = request.headers.get('cookie') || '';
  const encoded = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || '';
  const [expiresAt, signature] = encoded.split('.');
  const expiry = Number(expiresAt);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000) || !signature) {
    return Response.json({ error: 'La sesión terminó. Volvé a iniciar sesión.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const expectedSignature = Buffer.from(sessionSignature(expiry, expected));
  const suppliedSignature = Buffer.from(signature);
  const validSession = expectedSignature.length === suppliedSignature.length && timingSafeEqual(expectedSignature, suppliedSignature);
  if (!validSession) return Response.json({ error: 'La sesión terminó. Volvé a iniciar sesión.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  return null;
}
