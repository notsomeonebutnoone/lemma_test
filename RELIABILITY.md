# Sentinel reliability brief

## Scope and measured results

This brief describes the implementation, not a claim of production readiness. On 2026-09-13, local verification passed **70 behavioral tests** and **40/40 deterministic scenario evaluations** (four cases, ten repetitions each). Those repetitions check stable engine behavior, not model accuracy or statistical reliability.

**Live rehearsal: NOT RUN.** Real model quality, provider permissions, Slack delivery latency, Vercel propagation, and external ticket delivery still need operator evidence. [VERIFICATION.md](VERIFICATION.md) separates local checks from those open items.

## Resolution contract

A rollback receipt alone is not success. Resolution requires **three consecutive healthy synthetic windows**, with up to eight attempts and five seconds between live windows.

Each window includes a protected health request, five protected dry-run checkout requests, and an independent Vercel production-alias lookup. All must agree on the expected deployment. The health/checkout responses must have the expected application marker, fresh request nonce, schema/contract markers, and consistent identity. Checkout must explicitly report a dry run.

Five of five checkout requests must succeed, measured error rate must be below 1%, and measured p95 must be below 800 ms. With five requests, that rate condition means zero failures and the nearest-rank p95 is the maximum observed checkout latency. Latency includes the operator's network path. These are **small synthetic samples**, not customer HTTP-500 rates, business revenue, or statistically representative APM metrics.

A failed window resets the consecutive count. Eight windows without three consecutive passes produce `FAILED`, not a success animation. After interruption, verification starts a fresh series rather than counting old windows as consecutive.

## Deterministic rollback gates

Every gate must pass; the model cannot bypass one.

| Gate | Required evidence |
| --- | --- |
| Complete evidence | Nonempty, bounded Git comparison; every patch present; no truncated commit list; distinct SHAs |
| Deployment identity | Ready production deployments, same configured project/repository, different IDs, older candidate |
| Database and contracts | No migration/schema/queue/event/contract path markers, including renamed paths; equal nonempty schema and contract versions |
| Bounded change | Every changed path within `demo-target/`; at most 20 path entries, including old rename paths |
| Known-good target | Protected candidate probes pass identity, checkout, sample-count, and latency requirements |
| Failure confirmed | Healthy production identity response, at least five checkout samples, at least one failure, failing checkout, synthetic error rate at least 5% |
| Evidence-supported diagnosis | Structured rollback recommendation, finite confidence at least 0.85, citation containing the full current commit SHA |

The live adapter additionally requires configured project/repository metadata and full 40-character commit SHAs. It rejects redirected/wrong-project production aliases and non-demo probe hosts. Automatic rollback requires both live configuration and the separate production-action switch.

The worker repeats investigation and policy immediately before a new rollback, checking that the candidate/current identities and SHAs have not changed. The adapter then checks current routing again just before its POST.

**Limits:** filename matching and application-reported version markers do not prove arbitrary code or database compatibility. A destructive change hidden in an ordinary application file could escape these heuristics. This policy is appropriate only to this reviewed, disposable target. There is also a read-to-write race: Vercel's rollback call is not an atomic compare-and-swap with Sentinel's routing read. Freeze other deployments during rehearsal.

Unsafe cases request review and a forward fix. “Acknowledge review” saves an operator acknowledgment; it cannot authorize an unsafe rollback.

## Persistence, deduplication, and delivery

SQLite stores incidents, event-delivery mappings, action receipts, AI generations, due times, worker leases, and heartbeats. Write-ahead logging and transactional claim/enqueue operations support local restart recovery. The browser polls the saved record; it does not own workflow state.

Slack delivery IDs and dashboard request UUIDs deduplicate intake. Additional live alerts coalesce into an already-active live-project incident. A lease prevents a second healthy worker from claiming that incident concurrently.

Each write has a local incident/action key and a durable `started` entry **before** dispatch. Successful receipts are reused, not resent. Exports include status, timestamps, local keys, and returned artifact IDs. Vercel receipts record actual HTTP status and its request ID when supplied; the deployment ID is not mislabeled as an operation ID. Older records predating audit timestamps can have null timestamps.

These are **local deduplication keys, not universal provider-supported idempotency keys**. A timeout after a write may mean the remote side succeeded. Such ambiguous deliveries stop automatic replay and require inspection. A pending rollback on restart likewise escalates; it is never blindly repeated. A saved completed rollback can be recovered without issuing a second POST.

