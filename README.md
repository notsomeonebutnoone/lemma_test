# Sentinel — Incident Commander

Sentinel investigates a disposable checkout failure across **Slack, Vercel, GitHub, and Linear**. It gathers evidence, asks an AI agent for a cited diagnosis, applies deterministic rollback rules, and checks the actual checkout after a rollback request.

**Status: implemented and locally verified; live rehearsal not yet run.** Sandbox is deliberately labeled. No real deployment, rollback, model call, message, or issue was created during implementation.

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
