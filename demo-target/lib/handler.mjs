import { timingSafeEqual } from 'node:crypto';
export function authorize(req, res) {
  const expected = process.env.TARGET_PROBE_TOKEN;
  const got = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const received = Buffer.from(got), required = Buffer.from(expected || '');
  if (!expected || expected.length < 32 || received.length !== required.length || !timingSafeEqual(received, required)) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Probe authorization required' })); return false;
  }
  return true;
}
export function send(res, code, body) { res.statusCode = code; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); }
export function identity(release, nonce) { return { service: 'sentinel-checkout-demo', deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'local-' + release.name, schemaVersion: release.schemaVersion, contractVersion: release.contractVersion, nonce }; }
export async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 2048) throw new Error('Request too large'); }
  return JSON.parse(text);
}
