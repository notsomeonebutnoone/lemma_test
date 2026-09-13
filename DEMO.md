# Operator-run rehearsal and two-minute demo

**Current status: prepared, not live-rehearsed.** You chose to run the external actions yourself. The steps below deliberately deploy broken code only to your named disposable checkout project.

## Before touching live services

Complete [SETUP.md](SETUP.md). Confirm:

- [ ] The target has no customer traffic, payments, orders, or real database.
- [ ] Only `demo-target/` is deployed to Vercel.
- [ ] A Git-linked healthy **production** deployment is pinned as `VERCEL_KNOWN_GOOD_DEPLOYMENT_ID`.
- [ ] The stable production alias belongs to the exact configured project.
- [ ] Slack's bot is installed in the exact trusted demo channel; webhook URL is verified.
- [ ] GitHub Issues and Linear team access are configured.
- [ ] Both local processes share the same environment and SQLite path.
- [ ] No other deployment automation or teammate will change this target during the run.
- [ ] You accept the model spend and creation of real messages/issues in these demo resources.
- [ ] You know how to use the Vercel dashboard to inspect or manually restore the target if Sentinel stops.

Use the built production web server plus the worker and tunnel, not a cold-compiling dev server. Keep live switches off until the target and accounts are ready.

## A. Establish real good/broken versions

The initial committed target should be the good variant. If it is not, prepare it locally, inspect the diff, and commit/deploy it first:

~~~powershell
npm run demo:variant -- good
~~~

That command changes only local demo files; it neither commits nor deploys. It removes the generated migration marker if present and tells you so. Do not accidentally include unrelated pending changes in a rehearsal commit.

Once the good production deployment is Ready and configured as the pinned candidate, prepare the null-promo regression:

~~~powershell
npm run demo:variant -- regression
git diff -- demo-target
~~~

For the safe case the Git comparison from the pinned good commit should contain **only `demo-target/lib/release.mjs`**. The change removes the null fallback before `trim()`. If other changes are included, finish/reset the demo sequence through reviewed commits before continuing; do not bypass the gate.

~~~powershell
git add demo-target/lib/release.mjs
git commit -m "Demo: introduce null-promo checkout regression"
git push
~~~

These are commands for you to execute. You may instead open and merge a real GitHub PR for this one-file change, which gives the agent actual PR evidence. Do not claim a PR exists if you used a direct commit.

