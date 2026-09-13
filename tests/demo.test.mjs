import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

for (const variant of ['good', 'regression', 'migration']) test('actual demo HTTP handlers: ' + variant, async () => {
  const root = mkdtempSync(join(tmpdir(), 'sentinel-demo-test-'));
  const target = join(root, 'demo-target'); mkdirSync(join(target, 'lib'), { recursive: true }); mkdirSync(join(target, 'api'));
  for (const file of ['package.json', 'lib/handler.mjs', 'lib/release.mjs', 'api/health.mjs', 'api/checkout.mjs']) copyFileSync(resolve('demo-target', file), join(target, file));
  execFileSync(process.execPath, [resolve('scripts/demo-variant.mjs'), variant], { cwd: root, windowsHide: true });
  const savedToken = process.env.TARGET_PROBE_TOKEN; const savedDeployment = process.env.VERCEL_DEPLOYMENT_ID;
  process.env.TARGET_PROBE_TOKEN = 'test-probe-token-'.repeat(4); delete process.env.VERCEL_DEPLOYMENT_ID;
  const health = (await import(pathToFileURL(join(target, 'api/health.mjs')))).default;
  const checkout = (await import(pathToFileURL(join(target, 'api/checkout.mjs')))).default;
  const server = createServer((req, res) => { if (req.url.startsWith('/api/health')) return health(req, res); void checkout(req, res); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const headers = { Authorization: 'Bearer ' + process.env.TARGET_PROBE_TOKEN, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + '/api/health')).status, 401);
    assert.equal((await fetch(base + '/api/health', { headers: { Authorization: 'Bearer ' + '£'.repeat(process.env.TARGET_PROBE_TOKEN.length) } })).status, 401);
    const h = await fetch(base + '/api/health?nonce=health-test', { headers }); const data = await h.json(); assert.equal(data.ok, true); assert.equal(data.nonce, 'health-test'); assert.equal(data.schemaVersion, variant === 'migration' ? '15' : '14');
    const response = await fetch(base + '/api/checkout', { method: 'POST', headers, body: JSON.stringify({ dryRun: true, quantity: 1, promoCode: null, nonce: 'checkout-test' }) });
    assert.equal(response.status, variant === 'good' ? 200 : 500); const checkoutResult = await response.json(); assert.equal(checkoutResult.dryRun, true); assert.equal(checkoutResult.deploymentId, 'local-' + variant);
    assert.equal((await fetch(base + '/api/checkout', { method: 'POST', headers, body: JSON.stringify({ dryRun: false, quantity: 1, nonce: 'not-allowed' }) })).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (savedToken === undefined) delete process.env.TARGET_PROBE_TOKEN; else process.env.TARGET_PROBE_TOKEN = savedToken;
    if (savedDeployment === undefined) delete process.env.VERCEL_DEPLOYMENT_ID; else process.env.VERCEL_DEPLOYMENT_ID = savedDeployment;
    rmSync(root, { recursive: true });
  }
});
