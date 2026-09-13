# Verification record — 2026-09-13

Scope: local implementation, Windows/PowerShell, Node.js 24.12.0. No real service credentials, paid model calls, deployments, rollbacks, Slack posts, or issue creation were used for these checks.

## Automated checks

| Check | Result | What it establishes |
| --- | --- | --- |
| npm test | 70 passed, 0 failed | Actual engine/policy behavior, mocked provider adapters, security routes, AI SDK loop with a mock model, local HTTP checkout variants |
| npm run evaluate | 40/40 passed | Four deterministic fixture scenarios, ten repetitions each; expected state and rollback counts |
| npm run build | Passed | Optimized Next.js production build and route compilation |
| npm run typecheck | Passed | TypeScript consistency |
| npm audit --omit=dev | 0 reported vulnerabilities | Installed production dependencies against npm's advisory database at check time; not a security certification |
| npm run preflight with unconfigured accounts | Expected validation failure | Lists missing field names, prints no credential values, stops before external requests |

Latest evaluation data is in artifacts/evaluation.json, generated at 2026-09-13T17:31:30.139Z. This file is intentionally ignored by Git. Retry delays are skipped in evaluation; reported durations are not live recovery latency.

The final test rerun includes action-journal timestamps/keys and rollback HTTP-status assertions, plus non-ASCII invalid-probe-token rejection. Test counts did not increase because assertions were added to existing cases.

## Browser → API → worker → SQLite → UI

An isolated production server at http://127.0.0.1:3001 and a worker used data/browser-verification.sqlite, a non-secret test operator token, and both live switches disabled. The user's existing server on port 3000 was left alone.

| Flow | Observed result |
| --- | --- |
| Locked console | Operator form displayed; unlock succeeded with test credentials |
| Safe rollback via UI | Request queued; real local worker saved evidence; sandbox run reached RESOLVED with three healthy windows |
| Unsafe migration via UI | Run reached APPROVAL_REQUIRED without rollback |
| Review acknowledgment | Saved acknowledgment displayed and survived reload |
| Incident URL reload | Same saved incident/state loaded from the database |
| History | Both saved runs listed and accessible |
| Setup | Missing integrations shown honestly; live switches disabled |
| Mobile | 390px viewport had 390px document width; no horizontal overflow; sandbox label visible |
| Browser error check | No errors in the verified pass after fixing the empty-public-URL validation defect |

Saved sandbox incident IDs:

- Safe: 1efc55f5-abfe-4690-890e-f8d5ccb4d146
- Unsafe: 783028ef-f21e-4a6f-b256-c17fcf31e21c

These are local fixtures, not live incident references. The isolated test processes were stopped after verification work; the database remains for inspection.

## Final browser recheck limitation

After the successful browser pass, the diagnosis renderer was made lazy-loaded, model-rendered images were disabled, and the JSON export was extended with action receipts/timestamps. The updated code passed build, TypeScript, and behavioral tests.

A final browser recheck was attempted, but the platform's automatic approval reviewer rejected browser execution because the account's usage allowance was exhausted. That check was **not** bypassed. The final lazy-loading/export interaction therefore has build/test coverage but has not been re-observed in the browser. Manually check diagnosis rendering and Export JSON when starting the app.

## Not established by local verification

- Real Slack signed delivery over the user's tunnel or its acknowledgment latency.
- Actual provider token scopes, channel membership, deployment protection, or issue-write access.
- Real AI model accuracy, availability, spend, latency, or recommendation.
- Vercel production rollback propagation and real deployment identity responses.
- End-to-end live GitHub/Linear/Slack artifact delivery.
- Hosted GitHub Actions execution, public repository publication, or submitted video.

Complete the operator acceptance table in DEMO.md before calling the project live-submission-ready. Do not convert these local test results into a live-provider success rate.
