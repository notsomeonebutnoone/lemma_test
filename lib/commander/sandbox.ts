import { randomUUID } from 'node:crypto';
import type { Incident, Ports, Investigation, Sample, Scenario } from './types';
import { ProviderError, sleep } from './http';
import { Store } from './store';

export function sandboxPorts(run: Incident, store: Store, fast = false): Ports & { counts: Record<string, number> } {
  const counts: Record<string, number> = { rollback: 0, GitHub: 0, Linear: 0, Slack: 0 };
  let rolled = Boolean(run.context.rollback || store.action(run.id, 'rollback:sandbox-good')?.status === 'complete');
  const current = { id: 'sandbox-bad', url: 'sandbox://bad', sha: 'sandbox-commit-bad', projectId: 'sandbox-project', createdAt: 2000, target: 'production', ready: true, repo: 'sandbox/checkout' };
  const candidate = { ...current, id: 'sandbox-good', sha: 'sandbox-commit-good', url: 'sandbox://good', createdAt: 1000 };
  const sample = (good: boolean): Sample => ({ at: new Date().toISOString(), healthOk: true, checkoutOk: good, deploymentId: good ? candidate.id : current.id, schemaVersion: !good && run.scenario === 'unsafe-migration' ? '15' : '14', contractVersion: '1', errorRate: good ? 0 : 100, latencyMs: good ? 110 : 150, samples: 5, failures: good ? 0 : 5, source: 'synthetic' });
  const input: Investigation = { current, candidate, baseline: sample(false), candidateHealth: sample(true), changes: { complete: true, files: [{ filename: run.scenario === 'unsafe-migration' ? 'demo-target/migrations/015_orders.sql' : 'demo-target/lib/release.mjs', patch: '+ checkout parser changed' }], prs: [], url: 'sandbox://comparison' }, logs: { source: 'sandbox fixture', error: 'Missing promo code passed to strict parser' } };
  return {
    counts, productionActions: true, reportApps: ['GitHub', 'Linear', 'Slack'], verificationIntervalMs: fast ? 0 : 500,
    sleep: fast ? async () => {} : sleep,
    investigate: async () => { if (!fast) await sleep(250); return structuredClone(input); },
    diagnose: async (_, id) => {
      const diagnosis = { hypothesis: run.scenario === 'unsafe-migration' ? 'Orders schema change is incompatible with the previous deployment.' : 'Checkout rejects the missing optional promo code after the parser change.', confidence: 0.95, recommendation: 'rollback' as const, citations: [current.sha], model: 'deterministic sandbox fixture', generationId: randomUUID(), inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: ['inspectTelemetry', 'inspectGitChange'] };
      store.generation(diagnosis.generationId, id, diagnosis); return diagnosis;
    },
    checkCurrent: async () => rolled && run.scenario !== 'false-success' ? candidate.id : current.id,
    probe: async target => sample(target !== 'production' || (rolled && run.scenario !== 'false-success')),
    rollback: async () => { counts.rollback++; rolled = true; return { app: 'Vercel', id: candidate.id, note: 'Simulated rollback receipt' }; },
    report: async app => {
      counts[app]++;
      if (run.scenario === 'report-outage' && app === 'Linear' && run.attempts < 2) throw new ProviderError('Simulated Linear 429', true);
      return { app, id: 'sandbox-' + app.toLowerCase() + '-' + run.id.slice(0, 8), note: 'Simulated artifact; no external service called' };
    },
  };
}

export const scenarios: { id: Scenario; label: string }[] = [
  { id: 'checkout-regression', label: 'Safe rollback' }, { id: 'unsafe-migration', label: 'Unsafe migration' },
  { id: 'false-success', label: 'API success, checkout still broken' }, { id: 'report-outage', label: 'Reporting rate limit' },
];
