import { randomUUID } from 'node:crypto';
import type { AppName, Incident, Investigation, Ports, Artifact } from './types';
import { Store } from './store';
import { healthy, rollbackPolicy } from './policy';
import { ProviderError } from './http';

export class UncertainAction extends Error {}

export async function executeIncident(store: Store, run: Incident, ports: Ports, owner: string, allowedPaths = ['demo-target/']) {
  const save = () => store.save(run, owner);
  const add = (app: AppName, title: string, detail: string, status: 'success' | 'blocked' | 'error' | 'info', data?: unknown, durationMs = 0) => {
    run.evidence.push({ id: randomUUID(), at: new Date().toISOString(), app, title, detail, status, data, durationMs }); save();
  };
  const state = (next: Incident['state']) => { run.state = next; save(); };
  const once = async (key: string, call: () => Promise<Artifact>) => {
    store.assertLease(run.id, owner);
    const prior = store.action(run.id, key);
    if (prior?.status === 'complete') return prior.result as Artifact;
    if (prior && ['started', 'unknown'].includes(prior.status)) throw new UncertainAction('Delivery of ' + key + ' is uncertain. Inspect the external artifact before retrying.');
    if (prior?.status === 'failed') throw new ProviderError('Previous ' + key + ' was rejected; operator review required');
    store.setAction(run.id, key, 'started');
    try {
      const result = { ...await call(), actionKey: run.id + ':' + key, acceptedAt: new Date().toISOString() };
      store.assertLease(run.id, owner);
      store.setAction(run.id, key, 'complete', result); return result;
    } catch (error) {
      store.assertLease(run.id, owner);
      const known = error instanceof ProviderError;
      store.setAction(run.id, key, known && error.retryable ? 'retryable' : known && !error.ambiguous ? 'failed' : 'unknown');
      if (!known || error.ambiguous) throw new UncertainAction('Delivery of ' + key + ' is uncertain. Automatic replay has been stopped.');
      throw error;
    }
  };
  const putArtifact = (artifact: Artifact) => { if (!run.artifacts.some(a => a.app === artifact.app && a.id === artifact.id)) run.artifacts.push(artifact); save(); };
  run.attempts++; save();
  try {
    if (!run.outcome) {
      if (ports.progress && !run.evidence.some(e => e.title === 'Slack intake delivered')) {
        const receipt = await once('progress:Slack', () => ports.progress!(run));
        if (!run.threadTs) { run.threadTs = receipt.id; save(); }
        add('Slack', 'Slack intake delivered', receipt.note || receipt.id, 'success', receipt);
      }
      if (!run.context.current) {
        state('INVESTIGATING'); const start = Date.now();
        const evidence = await ports.investigate(); Object.assign(run.context, evidence);
        add('Vercel', 'Deployment and failure evidence collected', 'Production and candidate identities, metadata and probes retrieved.', 'success', { current: evidence.current, candidate: evidence.candidate, baseline: evidence.baseline, candidateHealth: evidence.candidateHealth, logs: evidence.logs }, Date.now() - start);
        add('GitHub', 'Commit comparison retrieved', evidence.changes.files.length + ' changed files; comparison ' + (evidence.changes.complete ? 'complete' : 'incomplete'), 'success', evidence.changes);
      }
      const investigation = run.context as Investigation;
      if (!run.context.diagnosis) {
        const start = Date.now(); run.context.diagnosis = await ports.diagnose(investigation, run.id);
        state('DIAGNOSED'); add('Sentinel', 'Diagnosis saved', run.context.diagnosis.hypothesis, 'success', run.context.diagnosis, Date.now() - start);
      }
      state('SAFETY_CHECK');
      run.context.policy = rollbackPolicy(investigation, run.context.diagnosis, allowedPaths); save();
      if (!run.context.policy.allowed) {
        run.outcome = 'APPROVAL_REQUIRED';
        run.summary = 'Rollback blocked: ' + run.context.policy.gates.filter(g => !g.passed).map(g => g.name).join(', ') + '. Review evidence and prepare a forward fix.';
        add('Sentinel', 'Rollback blocked by policy', run.summary, 'blocked', run.context.policy);
      } else if (!ports.productionActions) {
        run.outcome = 'APPROVAL_REQUIRED'; run.summary = 'Safety gates passed. The production-action switch is disabled; operator authorization is required.';
        add('Sentinel', 'Production switch disabled', run.summary, 'blocked', run.context.policy);
      } else {
        add('Sentinel', 'Safety checks passed', 'All deterministic rollback preconditions passed.', 'success', run.context.policy);
        if (!run.context.rollback) {
          state('REMEDIATING');
          const prior = store.action(run.id, 'rollback:' + investigation.candidate.id);
          if (prior?.status === 'started' || prior?.status === 'unknown') throw new UncertainAction('Rollback delivery is uncertain after interruption. Inspect production routing; do not replay.');
          if (prior?.status === 'complete') {
            run.context.rollback = prior.result as Artifact;
            putArtifact(run.context.rollback);
          } else {
          // Revalidate fresh evidence immediately before a side effect, even after a worker restart.
          const fresh = await ports.investigate();
          const policy = rollbackPolicy(fresh, run.context.diagnosis, allowedPaths);
          if (fresh.current.id !== investigation.current.id || fresh.candidate.id !== investigation.candidate.id || fresh.current.sha !== investigation.current.sha || fresh.candidate.sha !== investigation.candidate.sha || !policy.allowed) throw new Error('Production or rollback preconditions changed during diagnosis; manual review required');
          const start = Date.now();
          run.context.rollback = await once('rollback:' + investigation.candidate.id, () => ports.rollback(investigation.candidate, investigation.current.id));
          putArtifact(run.context.rollback);
          add('Vercel', 'Rollback request accepted', 'Verifying traffic and checkout before declaring recovery.', 'success', run.context.rollback, Date.now() - start);
          }
        }
        state('VERIFYING');
        run.context.verification = []; save();
        let consecutive = 0;
        for (let window = 0; window < 8; window++) {
          store.assertLease(run.id, owner);
          const sample = await ports.probe('production');
          const route = await ports.checkCurrent();
          const passed = route === investigation.candidate.id && healthy(sample, investigation.candidate.id);
          run.context.verification.push(sample); consecutive = passed ? consecutive + 1 : 0;
          add('Sentinel', 'Recovery window ' + (window + 1), (passed ? 'Passed' : 'Failed') + ': ' + consecutive + '/3 consecutive windows. Rates are synthetic sample measurements.', passed ? 'success' : 'error', { ...sample, routedDeployment: route, passed });
          if (consecutive === 3) break;
          if (window < 7) await ports.sleep(ports.verificationIntervalMs);
        }
        run.context.verified = consecutive === 3;
        run.outcome = consecutive === 3 ? 'RESOLVED' : 'FAILED';
        run.summary = consecutive === 3 ? 'Recovery verified: three consecutive synthetic checkout windows passed and production routes to ' + investigation.candidate.id + '. Follow-up issues remain open for the forward fix.' : 'Rollback was accepted, but recovery checks did not pass three consecutive windows. Incident remains unresolved.';
      }
      save();
    }
  } catch (error) {
    store.assertLease(run.id, owner);
    if (error instanceof ProviderError && error.retryable && run.attempts < 4) {
      add('Sentinel', 'Transient dependency failure', error.message + '; job will retry.', 'error');
      store.release(run, owner, false, Math.max(error.retryAfterMs, 1000 * 2 ** run.attempts)); return;
    }
    run.outcome = error instanceof UncertainAction ? 'ESCALATED' : 'FAILED';
    run.summary = error instanceof Error ? error.message : 'Investigation failed';
    add('Sentinel', 'Execution stopped', run.summary, 'error');
  }

  state('REPORTING'); run.reportingErrors = []; let retryReports = false, reportDelay = 0;
  // Ticket links are available before Slack posts its final message.
  for (const app of ports.reportApps) {
    if (app === 'Slack' && retryReports) continue;
    const start = Date.now();
    try {
      const artifact = await once('report:' + app, () => ports.report(app, run, run.id + ':' + app));
      putArtifact(artifact);
      if (!run.evidence.some(e => e.title === app + ' record delivered')) add(app, app + ' record delivered', artifact.note || artifact.id, 'success', artifact, Date.now() - start);
    } catch (error) {
      const message = app + ': ' + (error instanceof Error ? error.message : 'report failed');
      run.reportingErrors.push(message);
      add(app, 'Reporting incomplete', message, 'error');
      retryReports ||= error instanceof ProviderError && error.retryable && run.attempts < 4;
      if (error instanceof ProviderError) reportDelay = Math.max(reportDelay, error.retryAfterMs);
    }
  }
  if (retryReports) { store.release(run, owner, false, Math.max(reportDelay, 2000 * run.attempts)); return; }
  run.state = run.outcome || 'FAILED'; run.finishedAt = new Date().toISOString();
  store.release(run, owner, true);
}
