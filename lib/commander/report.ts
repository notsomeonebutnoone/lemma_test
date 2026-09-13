import type { Incident } from './types';
export function reportText(run: Incident) {
  const c = run.context;
  return [
    `Sentinel ${run.mode.toUpperCase()} incident ${run.id}`,
    `Outcome: ${run.outcome || run.state}`, run.summary,
    c.diagnosis ? `Hypothesis: ${c.diagnosis.hypothesis}\nModel confidence: ${Math.round(c.diagnosis.confidence * 100)}% (uncalibrated). Evidence: ${c.diagnosis.citations.join(', ')}` : 'No valid model diagnosis.',
    c.current ? `Current: ${c.current.id} @ ${c.current.sha}\nCandidate: ${c.candidate?.id} @ ${c.candidate?.sha}` : '',
    c.changes ? `Comparison: ${c.changes.url}` : '',
    c.baseline ? `Baseline synthetic checks: ${c.baseline.failures}/${c.baseline.samples} failed, p95 ${c.baseline.latencyMs} ms. These are NOT customer traffic metrics.` : '',
    c.policy ? 'Policy:\n' + c.policy.gates.map(g => `${g.passed ? 'PASS' : 'BLOCK'}: ${g.name} — ${g.reason}`).join('\n') : '',
    c.verification ? 'Recovery windows: ' + c.verification.map(s => `${s.failures}/${s.samples} failures @ ${s.deploymentId}`).join('; ') : '',
    'Forward-fix checklist: reproduce nullable-promo failure; restore compatibility; add regression tests; review schema/contract changes; deploy through review. This ticket intentionally remains open.',
    run.artifacts.map(a => `${a.app}: ${a.url || a.id}`).join('\n'),
    run.reportingErrors.length ? 'Reporting gaps: ' + run.reportingErrors.join('; ') : '',
  ].filter(Boolean).join('\n\n');
}
