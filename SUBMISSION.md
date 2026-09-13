# Submission checklist

## Current readiness

The local implementation is ready for account setup and an operator-run rehearsal. It is **not yet a proven live submission**: external accounts were not used, and the public repository/video have not been supplied.

The [hackathon site](https://multiappagenthackathon.com/) describes multi-step agents acting across at least three apps and emphasizes technical implementation, reliability, usefulness, originality, and demo clarity. Confirm the event's current deadline and exact submission fields before submitting.

## Required handoff items

- [x] Functional console backed by durable state, not timed demo cards.
- [x] Live adapters for Slack, Vercel, GitHub, and Linear.
- [x] AI evidence tools and structured diagnosis behind deterministic policy.
- [x] Protected good/broken disposable checkout variants.
- [x] Recovery verification, review handoff, action journal, report retries.
- [x] Local behavioral tests, deterministic evaluation, browser checks.
- [x] Setup guide, operator rehearsal, architecture explanation, reliability brief.
- [ ] Your actual team/project details and confirmed deadline.
- [ ] Public repository URL; inspect staged files for secrets before publishing.
- [ ] Passing hosted CI after the repository is pushed.
- [ ] Real good/broken deployment IDs and commit evidence.
- [ ] Live model generation and successful cross-app recovery run.
- [ ] Real GitHub/Linear issue links and Slack thread evidence.
- [ ] Unsafe-change refusal evidence, labeled live or sandbox accurately.
- [ ] Reviewed live JSON export and a two-minute video.
- [ ] Completed live acceptance table in DEMO.md.
- [ ] Submission form and final account/resource cleanup.

## Suggested project description

Sentinel is an incident commander for a disposable checkout service. A Slack mention starts a durable investigation across Vercel and GitHub. An AI agent explains the failure using deployment and code evidence, while deterministic policy decides whether rollback is allowed. After a rollback request, Sentinel checks the actual production route and synthetic checkout across three healthy windows before declaring recovery. It creates GitHub and Linear follow-up issues and posts the outcome to Slack. Unsafe schema evidence blocks rollback and records a human-review handoff. Its journal preserves action receipts and stops automatic replay when delivery is uncertain.

## Explain the contribution clearly

The contribution is the complete evidence-to-action-to-verification loop, including safe refusal and ambiguous-delivery handling. The model supplies diagnosis and recommendation, but it does not own the write tools or override deterministic gates.

Show real provider evidence for the completed live path. Use the sandbox to explain deliberately injected failure modes without claiming that those fixtures establish provider or model reliability.

## Claims to avoid

Do not claim production readiness, calibrated model confidence, measured revenue saved, customer error-rate improvements, a real database migration, exactly-once delivery across providers, or a successful live integration until evidence supports it.

Local test/evaluation counts are documented in [VERIFICATION.md](VERIFICATION.md) and [RELIABILITY.md](RELIABILITY.md). Update them if the code changes.
