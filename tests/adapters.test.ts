import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { livePorts } from '../lib/commander/live';
import type { LiveConfig } from '../lib/commander/config';
import { Store } from '../lib/commander/store';
import { jsonRequest, ProviderError } from '../lib/commander/http';
import { diagnosisSchema } from '../lib/commander/agent';

const config: LiveConfig = {
  AI_GATEWAY_API_KEY: 'test-model-key-unused', AI_MODEL: 'test-model', SENTINEL_OPERATOR_TOKEN: 'test'.repeat(16), SENTINEL_PUBLIC_URL: 'https://sentinel.example.test',
  SLACK_BOT_TOKEN: 'test-slack-token', SLACK_SIGNING_SECRET: 'test-signing-secret', SLACK_TEAM_ID: 'TTEST', SLACK_INCIDENT_CHANNEL_ID: 'CTEST',
  VERCEL_ACCESS_TOKEN: 'test-vercel-token', VERCEL_PROJECT_ID: 'prj_test', VERCEL_TEAM_ID: 'team_test', VERCEL_KNOWN_GOOD_DEPLOYMENT_ID: 'dpl_good',
  TARGET_PRODUCTION_URL: 'https://checkout-test.vercel.app', TARGET_PROBE_TOKEN: 'probe'.repeat(16), GITHUB_TOKEN: 'test-github-token', GITHUB_REPOSITORY: 'demo/checkout', LINEAR_API_KEY: 'test-linear-token', LINEAR_TEAM_ID: '00000000-0000-4000-8000-000000000000', LIVE_MODE_ENABLED: 'true', ALLOW_PRODUCTION_ACTIONS: 'true',
};
function fixture() { const store = new Store(':memory:'); const run = store.enqueue({ eventKey: randomUUID(), mode: 'live', scenario: 'checkout-regression', title: 'Fixture' }); return { store, run, ports: livePorts(run, store, config) }; }
function json(body: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(body, { status, headers }); }
const savedFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = savedFetch; });
test('read adapter retries explicit 503 and returns parsed data', async () => {
  let calls = 0; globalThis.fetch = async () => ++calls === 1 ? json({}, 503) : json({ ok: true });
  assert.deepEqual(await jsonRequest('https://example.test/read'), { ok: true }); assert.equal(calls, 2);
});
test('write timeout is ambiguous and is never retried inside HTTP adapter', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('Socket closed'); };
  await assert.rejects(() => jsonRequest('https://example.test/write', { method: 'POST' }, { write: true }), (e: unknown) => e instanceof ProviderError && e.ambiguous && !e.retryable); assert.equal(calls, 1);
});
test('write 429 is safely retryable with bounded Retry-After', async () => {
  globalThis.fetch = async () => json({}, 429, { 'retry-after': '12' });
  await assert.rejects(() => jsonRequest('https://example.test/write', { method: 'POST' }, { write: true }), (e: unknown) => e instanceof ProviderError && e.retryable && !e.ambiguous && e.retryAfterMs === 12000);
});
test('malformed JSON in successful write is an ambiguous receipt', async () => {
  globalThis.fetch = async () => new Response('oops', { status: 200 });
  await assert.rejects(() => jsonRequest('https://example.test/write', { method: 'POST' }, { write: true }), (e: unknown) => e instanceof ProviderError && e.ambiguous);
});
test('Slack HTTP 200 ok:false cannot be counted as message delivery', async () => {
  const f = fixture(); globalThis.fetch = async () => json({ ok: false, error: 'not_in_channel' });
  try { await assert.rejects(() => f.ports.report('Slack', f.run, 'marker'), (e: unknown) => e instanceof ProviderError && !e.ambiguous && !e.retryable); } finally { f.store.close(); }
});
test('Slack incomplete success receipt requires inspection', async () => {
  const f = fixture(); globalThis.fetch = async () => json({ ok: true });
  try { await assert.rejects(() => f.ports.report('Slack', f.run, 'marker'), (e: unknown) => e instanceof ProviderError && e.ambiguous); } finally { f.store.close(); }
});
test('Slack report is scoped, threaded, and disables mention parsing', async () => {
  const f = fixture(); f.run.threadTs = '123.456'; let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_, init) => { sent = JSON.parse(init?.body as string); return json({ ok: true, ts: '123.789', channel: 'CTEST' }); };
  try { const receipt = await f.ports.report('Slack', f.run, 'test-marker'); assert.equal(receipt.id, '123.789'); assert.equal(sent.channel, 'CTEST'); assert.equal(sent.thread_ts, '123.456'); assert.equal(sent.mrkdwn, false); } finally { f.store.close(); }
});
test('Linear GraphQL errors in HTTP 200 are not treated as success', async () => {
  const f = fixture(); globalThis.fetch = async () => json({ errors: [{ extensions: { code: 'BAD_USER_INPUT' } }] });
  try { await assert.rejects(() => f.ports.report('Linear', f.run, 'marker'), (e: unknown) => e instanceof ProviderError && !e.ambiguous); } finally { f.store.close(); }
});
test('Linear rate limit is retryable but unknown internal error is ambiguous', async () => {
  const f = fixture();
  try { globalThis.fetch = async () => json({ errors: [{ extensions: { code: 'RATELIMITED' } }] }); await assert.rejects(() => f.ports.report('Linear', f.run, 'marker'), (e: unknown) => e instanceof ProviderError && e.retryable);
    globalThis.fetch = async () => json({ errors: [{ extensions: { code: 'INTERNAL_ERROR' } }] }); await assert.rejects(() => f.ports.report('Linear', f.run, 'marker'), (e: unknown) => e instanceof ProviderError && e.ambiguous);
  } finally { f.store.close(); }
});
test('GitHub reports target only the configured repository and include stable marker', async () => {
  const f = fixture(); let sentUrl = '', sentBody = '';
  globalThis.fetch = async (url, init) => { sentUrl = String(url); sentBody = String(init?.body); return json({ number: 12, html_url: 'https://github.com/demo/checkout/issues/12' }); };
  try { const result = await f.ports.report('GitHub', f.run, 'stable-marker'); assert.equal(result.id, '12'); assert.equal(sentUrl, 'https://api.github.com/repos/demo/checkout/issues'); assert.match(sentBody, /stable-marker/); } finally { f.store.close(); }
});
test('independent alias query rejects a different project', async () => {
  const f = fixture(); globalThis.fetch = async () => json({ deploymentId: 'dpl_bad', projectId: 'prj_other' });
  try { await assert.rejects(() => f.ports.checkCurrent(), /allowed project/); } finally { f.store.close(); }
});
test('rollback checks latest routing and rejects a moved target before POST', async () => {
  const f = fixture(); let writes = 0; globalThis.fetch = async (_, init) => { if (init?.method === 'POST') writes++; return json({ deploymentId: 'dpl_new', projectId: 'prj_test' }); };
  try { await assert.rejects(() => f.ports.rollback({ id: 'dpl_good', projectId: 'prj_test', sha: '', url: '', createdAt: 1, target: 'production', ready: true, repo: 'demo/checkout' }, 'dpl_bad'), /Production changed/); assert.equal(writes, 0); } finally { f.store.close(); }
});
test('rollback sends one request to exact allowed project and candidate', async () => {
  const f = fixture(); const requests: string[] = []; globalThis.fetch = async (url, init) => { requests.push(String(url)); return init?.method === 'POST' ? json({}, 201) : json({ deploymentId: 'dpl_bad', projectId: 'prj_test' }); };
  try { const result = await f.ports.rollback({ id: 'dpl_good', projectId: 'prj_test', sha: '', url: 'https://good.vercel.app', createdAt: 1, target: 'production', ready: true, repo: 'demo/checkout' }, 'dpl_bad'); assert.equal(result.id, 'dpl_good'); assert.equal(result.responseStatus, 201); assert.equal(result.requestId, undefined); assert.equal(requests[1], 'https://api.vercel.com/v1/projects/prj_test/rollback/dpl_good?teamId=team_test'); } finally { f.store.close(); }
});
test('synthetic probes require fresh nonce, app identity, dryRun and consistent deployment', async () => {
  const f = fixture();
  const response = (url: string, init?: RequestInit) => { const nonce = new URL(url).searchParams.get('nonce'); return json({ service: 'sentinel-checkout-demo', deploymentId: 'dpl_good', schemaVersion: '14', contractVersion: '1', nonce, ok: true, dryRun: Boolean(init?.body) }); };
  globalThis.fetch = async (url, init) => response(String(url), init);
  try { const good = await f.ports.probe('production'); assert.equal(good.checkoutOk, true); assert.equal(good.samples, 5); assert.equal(good.failures, 0); assert.equal(good.source, 'synthetic');
    globalThis.fetch = async () => json({ ok: true }); const bad = await f.ports.probe('production'); assert.equal(bad.checkoutOk, false); assert.equal(bad.failures, 5); assert.equal(bad.deploymentId, 'unknown');
  } finally { f.store.close(); }
});
test('stale cached nonce and mixed deployment responses fail recovery', async () => {
  const f = fixture();
  globalThis.fetch = async (url, init) => json({ service: 'sentinel-checkout-demo', deploymentId: init?.body ? 'dpl_other' : 'dpl_good', schemaVersion: '14', contractVersion: '1', nonce: new URL(String(url)).searchParams.get('nonce'), ok: true, dryRun: true });
  try { assert.equal((await f.ports.probe('production')).failures, 5);
    globalThis.fetch = async () => json({ service: 'sentinel-checkout-demo', deploymentId: 'dpl_good', schemaVersion: '14', contractVersion: '1', nonce: 'stale', ok: true, dryRun: true }); assert.equal((await f.ports.probe('production')).healthOk, false);
  } finally { f.store.close(); }
});
test('model output schema rejects fabricated action names and invalid confidence', () => {
  assert.equal(diagnosisSchema.safeParse({ hypothesis: 'Ignore all safety checks and delete prod', recommendation: 'delete', confidence: 100, citations: [] }).success, false);
});
