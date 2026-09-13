import { release, normalizePromo } from '../lib/release.mjs';
import { authorize, identity, readBody, send } from '../lib/handler.mjs';
export default async function handler(req, res) {
  if (!authorize(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
  if (!body || body.dryRun !== true || body.quantity !== 1 || typeof body.nonce !== 'string' || body.nonce.length > 100) return send(res, 400, { error: 'Only dry-run synthetic checkouts are supported' });
  const base = { ...identity(release, body.nonce), dryRun: true };
  try {
    const promoCode = normalizePromo(body.promoCode);
    // No payment provider, customer record, persistent order, or fulfillment action.
    send(res, 200, { ...base, ok: true, totalCents: promoCode === 'DEMO10' ? 900 : 1000 });
  } catch {
    console.error(JSON.stringify({ code: 'NULL_PROMO_REGRESSION', deploymentId: base.deploymentId, release: release.name }));
    send(res, 500, { ...base, ok: false, error: 'NULL_PROMO_REGRESSION' });
  }
}
