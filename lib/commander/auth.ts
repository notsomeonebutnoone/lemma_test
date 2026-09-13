import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { redact } from './config';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const COOKIE = 'sentinel_session';
export function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function operatorSecret() { const token = process.env.SENTINEL_OPERATOR_TOKEN; return token && token.length >= 32 ? token : null; }
const sign = (text: string, key: string) => createHmac('sha256', key).update(text).digest('hex');
export function createSession(key: string) { const data = `${Date.now() + 8 * 3600000}.${randomUUID()}`; return data + '.' + sign(data, key); }
export function authenticated(request: Request): boolean {
  const secret = operatorSecret(); if (!secret) return false;
  const bearer = request.headers.get('authorization');
  if (bearer && equal(bearer, 'Bearer ' + secret)) return true;
  const cookie = request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 250) return false;
  const [expiry, nonce, mac, extra] = cookie.split('.');
  return !extra && Boolean(nonce && mac) && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + 8 * 3600000 && equal(mac, sign(expiry + '.' + nonce, secret));
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin && request.headers.get('authorization')?.startsWith('Bearer ')) return;
  const port = process.env.PORT || '3000';
  const allowed = new Set(['http://localhost:' + port, 'http://127.0.0.1:' + port]);
  if (process.env.SENTINEL_PUBLIC_URL) { try { allowed.add(new URL(process.env.SENTINEL_PUBLIC_URL).origin); } catch { /* invalid config fails closed */ } }
  if (!origin || !allowed.has(origin)) throw new HttpError(403, 'Untrusted request origin');
}
export function protect(request: Request, mutation = false) {
  if (!operatorSecret()) throw new HttpError(503, 'Run npm run setup to create your local operator token.');
  if (!authenticated(request)) throw new HttpError(401, 'Unlock the operator console first.');
  if (mutation) checkOrigin(request);
}
export async function readLimited(request: Request, max = 65536) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'Request too large');
  if (!request.body) return '';
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new HttpError(413, 'Request too large'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function bodyJson(request: Request) {
  try { return JSON.parse(await readLimited(request)); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'Invalid JSON body'); }
}
export async function api(work: () => Promise<Response> | Response) {
  try { const response = await work(); response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Content-Type-Options', 'nosniff'); return response; }
  catch (e) {
    if (!(e instanceof HttpError)) console.error(JSON.stringify({ event: 'sentinel_api_error', type: e instanceof Error ? e.name : 'unknown', message: redact(e instanceof Error ? e.message : 'Unknown failure').slice(0, 500) }));
    return Response.json({ error: e instanceof HttpError ? e.message : 'Request failed. Check configuration and the local worker logs.' }, { status: e instanceof HttpError ? e.status : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
