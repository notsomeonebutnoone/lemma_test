export type Mode = 'sandbox' | 'live';
export type Scenario = 'checkout-regression' | 'unsafe-migration' | 'false-success' | 'report-outage';
export type State = 'RECEIVED' | 'INVESTIGATING' | 'DIAGNOSED' | 'SAFETY_CHECK' | 'REMEDIATING' | 'VERIFYING' | 'REPORTING' | 'RESOLVED' | 'APPROVAL_REQUIRED' | 'FAILED' | 'ESCALATED';
export type AppName = 'Slack' | 'Vercel' | 'GitHub' | 'Linear' | 'Sentinel';
export type Evidence = { id: string; at: string; app: AppName; title: string; detail: string; status: 'success' | 'blocked' | 'error' | 'info'; durationMs: number; data?: unknown };
export type Deployment = { id: string; url: string; sha: string; projectId: string; createdAt: number; target: string; ready: boolean; repo: string };
export type Changes = { complete: boolean; files: { filename: string; patch?: string; previousFilename?: string }[]; prs: { number: number; url: string; title: string }[]; url: string };
export type Sample = { at: string; healthOk: boolean; checkoutOk: boolean; deploymentId: string; schemaVersion: string; contractVersion: string; errorRate: number; latencyMs: number; samples: number; failures: number; source: 'synthetic'; };
export type Diagnosis = { hypothesis: string; confidence: number; recommendation: 'rollback' | 'escalate'; citations: string[]; model: string; generationId: string; inputTokens: number; outputTokens: number; costUsd: number | null; toolCalls: string[]; };
export type Gate = { name: string; passed: boolean; reason: string };
export type Policy = { allowed: boolean; gates: Gate[]; };
export type Artifact = { app: AppName; id: string; url?: string; note?: string; actionKey?: string; acceptedAt?: string; responseStatus?: number; requestId?: string };
export type Context = { current?: Deployment; candidate?: Deployment; changes?: Changes; baseline?: Sample; candidateHealth?: Sample; diagnosis?: Diagnosis; policy?: Policy; rollback?: Artifact; verification?: Sample[]; verified?: boolean; logs?: unknown; };
export type Incident = {
  id: string; eventKey: string; mode: Mode; scenario: Scenario; title: string; state: State;
  createdAt: string; updatedAt: string; finishedAt?: string; source: 'dashboard' | 'slack';
  channel?: string; threadTs?: string; summary: string; outcome?: 'RESOLVED' | 'APPROVAL_REQUIRED' | 'FAILED' | 'ESCALATED';
  evidence: Evidence[]; artifacts: Artifact[]; context: Context; reportingErrors: string[]; attempts: number;
  approval?: { actor: string; decision: 'acknowledge' | 'retry'; at: string };
};
export type Investigation = { current: Deployment; candidate: Deployment; changes: Changes; baseline: Sample; candidateHealth: Sample; logs: unknown };
export interface Ports {
  progress?(incident: Incident): Promise<Artifact>;
  investigate(): Promise<Investigation>;
  diagnose(input: Investigation, incidentId: string): Promise<Diagnosis>;
  checkCurrent(): Promise<string>;
  probe(target: Deployment | 'production'): Promise<Sample>;
  rollback(target: Deployment, expectedCurrent: string): Promise<Artifact>;
  report(app: 'Slack' | 'GitHub' | 'Linear', incident: Incident, marker: string): Promise<Artifact>;
  productionActions: boolean;
  reportApps: ('Slack' | 'GitHub' | 'Linear')[];
  sleep(ms: number): Promise<void>;
  verificationIntervalMs: number;
}
