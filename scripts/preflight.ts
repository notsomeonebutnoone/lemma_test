import { randomUUID } from 'node:crypto';
import { liveSchema } from '../lib/commander/config';
import { jsonRequest } from '../lib/commander/http';
import { Store } from '../lib/commander/store';
import { livePorts } from '../lib/commander/live';
import { healthy } from '../lib/commander/policy';

async function main() {
  const parsed = liveSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Missing or invalid configuration fields (values are never printed):');
    for (const key of new Set(parsed.error.issues.map(i => i.path.join('.')))) console.error('  ' + key);
    process.exitCode = 1; return;
  }
  const config = parsed.data;
  const checks: { name: string; ok: boolean; note: string }[] = [];
  async function check(name: string, work: () => Promise<string>) { try { checks.push({ name, ok: true, note: await work() }); } catch { checks.push({ name, ok: false, note: 'Rejected, unreachable, or mismatched. Verify scoped token and target IDs.' }); } }
  await Promise.all([
    check('Slack bot workspace', async () => { const r = await jsonRequest<{ ok: boolean; team_id: string }>('https://slack.com/api/auth.test', { headers: { Authorization: 'Bearer ' + config.SLACK_BOT_TOKEN } }); if (!r.ok || r.team_id !== config.SLACK_TEAM_ID) throw new Error(); return 'Bot authenticated for the configured workspace. Channel membership must be checked in Slack.'; }),
    check('GitHub repository', async () => { const r = await jsonRequest<{ full_name: string; has_issues: boolean }>('https://api.github.com/repos/' + config.GITHUB_REPOSITORY, { headers: { Authorization: 'Bearer ' + config.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } }); if (r.full_name.toLowerCase() !== config.GITHUB_REPOSITORY.toLowerCase() || !r.has_issues) throw new Error(); return 'Repository accessible; issues enabled. Write permission is not proven until rehearsal.'; }),
    check('Linear team', async () => { const r = await jsonRequest<{ data?: { team?: { id: string; name: string } }; errors?: unknown[] }>('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: config.LINEAR_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query CheckTeam($id: String!) { team(id: $id) { id name } }', variables: { id: config.LINEAR_TEAM_ID } }) }); if (r.errors?.length || r.data?.team?.id !== config.LINEAR_TEAM_ID) throw new Error(); return 'Configured team readable. Write permission is not proven until rehearsal.'; }),
  ]);
  const store = new Store(':memory:');
  try {
    const run = store.enqueue({ eventKey: randomUUID(), mode: 'live', scenario: 'checkout-regression', title: 'Read-only preflight' });
    const ports = livePorts(run, store, config);
    await check('Vercel, Git comparison, and protected probes', async () => {
      const evidence = await ports.investigate();
      console.log('Production: ' + evidence.current.id + ' @ ' + evidence.current.sha);
      console.log('Known good: ' + evidence.candidate.id + ' @ ' + evidence.candidate.sha);
      console.log('Synthetic production failures: ' + evidence.baseline.failures + '/' + evidence.baseline.samples);
      if (!healthy(evidence.candidateHealth, evidence.candidate.id)) throw new Error();
      if (!evidence.changes.complete) return 'Candidate healthy. Git comparison incomplete/empty: automatic rollback will be blocked. Deploy a code-only regression before the live test.';
      return 'Deployment scope, Git evidence, and known-good probes valid. Runtime-log availability is recorded in an actual incident.';
    });
  } finally { store.close(); }
  for (const c of checks) console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + ' — ' + c.note);
  console.log('No rollback, issue creation, Slack message, or model call was attempted. Slack signature delivery and model behavior still require the live rehearsal.');
  if (checks.some(c => !c.ok)) process.exitCode = 1;
}
main().catch(() => { console.error('Preflight could not complete. No secrets were printed.'); process.exitCode = 1; });
