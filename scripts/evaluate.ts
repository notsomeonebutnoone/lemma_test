import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Store } from '../lib/commander/store';
import { sandboxPorts, scenarios } from '../lib/commander/sandbox';
import { executeIncident } from '../lib/commander/engine';
async function main() {
  const results = [];
  for (const scenario of scenarios) for (let repetition = 0; repetition < 10; repetition++) {
    const store = new Store(':memory:'); const owner = randomUUID();
    const enqueued = store.enqueue({ eventKey: randomUUID(), mode: 'sandbox', scenario: scenario.id, title: 'Evaluation ' + scenario.label });
    const started = performance.now(); const calls: Record<string, number> = {};
    for (let attempt = 0; attempt < 4; attempt++) {
      const run = store.claim(owner); if (!run) break;
      const ports = sandboxPorts(run, store, true); await executeIncident(store, run, ports, owner);
      for (const [key, value] of Object.entries(ports.counts)) calls[key] = (calls[key] || 0) + value;
      if (store.get(run.id)?.finishedAt) break;
      store.db.prepare('UPDATE incidents SET due=0 WHERE id=?').run(run.id); // Fast evaluation skips scheduled backoff, never used by production worker.
    }
    const run = store.get(enqueued.id)!;
    const expected = scenario.id === 'unsafe-migration' ? 'APPROVAL_REQUIRED' : scenario.id === 'false-success' ? 'FAILED' : 'RESOLVED';
    const pass = run.state === expected && calls.rollback === (scenario.id === 'unsafe-migration' ? 0 : 1) && run.reportingErrors.length === 0;
    results.push({ scenario: scenario.id, repetition: repetition + 1, expected, actual: run.state, pass, durationMs: Math.round(performance.now() - started), calls, verified: run.context.verified || false, windows: run.context.verification?.length || 0 }); store.close();
  }
  const report = { generatedAt: new Date().toISOString(), scope: 'LOCAL SANDBOX ONLY — deterministic fixtures, no external calls, no model. Retry delays skipped.', liveRehearsal: 'NOT RUN — operator will execute', total: results.length, passed: results.filter(r => r.pass).length, results };
  mkdirSync('artifacts', { recursive: true }); writeFileSync('artifacts/evaluation.json', JSON.stringify(report, null, 2));
  console.log(report.passed + '/' + report.total + ' sandbox evaluations passed. Saved artifacts/evaluation.json. This is not evidence of live integration reliability.');
  if (report.passed !== report.total) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