Wait for the broken **production** deployment to be Ready. Verify the configured stable domain routes to that deployment in Vercel. If you have already rolled back during an earlier practice run, inspect/promote the intended disposable deployment in the dashboard rather than assuming a new push changed the production alias. [Vercel rollback documentation](https://vercel.com/docs/instant-rollback).

Record the actual IDs and full SHAs of both deployments. Run:

~~~powershell
npm run preflight
~~~

Expected: candidate healthy; production checkout failures; valid bounded Git comparison. Health alone can pass for the broken checkout. Cold starts or local network latency can fail the strict candidate latency gate: inspect the measurements, allow the target to warm, and rerun preflight. Do not loosen checks merely to force a green outcome.

## B. Run the live recovery

In private `.env.local` set:

~~~dotenv
LIVE_MODE_ENABLED=true
ALLOW_PRODUCTION_ACTIONS=true
~~~

Restart both web and worker, keeping the tunnel URL synchronized. The first switch permits model spend, messages, and tickets even when the rollback switch is false. The second permits the gated rollback.

Post in the configured Slack channel:

~~~text
@Sentinel investigate checkout
~~~

Use Slack's actual app mention picker. This is a real action trigger, not a dry-run command.

Watch for:

1. A threaded intake acknowledgment and a saved incident in the dashboard.
2. Real current/candidate IDs, full SHAs, Git diff/PR evidence, and failing production probes.
3. A saved model generation with evidence-tool calls, a cited hypothesis, and a recommendation.
4. Seven passing gates and an accepted rollback receipt.
5. Three consecutive successful synthetic windows **and** production routing to the pinned candidate.
6. GitHub and Linear follow-up issues, then the final Slack thread summary with links.
7. Terminal `RESOLVED` with no remaining reporting errors.

The real model can recommend escalation. If it does, inspect its cited evidence and forward-fix guidance; do not manually edit its saved answer or present a fixture as live proof.

Export the run's JSON. Inspect `run.mode`, real IDs, model generation, `actions` statuses/timestamps, recovery samples, and report receipts. Open the issue links and inspect Vercel routing independently. Reload the incident URL to show persistence.

### Live acceptance record

Fill this in from actual evidence, not assumptions:

| Check | Result / evidence |
| --- | --- |
| Date/time and Sentinel code commit | NOT RUN |
| Good deployment ID + full SHA | NOT RUN |
| Broken deployment ID + full SHA | NOT RUN |
| Slack command/thread URL | NOT RUN |
| Incident ID, mode=live | NOT RUN |
| Actual model name, generation ID, tokens | NOT RUN |
| Rollback action key, HTTP status, target ID | NOT RUN |
| Three healthy windows + independent routing | NOT RUN |
| GitHub issue URL | NOT RUN |
| Linear issue URL | NOT RUN |
| Final Slack result, no reporting errors | NOT RUN |
| Reviewed JSON export and recording | NOT RUN |

Do not publish raw exports without reviewing patches, repository information, and any remaining sensitive text.

## C. Show a safe refusal

For a live unsafe-change demonstration, leave the original schema-14 candidate pinned. Prepare the migration-evidence variant:

~~~powershell
npm run demo:variant -- migration
git diff -- demo-target
git add demo-target/lib/release.mjs demo-target/schema.sql
git commit -m "Demo: incompatible schema evidence blocks rollback"
git push
~~~

This writes a SQL **evidence marker** and reports schema version 15; no migration runner or real database executes that SQL. Say that plainly in the demo.

Wait for the deployment to be Ready / Production and verify the stable domain points to it. Post another investigation mention. Expect a failed database/contracts gate, `APPROVAL_REQUIRED`, **no rollback action**, and follow-up reports. The agent may also recommend escalation, which is consistent with the safety boundary.

Acknowledge review to demonstrate the persisted human handoff. This does not resolve the incident or grant a rollback override. Restore the disposable app yourself with a reviewed forward-fix commit (`npm run demo:variant -- good`, inspect changes, commit the generated-marker removal too, then deploy). Verify production independently.

If time or credits are limited, show this refusal in the clearly labeled sandbox and disclose that the live proof covers only the safe case. Do not call a sandbox recording live.

## D. Show reliability failures locally

Use sandbox for:

- **False-success recovery:** rollback accepted, route unchanged, verification fails. Show the unresolved outcome.
- **Reporting outage + retry:** one explicit rate-limit rejection, durable retry, no repeated rollback or already-delivered ticket.

These intentionally injected failures do not require breaking a real provider or manipulating an external account.

## Suggested two-minute recording

| Time | Show / say |
| --- | --- |
| 0:00–0:15 | Problem: “A successful rollback request does not prove checkout recovered.” Show real broken synthetic probes and the two Git-linked deployments. |
| 0:15–0:35 | Slack mention starts a saved live incident. Show GitHub diff and the model's cited hypothesis. |
| 0:35–1:05 | Show deterministic gates, the rollback receipt, and three actual recovery windows. |
| 1:05–1:25 | Open the real GitHub/Linear issues and Slack outcome. Reload the incident URL and show export. |
| 1:25–1:50 | Show blocked schema evidence; mention the marker is not an executed migration. Clearly identify sandbox if used. |
| 1:50–2:00 | State verification limits: “70 local tests, 40 deterministic evaluations; live evidence is this recorded run.” |

Rehearse before recording. Model and provider latency may exceed this outline. If editing out idle time, disclose the edit and retain original timestamps/evidence; never compress a timer to imply a faster measured recovery. Do not show tokens or your environment file.

## If anything fails

Do not restart an unknown write by creating a new incident. For `ESCALATED` or an uncertain action, inspect the actual Vercel route and existing provider artifacts first. Keep the failed evidence; it is useful reliability evidence, not something to hide.

A resolved checkout with missing reports is a **reporting gap**, not complete end-to-end submission proof. Fix permissions/connectivity, inspect possible prior deliveries, and perform a fresh, deliberate rehearsal only after you understand the earlier outcome.

After finishing, turn both live switches off, restart the local processes, stop the tunnel, and rotate temporary keys. A configuration edit does not cancel a request already in flight.
