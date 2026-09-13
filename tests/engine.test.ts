import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../lib/commander/store';
import { sandboxPorts } from '../lib/commander/sandbox';
import { executeIncident } from '../lib/commander/engine';
import { rollbackPolicy } from '../lib/commander/policy';
import { ProviderError } from '../lib/commander/http';
import type { Scenario, Investigation, Diagnosis } from '../lib/commander/types';

function fixture(scenario: Scenario = 'checkout-regression') {
  const store = new Store(':memory:'); const owner = randomUUID();
  store.enqueue({ eventKey: randomUUID(), mode: 'sandbox', scenario, title: 'Test incident' });
  const run = store.claim(owner)!; const ports = sandboxPorts(run, store, true);
  return { store, owner, run, ports };
}
for (const [scenario, expected, rollback] of [['checkout-regression', 'RESOLVED', 1], ['unsafe-migration', 'APPROVAL_REQUIRED', 0], ['false-success', 'FAILED', 1]] as const) {
  test(scenario + ': executes actual state machine with correct terminal decision', async () => {
    const f = fixture(scenario); try { await executeIncident(f.store, f.run, f.ports, f.owner); const saved = f.store.get(f.run.id)!; assert.equal(saved.state, expected); assert.equal(f.ports.counts.rollback, rollback); assert.equal(saved.artifacts.filter(a => a.app !== 'Vercel').length, 3); assert.ok(saved.finishedAt); assert.equal(saved.context.verified === true, expected === 'RESOLVED'); for (const action of f.store.actions(saved.id)) { assert.equal(action.status, 'complete'); assert.ok(action.startedAt && action.updatedAt); assert.ok(action.actionKey.startsWith(saved.id + ':')); assert.ok(action.result.acceptedAt); assert.equal(action.result.actionKey, action.actionKey); } if (expected === 'RESOLVED') assert.equal(saved.context.verification?.length, 3); } finally { f.store.close(); }
  });
}
test('duplicate delivery and simultaneous live alerts reuse a persistent incident', () => {
  const store = new Store(':memory:');
  try { const input = { eventKey: 'slack:1', mode: 'live' as const, scenario: 'checkout-regression' as const, title: 'Incident' }; const first = store.enqueue(input); assert.equal(store.enqueue(input).id, first.id); assert.equal(store.enqueue({ ...input, eventKey: 'slack:2' }).id, first.id); assert.equal(store.list().length, 1); } finally { store.close(); }
});
test('claims exclude competing workers; expired lease cannot write', () => {
  const f = fixture(); try { assert.equal(f.store.claim('other'), undefined); f.store.db.prepare('UPDATE incidents SET lease_until=0 WHERE id=?').run(f.run.id); assert.ok(f.store.claim('other')); assert.throws(() => f.store.save(f.run, f.owner), /lease lost/); assert.throws(() => f.store.heartbeat(f.run.id, f.owner), /lease lost/); } finally { f.store.close(); }
});
test('SQLite survives close/reopen and deduplicates across separate connections', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sentinel-store-test-')); const file = join(directory, 'test.sqlite');
  const first = new Store(file); const input = { eventKey: 'durable-event', mode: 'sandbox' as const, scenario: 'checkout-regression' as const, title: 'Persisted' }; const id = first.enqueue(input).id;
  const second = new Store(file); try { assert.equal(second.enqueue(input).id, id); assert.ok(first.claim('worker-a')); assert.equal(second.claim('worker-b'), undefined); } finally { first.close(); second.close(); }
  const reopened = new Store(file); try { assert.equal(reopened.get(id)?.title, 'Persisted'); } finally { reopened.close(); rmSync(directory, { recursive: true }); }
});
test('transient report retries do not repeat rollback or completed issues', async () => {
  const f = fixture('report-outage'); try {
    await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(f.store.get(f.run.id)?.state, 'REPORTING'); assert.equal(f.ports.counts.Slack, 0);
    f.store.db.prepare('UPDATE incidents SET due=0').run(); const resumed = f.store.claim(f.owner)!; const ports = sandboxPorts(resumed, f.store, true);
    await executeIncident(f.store, resumed, ports, f.owner); assert.equal(f.store.get(f.run.id)?.state, 'RESOLVED'); assert.equal(ports.counts.rollback, 0); assert.equal(ports.counts.GitHub, 0); assert.equal(ports.counts.Linear, 1); assert.equal(ports.counts.Slack, 1); assert.deepEqual(f.store.get(f.run.id)?.reportingErrors, []);
  } finally { f.store.close(); }
});
test('timeout after rollback dispatch escalates and never blindly replays', async () => {
  const f = fixture(); let writes = 0; f.ports.rollback = async () => { writes++; throw new ProviderError('Timeout after dispatch', false, true); };
  try { await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(writes, 1); assert.equal(f.store.get(f.run.id)?.state, 'ESCALATED'); assert.equal(f.store.action(f.run.id, 'rollback:sandbox-good')?.status, 'unknown'); assert.equal(f.store.get(f.run.id)?.context.verified, undefined); } finally { f.store.close(); }
});
test('restart with pending rollback receipt escalates without another write', async () => {
  const f = fixture(); f.store.setAction(f.run.id, 'rollback:sandbox-good', 'started');
  try { await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(f.store.get(f.run.id)?.state, 'ESCALATED'); assert.equal(f.ports.counts.rollback, 0); } finally { f.store.close(); }
});
test('completed receipt recovers after crash before incident body save', async () => {
  const f = fixture(); f.store.setAction(f.run.id, 'rollback:sandbox-good', 'complete', { app: 'Vercel', id: 'sandbox-good' }); const ports = sandboxPorts(f.run, f.store, true);
  try { await executeIncident(f.store, f.run, ports, f.owner); assert.equal(f.store.get(f.run.id)?.state, 'RESOLVED'); assert.equal(ports.counts.rollback, 0); } finally { f.store.close(); }
});
test('fresh preflight stops a new deployment that arrives during diagnosis', async () => {
  const f = fixture(); const original = f.ports.investigate; let reads = 0; f.ports.investigate = async () => { const input = await original(); if (++reads > 1) input.current.id = 'new-deployment'; return input; };
  try { await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(f.ports.counts.rollback, 0); assert.equal(f.store.get(f.run.id)?.state, 'FAILED'); } finally { f.store.close(); }
});
test('disabled production switch requires review and cannot be overridden by acknowledgment', async () => {
  const f = fixture(); f.ports.productionActions = false;
  try { await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(f.ports.counts.rollback, 0); const run = f.store.acknowledge(f.run.id, 'operator'); assert.equal(run.state, 'APPROVAL_REQUIRED'); assert.equal(run.approval?.decision, 'acknowledge'); assert.deepEqual(f.store.acknowledge(f.run.id, 'operator'), run); assert.equal(f.store.claim(f.owner), undefined); } finally { f.store.close(); }
});
test('model failure cannot fall back to a fabricated diagnosis', async () => {
  const f = fixture(); f.ports.diagnose = async () => { throw new Error('AI unavailable'); };
  try { await executeIncident(f.store, f.run, f.ports, f.owner); assert.equal(f.ports.counts.rollback, 0); assert.equal(f.store.get(f.run.id)?.state, 'FAILED'); assert.equal(f.store.get(f.run.id)?.context.diagnosis, undefined); } finally { f.store.close(); }
});
test('permanently failed reporting stays visible without pretending delivery', async () => {
  const f = fixture(); f.ports.report = async () => { throw new ProviderError('Scope missing'); };
  try { await executeIncident(f.store, f.run, f.ports, f.owner); const saved = f.store.get(f.run.id)!; assert.equal(saved.state, 'RESOLVED'); assert.equal(saved.reportingErrors.length, 3); assert.equal(saved.artifacts.length, 1); } finally { f.store.close(); }
});
const mutations: [string, (i: Investigation, d: Diagnosis) => void][] = [
  ['missing evidence', i => { i.changes.complete = false; }],
  ['empty changes', i => { i.changes.files = []; }],
  ['migration filename', i => { i.changes.files[0].filename = 'demo-target/migrations/001.sql'; }],
  ['renamed schema file', i => { i.changes.files[0].previousFilename = 'demo-target/schema.sql'; }],
  ['schema mismatch', i => { i.baseline.schemaVersion = '15'; }],
  ['contract mismatch', i => { i.baseline.contractVersion = '2'; }],
  ['unknown schema', i => { i.candidateHealth.schemaVersion = ''; }],
  ['unhealthy candidate', i => { i.candidateHealth.checkoutOk = false; }],
  ['wrong candidate identity', i => { i.candidateHealth.deploymentId = 'another'; }],
  ['wrong production identity', i => { i.baseline.deploymentId = 'another'; }],
  ['wrong project', i => { i.candidate.projectId = 'other'; }],
  ['wrong repository', i => { i.candidate.repo = 'other/repo'; }],
  ['preview candidate', i => { i.candidate.target = 'preview'; }],
  ['newer candidate', i => { i.candidate.createdAt = 3000; }],
  ['same commit', i => { i.candidate.sha = i.current.sha; }],
  ['excessive blast radius', i => { i.changes.files[0].filename = 'infrastructure/terraform.tf'; }],
  ['too many files', i => { i.changes.files = Array.from({ length: 21 }, (_, n) => ({ filename: 'demo-target/' + n })); }],
  ['slow candidate', i => { i.candidateHealth.latencyMs = 1800; }],
  ['too few probes', i => { i.candidateHealth.samples = 1; }],
  ['low confidence', (_, d) => { d.confidence = .7; }],
  ['NaN confidence', (_, d) => { d.confidence = NaN; }],
  ['no citation', (_, d) => { d.citations = []; }],
  ['model escalation', (_, d) => { d.recommendation = 'escalate'; }],
];
for (const [name, mutate] of mutations) test('policy fails closed: ' + name, async () => {
  const f = fixture(); try { const input = await f.ports.investigate(); const diagnosis = await f.ports.diagnose(input, f.run.id); assert.equal(rollbackPolicy(input, diagnosis, ['demo-target/']).allowed, true); mutate(input, diagnosis); assert.equal(rollbackPolicy(input, diagnosis, ['demo-target/']).allowed, false); } finally { f.store.close(); }
});
