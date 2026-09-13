import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { authenticated, createSession, checkOrigin, readLimited, COOKIE } from '../lib/commander/auth';
import { verifySlack } from '../lib/commander/slack';
import { redact, configStatus } from '../lib/commander/config';
import { POST as slackEvent } from '../app/api/slack/events/route';
import { POST as runIncident } from '../app/api/incidents/run/route';
import { getStore } from '../lib/commander/store';
const env = { ...process.env };
process.env.SENTINEL_DB_PATH = ':memory:';
process.env.SENTINEL_OPERATOR_TOKEN = 'test-operator-'.repeat(5);
process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
process.env.SLACK_TEAM_ID = 'TTEST'; process.env.SLACK_INCIDENT_CHANNEL_ID = 'CTEST';
process.env.PORT = '3000';
process.env.LIVE_MODE_ENABLED = 'false';
test.after(() => { getStore().close(); process.env = env; });
const timestamp = () => String(Math.floor(Date.now() / 1000));
const signature = (body: string, ts: string) => 'v0=' + createHmac('sha256', process.env.SLACK_SIGNING_SECRET!).update('v0:' + ts + ':' + body).digest('hex');
function slack(body: unknown, corrupt = false) { const raw = JSON.stringify(body), ts = timestamp(); return new Request('http://localhost:3000/api/slack/events', { method: 'POST', body: raw, headers: { 'x-slack-request-timestamp': ts, 'x-slack-signature': corrupt ? 'v0=' + '0'.repeat(64) : signature(raw, ts) } }); }
test('operator endpoints reject unsigned requests', async () => { assert.equal((await runIncident(new Request('http://localhost:3000/api/incidents/run', { method: 'POST', body: '{}' }))).status, 401); });
test('empty setup URL produces a missing-field result, never a server exception', () => {
  const saved = process.env.SENTINEL_PUBLIC_URL; process.env.SENTINEL_PUBLIC_URL = '';
  try { assert.ok(configStatus().missing.includes('SENTINEL_PUBLIC_URL')); } finally { if (saved === undefined) delete process.env.SENTINEL_PUBLIC_URL; else process.env.SENTINEL_PUBLIC_URL = saved; }
});
test('operator cookie is authenticated and tampering is rejected', () => {
  const cookie = createSession(process.env.SENTINEL_OPERATOR_TOKEN!); const request = (value: string) => new Request('http://localhost:3000', { headers: { cookie: COOKIE + '=' + value } });
  assert.equal(authenticated(request(cookie)), true); assert.equal(authenticated(request(cookie + 'a')), false); assert.equal(authenticated(request('1.nonce.signature')), false);
});
test('browser mutations reject cross-site origin and accept local origin', () => {
  assert.throws(() => checkOrigin(new Request('http://localhost:3000', { headers: { origin: 'https://evil.example' } })), /Untrusted/);
  assert.doesNotThrow(() => checkOrigin(new Request('http://localhost:3000', { headers: { origin: 'http://localhost:3000' } })));
});
test('large webhook bodies are bounded even without a content-length header', async () => { await assert.rejects(() => readLimited(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(65537) })), /too large/); });
test('Slack signature requires exact body and fresh timestamp', () => {
  const raw = '{"ok":true}', ts = timestamp(); assert.equal(verifySlack(raw, ts, signature(raw, ts), process.env.SLACK_SIGNING_SECRET!), true); assert.equal(verifySlack(raw + ' ', ts, signature(raw, ts), process.env.SLACK_SIGNING_SECRET!), false);
  const old = String(Number(ts) - 301); assert.equal(verifySlack(raw, old, signature(raw, old), process.env.SLACK_SIGNING_SECRET!), false);
});
test('Slack URL verification requires a valid signature', async () => {
  assert.equal((await slackEvent(slack({ type: 'url_verification', challenge: 'challenge' }, true))).status, 401);
  const result = await slackEvent(slack({ type: 'url_verification', challenge: 'challenge' })); assert.equal(result.status, 200); assert.deepEqual(await result.json(), { challenge: 'challenge' });
});
test('Slack workspace/channel restrictions stop irrelevant events', async () => {
  assert.equal((await slackEvent(slack({ type: 'event_callback', team_id: 'TOTHER' }))).status, 403);
  const result = await slackEvent(slack({ type: 'event_callback', team_id: 'TTEST', event: { type: 'app_mention', channel: 'COTHER', text: 'investigate checkout' } })); assert.deepEqual(await result.json(), { ignored: true });
});
test('live dashboard request cannot bypass configuration switches', async () => {
  const response = await runIncident(new Request('http://localhost:3000/api/incidents/run', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SENTINEL_OPERATOR_TOKEN }, body: JSON.stringify({ mode: 'live', scenario: 'checkout-regression', eventKey: randomUUID() }) })); assert.equal(response.status, 409);
});
test('secret redaction removes configured tokens and recognizable credential formats', () => {
  const secret = process.env.SENTINEL_OPERATOR_TOKEN!; assert.equal(redact('value=' + secret), 'value=[REDACTED]'); assert.equal(redact('ghp_example123 xoxb-123-456-private'), '[REDACTED] [REDACTED]');
});
test('signed Slack intake durably acknowledges and deduplicates before doing any external work', async () => {
  const before = { ...process.env };
  Object.assign(process.env, { AI_GATEWAY_API_KEY: 'test'.repeat(8), SENTINEL_PUBLIC_URL: 'https://tunnel.example.test', SLACK_BOT_TOKEN: 'test'.repeat(8), VERCEL_ACCESS_TOKEN: 'test'.repeat(8), VERCEL_PROJECT_ID: 'prj_test', VERCEL_TEAM_ID: 'team_test', VERCEL_KNOWN_GOOD_DEPLOYMENT_ID: 'dpl_good', TARGET_PRODUCTION_URL: 'https://demo.vercel.app', TARGET_PROBE_TOKEN: 'test'.repeat(16), GITHUB_TOKEN: 'test'.repeat(8), GITHUB_REPOSITORY: 'test/demo', LINEAR_API_KEY: 'test'.repeat(8), LINEAR_TEAM_ID: '00000000-0000-4000-8000-000000000000', LIVE_MODE_ENABLED: 'true' });
  const originalFetch = globalThis.fetch; let outbound = 0; globalThis.fetch = async () => { outbound++; throw new Error('No outbound calls allowed during intake'); };
  try {
    const body = { type: 'event_callback', team_id: 'TTEST', event_id: 'EvTEST1', event: { type: 'app_mention', channel: 'CTEST', ts: '123.456', text: '<@UTEST> investigate checkout' } };
    const start = performance.now(); const first = await slackEvent(slack(body)); const elapsed = performance.now() - start;
    assert.equal(first.status, 200); const saved = await first.json(); const repeated = await (await slackEvent(slack(body))).json(); assert.equal(repeated.incidentId, saved.incidentId);
    assert.equal(getStore().get(saved.incidentId)?.state, 'RECEIVED'); assert.equal(outbound, 0); assert.ok(elapsed < 1000, 'Intake must only validate and save, not investigate');
  } finally { globalThis.fetch = originalFetch; process.env = before; }
});