This does not guarantee exactly-once delivery across providers or survive loss of the local database. Back up the database with both processes stopped. A new incident ID does not resolve an earlier unknown delivery: inspect provider state before starting another live run.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Read timeout / 429 / 5xx | Bounded HTTP retry, then bounded durable job retry when safe |
| Explicit write rate limit | Persist retryable rejection and retry with bounded delay |
| Write timeout / transport loss / 5xx / malformed success receipt | Delivery uncertain; no automatic replay |
| Slack HTTP 200 with `ok:false` | Semantic error, not a successful message |
| Linear HTTP 200 with GraphQL errors | Semantic error; only explicit rate-limit rejection is automatically retryable |
| Missing model output, missing evidence tools, invalid schema, unavailable model | Fail closed; no fallback fictional live diagnosis |
| Candidate unhealthy, scope mismatch, low confidence, risky change | No automatic rollback |
| Rollback accepted but traffic remains broken | Verification fails; incident unresolved |
| Ticket/report outage | Keep recovery result separate from reporting completeness; visible reporting errors |
| Process restart | Resume durable state; reuse known completed writes; stop uncertain writes |

Read requests make at most three transport attempts. Incident/report work has a four-attempt job budget. Retry-After delays are bounded at 60 seconds in the HTTP adapter. Completed GitHub/Linear deliveries are retained while another report retries. Final Slack delivery waits for ticket retries so it can include their links.

`RESOLVED` means recovery was verified; it does **not** imply every report succeeded. Submission evidence must separately show empty reporting errors and all expected receipts.

## AI, security, and observability

The AI SDK agent has two evidence-reading tools and structured output. It never receives rollback or ticket-writing tools. Logs, patches, and PR titles are treated as untrusted data. Confidence is an uncalibrated model estimate, not a probability guarantee. The model's hypothesis, recommendation, and commit citation participate in the policy, so a real model can legitimately decline a rollback.

Each generation receives a saved UUID before the model call. Output, model name, tool names, tokens, and failure/completion state are retained. Cost is null/“Unknown” when not supplied; Sentinel does not invent dollar figures.

Slack verifies raw-body HMAC signatures and a five-minute timestamp window before accepting events. Only the configured workspace/channel and human app mentions are processed. The request path durably enqueues without model/provider work. **Anyone allowed to post commands in that channel is an authorized trigger when live mode is on.** Use a dedicated, trusted-members-only demo channel.

Dashboard APIs require an operator token or its signed eight-hour HttpOnly, SameSite session. Browser writes require an allowed Origin. Bodies are bounded and secrets remain server-side. There is no multi-user identity, MFA, centralized rate limiting, or tamper-proof audit log. Local filesystem access effectively grants control of the system.

Known credential values and common token formats are redacted from retained provider text. That is not a complete PII or secret scanner. Review exports, model inputs, screenshots, and public issue contents. Model-rendered images are disabled to avoid passive image loading from generated markdown.

The Vercel runtime-log reader collects a bounded ten-second live stream, not historical analytics. Absence of logs is disclosed and is not interpreted as absence of failure. Synthetic probes remain the required failure/recovery signal. API errors are sanitized; worker state and action failures are visible in the journal.

## Evaluation methodology

`npm test` exercises actual policy and orchestration behavior, provider adapters with stubbed HTTP responses, the AI SDK tool loop with a mock language model, signed request handlers, and actual local HTTP checkout handlers. It is not a source-text assertion suite.

`npm run evaluate` runs the real engine against explicitly simulated adapters, skips retry sleep for speed, and records expected/actual states, action counts, verification windows, and elapsed time in `artifacts/evaluation.json`.

| Scenario | Expected terminal state | Rollback count per run | Local result |
| --- | --- | --- | --- |
| Code-only checkout regression | RESOLVED | 1 simulated | 10/10 |
| Unsafe schema evidence | APPROVAL_REQUIRED | 0 | 10/10 |
| Accepted rollback, unchanged routing | FAILED | 1 simulated | 10/10 |
| Reporting rate limit then recovery | RESOLVED, no remaining report errors | 1 simulated | 10/10 |

No percentages from this table should be presented as real-world autonomous-remediation reliability. Complete [DEMO.md](DEMO.md) to add live evidence.
