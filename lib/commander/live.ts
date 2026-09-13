import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LiveConfig } from './config';
import { redact } from './config';
import { jsonRequest, ProviderError, sleep } from './http';
import { diagnose } from './agent';
import { reportText } from './report';
import type { Store } from './store';
import type { Incident, Deployment, Ports, Sample, Changes, Artifact } from './types';

const deploymentSchema = z.object({ id: z.string(), url: z.string(), projectId: z.string(), createdAt: z.number(), target: z.string().nullable(), readyState: z.string(), meta: z.record(z.string(), z.string()).default({}) });
const comparisonSchema = z.object({ status: z.string(), total_commits: z.number(), commits: z.array(z.unknown()), files: z.array(z.object({ filename: z.string(), previous_filename: z.string().optional(), patch: z.string().optional() })), html_url: z.url() });
const probeSchema = z.object({ service: z.literal('sentinel-checkout-demo'), deploymentId: z.string().min(1), schemaVersion: z.string().min(1), contractVersion: z.string().min(1), ok: z.boolean(), dryRun: z.boolean().optional(), nonce: z.string(), error: z.string().optional() });
export function livePorts(run: Incident, store: Store, config: LiveConfig): Ports {
  const team = '?teamId=' + encodeURIComponent(config.VERCEL_TEAM_ID);
  const vercelHeaders = { Authorization: 'Bearer ' + config.VERCEL_ACCESS_TOKEN, 'Content-Type': 'application/json' };
  const githubHeaders = { Authorization: 'Bearer ' + config.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' };
  const vercel = <T,>(path: string, init: RequestInit = {}, write = false) => jsonRequest<T>('https://api.vercel.com' + path + team, { ...init, headers: vercelHeaders }, { write });
  const github = <T,>(path: string, init: RequestInit = {}, write = false) => jsonRequest<T>('https://api.github.com/repos/' + config.GITHUB_REPOSITORY + path, { ...init, headers: githubHeaders }, { write });
  async function checkCurrent() {
    const alias = z.object({ deploymentId: z.string(), projectId: z.string(), redirect: z.string().nullable().optional() }).parse(await vercel('/v4/aliases/' + new URL(config.TARGET_PRODUCTION_URL).hostname));
    if (alias.projectId !== config.VERCEL_PROJECT_ID || alias.redirect) throw new Error('Configured production alias does not directly route to the allowed project');
    return alias.deploymentId;
  }
  async function deployment(id: string): Promise<Deployment> {
    const d = deploymentSchema.parse(await vercel('/v13/deployments/' + encodeURIComponent(id)));
    const repo = d.meta.githubCommitOrg + '/' + d.meta.githubCommitRepo;
    const sha = d.meta.githubCommitSha || '';
    if (d.projectId !== config.VERCEL_PROJECT_ID || repo.toLowerCase() !== config.GITHUB_REPOSITORY.toLowerCase() || !/^[0-9a-f]{40}$/.test(sha) || !/^[a-zA-Z0-9-]+\.vercel\.app$/.test(d.url)) throw new Error('Deployment identity/repository metadata is missing or outside the disposable project');
    return { id: d.id, url: 'https://' + d.url, sha, projectId: d.projectId, createdAt: d.createdAt, target: d.target || 'unknown', ready: d.readyState === 'READY', repo: repo.toLowerCase() };
  }
  async function changes(candidate: Deployment, current: Deployment): Promise<Changes> {
    const comparison = comparisonSchema.parse(await github('/compare/' + candidate.sha + '...' + current.sha));
    const prs = z.array(z.object({ number: z.number(), html_url: z.url(), title: z.string() })).parse(await github('/commits/' + current.sha + '/pulls'));
    const files = comparison.files.map(f => ({ filename: f.filename, previousFilename: f.previous_filename, patch: f.patch ? redact(f.patch).slice(0, 12000) : undefined }));
    const complete = comparison.status === 'ahead' && comparison.files.length < 300 && comparison.total_commits === comparison.commits.length && comparison.files.every(f => f.patch && f.patch.length <= 12000) && comparison.files.length <= 20;
    return { complete, files, prs: prs.map(p => ({ number: p.number, url: p.html_url, title: redact(p.title).slice(0, 300) })), url: comparison.html_url };
  }
  async function probe(target: Deployment | 'production'): Promise<Sample> {
    const origin = target === 'production' ? config.TARGET_PRODUCTION_URL : target.url;
    if (!/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app\/?$/.test(origin)) throw new Error('Probe target outside allowed Vercel demo hosts');
    const headers: Record<string, string> = { Authorization: 'Bearer ' + config.TARGET_PROBE_TOKEN, 'Content-Type': 'application/json' };
    if (config.VERCEL_PROTECTION_BYPASS) headers['x-vercel-protection-bypass'] = config.VERCEL_PROTECTION_BYPASS;
    async function request(path: string, checkout: boolean) {
      const nonce = randomUUID(); const started = Date.now();
      try {
        const response = await fetch(new URL(path + '?nonce=' + nonce, origin), { method: checkout ? 'POST' : 'GET', headers, body: checkout ? JSON.stringify({ dryRun: true, promoCode: null, quantity: 1, nonce }) : undefined, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000) });
        const parsed = probeSchema.safeParse(await response.json());
        const data = parsed.success && parsed.data.nonce === nonce ? parsed.data : null;
        return { ok: response.ok && data?.ok === true && (!checkout || data.dryRun === true), data, ms: Date.now() - started };
      } catch { return { ok: false, data: null, ms: Date.now() - started }; }
    }
    const health = await request('/api/health', false);
    const results = await Promise.all(Array.from({ length: 5 }, () => request('/api/checkout', true)));
    const identity = health.data;
    const consistent = (d: typeof identity) => Boolean(d && identity && d.deploymentId === identity.deploymentId && d.schemaVersion === identity.schemaVersion && d.contractVersion === identity.contractVersion);
    const failures = results.filter(r => !r.ok || !consistent(r.data)).length;
    const latencies = results.map(r => r.ms).sort((a, b) => a - b);
    return { at: new Date().toISOString(), healthOk: health.ok, checkoutOk: failures === 0, deploymentId: identity?.deploymentId || 'unknown', schemaVersion: identity?.schemaVersion || '', contractVersion: identity?.contractVersion || '', failures, samples: results.length, errorRate: failures / results.length * 100, latencyMs: latencies[Math.ceil(results.length * .95) - 1], source: 'synthetic' };
  }
  async function runtimeLogs(current: Deployment) {
    // Live stream, not a historical error-rate API. Bound both bytes and time.
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 10000);
    let content = ''; let note = 'Ten-second live runtime-log sample; absence does not imply no errors.';
    try {
      const response = await fetch('https://api.vercel.com/v1/projects/' + config.VERCEL_PROJECT_ID + '/deployments/' + current.id + '/runtime-logs' + team, { headers: vercelHeaders, signal: abort.signal, redirect: 'error', cache: 'no-store' });
      if (!response.ok || !response.body) return `Runtime logs unavailable (HTTP ${response.status}); diagnosis uses measured probes and Git evidence.`;
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      try { while (content.length < 16000) { const chunk = await reader.read(); if (chunk.done) break; content += decoder.decode(chunk.value, { stream: true }); } }
      finally { await reader.cancel().catch(() => {}); }
    } catch { note += ' Stream ended or timed out.'; }
    finally { clearTimeout(timer); }
    return note + '\n' + (content ? redact(content.slice(0, 16000)) : 'No runtime log entries captured.');
  }
  async function slack(text: string, marker: string): Promise<Artifact> {
    const result = await jsonRequest<{ ok: boolean; error?: string; ts?: string; channel?: string }>('https://slack.com/api/chat.postMessage', {
      method: 'POST', headers: { Authorization: 'Bearer ' + config.SLACK_BOT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: config.SLACK_INCIDENT_CHANNEL_ID, thread_ts: run.threadTs, text: redact(text).slice(0, 15000), mrkdwn: false, unfurl_links: false, unfurl_media: false, metadata: { event_type: 'sentinel_incident', event_payload: { incident_id: run.id, marker } } }),
    }, { write: true });
    if (!result.ok) {
      const retry = result.error === 'ratelimited';
      const definitive = ['not_authed', 'invalid_auth', 'account_inactive', 'token_revoked', 'channel_not_found', 'not_in_channel', 'missing_scope', 'is_archived', 'no_permission', 'msg_too_long', 'invalid_arguments'].includes(result.error || '');
      throw new ProviderError('Slack rejected message: ' + (result.error || 'invalid response'), retry, !retry && !definitive, retry ? 2000 : 0);
    }
    if (!result.ts || result.channel !== config.SLACK_INCIDENT_CHANNEL_ID) throw new ProviderError('Slack returned an incomplete receipt', false, true);
    return { app: 'Slack', id: result.ts, url: 'https://app.slack.com/client/' + config.SLACK_TEAM_ID + '/' + result.channel + '/thread/' + result.channel + '-' + (run.threadTs || result.ts), note: 'Message delivered to the allowed incident channel.' };
  }
  return {
    productionActions: config.ALLOW_PRODUCTION_ACTIONS === 'true', reportApps: ['GitHub', 'Linear', 'Slack'], sleep, verificationIntervalMs: 5000,
    investigate: async () => {
      const currentId = await checkCurrent();
      const [current, candidate] = await Promise.all([deployment(currentId), deployment(config.VERCEL_KNOWN_GOOD_DEPLOYMENT_ID)]);
      const [diff, logs, baseline, candidateHealth] = await Promise.all([changes(candidate, current), runtimeLogs(current), probe('production'), probe(candidate)]);
      return { current, candidate, changes: diff, logs, baseline, candidateHealth };
    },
    diagnose: (input, id) => diagnose(input, id, store, config.AI_MODEL), checkCurrent, probe,
    rollback: async (target, expectedCurrent) => {
      if (config.ALLOW_PRODUCTION_ACTIONS !== 'true' || target.id !== config.VERCEL_KNOWN_GOOD_DEPLOYMENT_ID || target.projectId !== config.VERCEL_PROJECT_ID) throw new ProviderError('Rollback target/switch rejected');
      if (await checkCurrent() !== expectedCurrent) throw new ProviderError('Production changed immediately before rollback; manual review required');
      let receipt: { status: number; requestId?: string } | undefined;
      await jsonRequest('https://api.vercel.com/v1/projects/' + config.VERCEL_PROJECT_ID + '/rollback/' + target.id + team, { method: 'POST', headers: vercelHeaders, body: '{}' }, { write: true, onResponse: value => { receipt = value; } });
      return { app: 'Vercel', id: target.id, url: target.url, responseStatus: receipt?.status, requestId: receipt?.requestId, note: 'Rollback API accepted. ID is the target deployment, not an invented operation ID. Not proof of recovery.' };
    },
    progress: (incident) => slack('Sentinel received ' + incident.id + '. Investigating the configured disposable checkout project. Evidence, safety gates, and recovery results will follow. No recovery has been confirmed.', incident.id + ':received'),
    report: async (app, incident, marker) => {
      const body = redact(reportText(incident));
      if (app === 'Slack') return slack(body + '\n\nDashboard: ' + config.SENTINEL_PUBLIC_URL.replace(/\/$/, '') + '/?incident=' + incident.id, marker);
      if (app === 'GitHub') {
        const result = await github<{ number?: number; html_url?: string }>('/issues', { method: 'POST', body: JSON.stringify({ title: '[Sentinel] Checkout incident ' + incident.id.slice(0, 8) + ' — ' + incident.outcome, body: body + '\n\n<!-- sentinel:' + marker + ' -->' }) }, true);
        if (!result.number || !result.html_url?.startsWith('https://github.com/')) throw new ProviderError('GitHub returned an incomplete issue receipt', false, true);
        return { app, id: String(result.number), url: result.html_url };
      }
      const result = await jsonRequest<{ data?: { issueCreate?: { success: boolean; issue?: { id: string; url: string } } }; errors?: { extensions?: { code?: string } }[] }>('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: config.LINEAR_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'mutation CreateIncident($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url } } }', variables: { input: { teamId: config.LINEAR_TEAM_ID, title: '[Sentinel] Checkout incident ' + incident.id.slice(0, 8), description: body + '\n\nSentinel delivery: ' + marker, priority: incident.outcome === 'RESOLVED' ? 2 : 1 } } }) }, { write: true });
      if (result.errors?.length) {
        const retry = result.errors.every(e => e.extensions?.code === 'RATELIMITED');
        const rejected = result.errors.every(e => ['AUTHENTICATION_ERROR', 'FORBIDDEN', 'BAD_USER_INPUT', 'GRAPHQL_VALIDATION_FAILED'].includes(e.extensions?.code || ''));
        throw new ProviderError('Linear returned GraphQL errors; inspect delivery before replay', retry, !retry && !rejected, retry ? 2000 : 0);
      }
      const created = result.data?.issueCreate;
      if (!created?.success || !created.issue?.id || !created.issue.url?.startsWith('https://linear.app/')) throw new ProviderError('Linear returned an incomplete issue receipt', false, true);
      return { app, id: created.issue.id, url: created.issue.url };
    },
  };
}
