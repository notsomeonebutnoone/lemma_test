# Sentinel — Incident Commander

Sentinel investigates a disposable checkout failure across **Slack, Vercel, GitHub, and Linear**. It gathers evidence, asks an AI agent for a cited diagnosis, applies deterministic rollback rules, and checks the actual checkout after a rollback request.

**Status: implemented and locally verified.** Sandbox is deliberately labeled, and live actions require two explicit environment switches. The included disposable checkout is the only permitted rollback target.

## Demo video

[![Watch the Sentinel demo on Loom](https://img.shields.io/badge/Watch%20the%20demo-Loom-625DF5?style=for-the-badge&logo=loom&logoColor=white)](https://www.loom.com/share/f6928eab692f45048aef5353bb2e328a)

Click the button to watch Sentinel investigate a checkout failure, apply its deterministic safety gates, roll back the disposable Vercel deployment, verify recovery, and create the external incident records. [Open the video directly on Loom](https://www.loom.com/share/f6928eab692f45048aef5353bb2e328a).

## Try it locally

Requires Node.js 24 and npm. Run from this repository:

~~~powershell
npm ci
npm run setup
npm run dev
~~~

Open http://127.0.0.1:3000. Copy `SENTINEL_OPERATOR_TOKEN` from your private `.env.local` into the unlock form. Setup generates that token and the separate checkout-probe token without printing them. It never overwrites an existing environment file.

The dev command starts both the web app and the persistent worker. If the web app is already running, do not start a competing server; start `npm run worker` separately or stop your existing app first.

Choose a sandbox scenario:

| Scenario | What it demonstrates |
| --- | --- |
| Safe rollback | Code-only regression, one simulated rollback, three healthy verification windows |
| Unsafe migration | Schema evidence blocks rollback; operator can acknowledge review, not override policy |
| False-success recovery | An accepted rollback with unchanged routing is **not** marked resolved |
| Reporting outage + retry | Explicit rate-limit rejection retries reporting without repeating rollback or delivered tickets |

Sandbox runs the real queue, state machine, persistence, and policy with fixture adapters and a deterministic diagnosis. It makes **no external calls** and spends no model credits. History, reloads, review acknowledgments, and JSON exports use saved data, not a timed animation.

## Connect the real demo

Read [SETUP.md](SETUP.md), then follow [DEMO.md](DEMO.md). Sentinel stays on your computer with SQLite; only `demo-target/` goes to Vercel. You run the HTTPS tunnel and live rehearsal.

Two independent environment switches default to false:

- `LIVE_MODE_ENABLED`: permits live reads, model spend, Slack messages, and GitHub/Linear issue creation.
- `ALLOW_PRODUCTION_ACTIONS`: additionally permits rollback of the configured disposable Vercel project when every gate passes.

Do not connect a customer application. The target is a tiny dry-run checkout with no payments, orders, or database migrations.

## Judge demo path

The shortest way to evaluate the complete product is a safe rollback scenario:

1. Open the healthy disposable checkout and the Sentinel operator console.
2. Deploy the included `regression` variant. It introduces a code-only failure when checkout receives a null promo code.
3. Mention the Slack bot with `@Sentinel investigate checkout`.
4. Watch Sentinel gather production and known-good evidence, compare Git revisions, obtain a cited AI diagnosis, and evaluate the deterministic rollback gates.
5. When every gate passes, Sentinel rolls Vercel production back to the pinned known-good deployment.
6. Sentinel probes the public production URL for three consecutive healthy windows before marking the incident resolved.
7. Open the Slack thread, GitHub issue, and Linear issue to inspect the saved diagnosis, action receipts, recovery evidence, and follow-up work.

The expected evidence in the console is a repeatable production failure, a healthy known-good candidate, a code-only commit difference, one rollback request, three healthy recovery checks, and linked reporting receipts. An accepted Vercel API response by itself never counts as recovery.

For a local, zero-risk review, run the **Safe rollback** sandbox scenario instead. It exercises the same queue, state machine, persistence, policy, verification, and reporting pipeline using fixture adapters without contacting external providers.

## Live rehearsal commands

The full provider setup is documented in [SETUP.md](SETUP.md). After configuring the private `.env.local`, run:

~~~powershell
npm run preflight
npm run build
npm run start
~~~

Run the durable worker in a second terminal:

~~~powershell
npm run worker
~~~

Create the disposable failure only when the demo is ready:

~~~powershell
npm run demo:variant -- regression
git add demo-target/lib/release.mjs
git commit -m "Demo: introduce null-promo checkout regression"
git push origin main
~~~

After the rehearsal, restore the healthy variant and disable both live switches:

~~~powershell
npm run demo:variant -- good
git add demo-target/lib/release.mjs
git commit -m "Demo: restore healthy checkout"
git push origin main
~~~

Never commit `.env.local`. Tokens, signing secrets, provider identifiers, and temporary tunnel URLs remain private operator configuration.

## Suggested recording outline

A concise submission video can show the complete story in four minutes:

- **Problem:** incident response is fragmented across deployment, chat, source control, and planning tools.
- **Healthy baseline:** show the working checkout and pinned known-good deployment.
- **Real failure:** deploy the regression and reproduce the checkout error.
- **One-command response:** mention Sentinel in Slack and follow the durable timeline in the console.
- **Controlled action:** show the evidence and deterministic gates that authorize exactly one rollback.
- **Verified outcome:** show three healthy production checks plus the Slack, GitHub, and Linear receipts.
- **Takeaway:** AI explains and recommends; deterministic policy authorizes; measured production behavior proves recovery.

## What happens

~~~text
Signed Slack mention / authenticated dashboard request
  → durable SQLite enqueue → background worker
  → Vercel routing + deployment metadata + bounded runtime-log sample
  → GitHub commit comparison + associated PRs + protected checkout probes
  → AI SDK agent: read evidence → structured, cited diagnosis
  → seven deterministic safety gates + fresh pre-action checks
      blocked → human review / forward fix
      allowed → journal one rollback request
                  → verify routing + checkout for three healthy windows
  → GitHub issue → Linear issue → Slack outcome with links
  → saved incident, model generation, action receipts, and JSON export
~~~

See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed explanation and [RELIABILITY.md](RELIABILITY.md) for the precise safety limits. A green homepage or an accepted API response is never sufficient proof of recovery.

## Verification

Local results on 2026-09-13: **70 tests passed; 40/40 deterministic scenario evaluations passed**. Production build, TypeScript, and desktop/mobile browser flows were checked. A final browser recheck after the last renderer/export changes was blocked by the platform usage limit; the updated build and tests pass. See [VERIFICATION.md](VERIFICATION.md) for scope and evidence; these are not live-provider success rates.

~~~powershell
npm test
npm run evaluate
npm run build
npm run typecheck
~~~

Evaluation writes `artifacts/evaluation.json` with per-run outcomes and action counts. SQLite and artifacts are ignored by Git because they may contain private incident evidence. Node 24.12 prints an experimental warning for its built-in SQLite API; that warning is expected in the tested environment.

## Repository guide

| Path | Purpose |
| --- | --- |
| `app/` | Operator console, authenticated incident APIs, signed Slack intake |
| `lib/commander/` | Durable store, agent, policy, live/sandbox adapters, verification, reporting |
| `scripts/` | Setup, worker, preflight, disposable release variants, evaluation |
| `demo-target/` | Separately deployed Vercel checkout target |
| `tests/` | Behavioral engine, adapter, security, AI-loop, and real local HTTP tests |
| `SETUP.md` / `DEMO.md` | Account setup and operator-run rehearsal |
| `SUBMISSION.md` | Remaining submission checklist and suggested description |

This is a single-operator hackathon system, not a production incident-management service. Public repository, live evidence, and the two-minute recording remain operator tasks.
