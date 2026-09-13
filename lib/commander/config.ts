import { z } from 'zod';

const secret = z.string().min(16);
export const liveSchema = z.object({
  AI_GATEWAY_API_KEY: secret,
  AI_MODEL: z.string().min(3).default('openai/gpt-6-astra-fast'),
  SENTINEL_OPERATOR_TOKEN: z.string().min(32),
  SENTINEL_PUBLIC_URL: z.url().refine(v => { try { const u = new URL(v); return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password; } catch { return false; } }, 'Use your HTTPS tunnel origin'),
  SLACK_BOT_TOKEN: secret,
  SLACK_SIGNING_SECRET: secret,
  SLACK_TEAM_ID: z.string().regex(/^T[A-Z0-9]+$/),
  SLACK_INCIDENT_CHANNEL_ID: z.string().regex(/^[CG][A-Z0-9]+$/),
  VERCEL_ACCESS_TOKEN: secret,
  VERCEL_PROJECT_ID: z.string().regex(/^prj_[a-zA-Z0-9]+$/),
  VERCEL_TEAM_ID: z.string().regex(/^team_[a-zA-Z0-9]+$/),
  VERCEL_KNOWN_GOOD_DEPLOYMENT_ID: z.string().regex(/^dpl_[a-zA-Z0-9]+$/),
  TARGET_PRODUCTION_URL: z.string().regex(/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/, 'Use the disposable project production .vercel.app domain'),
  TARGET_PROBE_TOKEN: z.string().min(32),
  VERCEL_PROTECTION_BYPASS: z.string().optional(),
  GITHUB_TOKEN: secret,
  GITHUB_REPOSITORY: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  LINEAR_API_KEY: secret,
  LINEAR_TEAM_ID: z.uuid(),
  LIVE_MODE_ENABLED: z.enum(['true', 'false']).default('false'),
  ALLOW_PRODUCTION_ACTIONS: z.enum(['true', 'false']).default('false'),
});
export type LiveConfig = z.infer<typeof liveSchema>;
export function configStatus() {
  const parsed = liveSchema.safeParse(process.env);
  return { configured: parsed.success, missing: parsed.success ? [] : [...new Set(parsed.error.issues.map(i => i.path.join('.')))],
    liveEnabled: process.env.LIVE_MODE_ENABLED === 'true', rollbackEnabled: process.env.ALLOW_PRODUCTION_ACTIONS === 'true',
    authConfigured: (process.env.SENTINEL_OPERATOR_TOKEN?.length || 0) >= 32,
    integrations: Object.fromEntries(Object.entries({ Slack: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_TEAM_ID', 'SLACK_INCIDENT_CHANNEL_ID'], Vercel: ['VERCEL_ACCESS_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID', 'VERCEL_KNOWN_GOOD_DEPLOYMENT_ID'], GitHub: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY'], Linear: ['LINEAR_API_KEY', 'LINEAR_TEAM_ID'], AI: ['AI_GATEWAY_API_KEY'] }).map(([app, keys]) => [app, keys.every(k => Boolean(process.env[k])) ? 'configured · unverified' : 'missing configuration'])) };
}
export function liveConfig(): LiveConfig {
  const parsed = liveSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Live configuration missing/invalid: ' + [...new Set(parsed.error.issues.map(i => i.path.join('.')))].join(', '));
  if (parsed.data.LIVE_MODE_ENABLED !== 'true') throw new Error('Live mode is disabled. Only the operator may enable it in .env.local.');
  return parsed.data;
}

// Never retain known secrets in model input, logs, exports, or error messages.
export function redact(text: string): string {
  for (const [key, value] of Object.entries(process.env)) {
    if (/(TOKEN|SECRET|API_KEY|ACCESS_KEY|BYPASS)/.test(key) && value && value.length >= 8) text = text.split(value).join('[REDACTED]');
  }
  return text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|sk-[A-Za-z0-9_-]+)/g, '[REDACTED]');
}
