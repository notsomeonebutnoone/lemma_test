import { api, authenticated, bodyJson, checkOrigin, COOKIE, createSession, equal, HttpError, operatorSecret } from '@/lib/commander/auth';
export const runtime = 'nodejs';
let attempts = 0, windowStart = Date.now();
export function GET(request: Request) { return api(() => Response.json({ authenticated: authenticated(request), configured: Boolean(operatorSecret()) })); }
export function POST(request: Request) { return api(async () => {
  checkOrigin(request);
  if (Date.now() - windowStart > 60000) { attempts = 0; windowStart = Date.now(); }
  if (++attempts > 12) throw new HttpError(429, 'Too many unlock attempts. Wait one minute.');
  const key = operatorSecret(); if (!key) throw new HttpError(503, 'Run npm run setup first.');
  const body = await bodyJson(request);
  if (typeof body?.token !== 'string' || !equal(body.token, key)) throw new HttpError(401, 'Invalid operator token');
  const secure = request.headers.get('origin')?.startsWith('https://') ? '; Secure' : '';
  return Response.json({ authenticated: true }, { headers: { 'Set-Cookie': `${COOKIE}=${createSession(key)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}` } });
}); }
export function DELETE(request: Request) { return api(() => { checkOrigin(request); return Response.json({ authenticated: false }, { headers: { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` } }); }); }
