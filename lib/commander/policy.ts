import type { Investigation, Diagnosis, Policy, Sample } from './types';

export function healthy(sample: Sample, expectedId?: string): boolean {
  return sample.healthOk && sample.checkoutOk && sample.samples >= 5 && sample.failures === 0 &&
    sample.errorRate < 1 && sample.latencyMs < 800 && Boolean(sample.schemaVersion) && Boolean(sample.contractVersion) &&
    (!expectedId || sample.deploymentId === expectedId);
}

export function rollbackPolicy(input: Investigation, diagnosis: Diagnosis, allowedPaths: string[]): Policy {
  const paths = input.changes.files.flatMap(f => [f.filename, ...(f.previousFilename ? [f.previousFilename] : [])]);
  const risky = paths.filter(p => /(^|\/)(migrations?|schema|prisma|drizzle|queues?|events?|contracts?)(\/|\.)/i.test(p));
  const gates = [
    { name: 'Complete evidence', passed: input.changes.complete && paths.length > 0 && Boolean(input.current.sha && input.candidate.sha && input.current.sha !== input.candidate.sha), reason: 'Full Git comparison and distinct commit SHAs are required.' },
    { name: 'Deployment identity', passed: Boolean(input.current.id && input.candidate.id && input.current.projectId && input.current.repo) && input.current.ready && input.current.target === 'production' && input.current.id !== input.candidate.id && input.current.projectId === input.candidate.projectId && input.current.repo === input.candidate.repo && input.candidate.ready && input.candidate.target === 'production' && input.candidate.createdAt < input.current.createdAt, reason: 'Both deployments must be ready production deployments of this repository/project; candidate must be older.' },
    { name: 'Database and contracts', passed: risky.length === 0 && input.baseline.schemaVersion === input.candidateHealth.schemaVersion && input.baseline.contractVersion === input.candidateHealth.contractVersion, reason: risky.length ? 'Risky changes: ' + risky.join(', ') : 'Schema and event contract versions must match the known-good target.' },
    { name: 'Bounded change', passed: paths.every(p => allowedPaths.some(prefix => p.startsWith(prefix))) && paths.length <= 20, reason: 'Every changed file must be inside the configured application paths; at most 20 files.' },
    { name: 'Known-good target', passed: healthy(input.candidateHealth, input.candidate.id), reason: 'Candidate health, checkout, identity and synthetic latency checks must pass.' },
    { name: 'Failure confirmed', passed: input.baseline.healthOk && input.baseline.samples >= 5 && input.baseline.failures > 0 && input.baseline.deploymentId === input.current.id && !input.baseline.checkoutOk && input.baseline.errorRate >= 5, reason: 'Production health/identity and at least five failing-window checkout probes must agree with the incident.' },
    { name: 'Evidence-supported diagnosis', passed: Number.isFinite(diagnosis.confidence) && diagnosis.confidence >= 0.85 && diagnosis.recommendation === 'rollback' && diagnosis.citations.includes(input.current.sha), reason: 'Model confidence ≥85%, rollback recommendation, and current commit citation required.' },
  ];
  return { allowed: gates.every(g => g.passed), gates };
}
