import { release } from '../lib/release.mjs';
import { authorize, identity, send } from '../lib/handler.mjs';
export default function handler(req, res) {
  if (!authorize(req, res)) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'GET required' });
  const nonce = new URL(req.url, 'http://demo.invalid').searchParams.get('nonce') || '';
  send(res, 200, { ...identity(release, nonce), ok: true });
}
