# How Sentinel works

## Two applications, not one deployment

The command center is a local Next.js application. It accepts operator requests and Slack webhooks, reads a local SQLite database, and displays saved incident state. A separate Node worker performs investigations and actions. The public HTTPS tunnel lets Slack reach the local webhook; it does not move the database to the cloud.

The checkout target is a separate, small Vercel application in `demo-target/`. Its health endpoint can be healthy while checkout is broken. Checkout always requires a secret and `dryRun: true`; it never charges anyone or writes orders.

This split makes the demonstration real without giving an agent access to a customer production system.

## The incident from beginning to end

### 1. A request becomes a durable job

A Slack command is an app mention such as “@Sentinel investigate checkout”. Sentinel checks the exact raw-body signature, freshness, workspace, and channel. It ignores bot messages and unrelated events, then saves the incident under Slack's event ID before replying.

The authenticated dashboard can enqueue the same kind of job. Its generated request UUID allows a network retry to reuse the same incident. Additional live alerts coalesce while one live incident is active.

This is why a browser refresh does not restart the incident and a Slack retry does not create a second rollback.

### 2. The worker gathers evidence

The worker claims one saved job with a renewable lease. For a live run it reads the configured stable Vercel alias to discover what is actually serving production. It fetches current and pinned known-good deployment metadata and checks repository, project, IDs, Git SHAs, readiness, and production target.

Using those actual SHAs, it asks GitHub for the commit comparison, file patches, and PRs associated with the current commit. A direct commit can have no associated PR; the app does not fabricate one.

It probes both production and the candidate: a health request plus five null-promo checkout requests for each. A broken variant calls `trim()` on null, returning an explicit checkout failure while health remains healthy. A bounded Vercel runtime-log stream can add corroborating error evidence. It is not used as a historical error-rate service.

The normalized evidence is saved to SQLite and immediately becomes visible in the journal.

### 3. The model explains the evidence

The AI SDK tool-loop agent is required to call its deployment-evidence and Git-change-evidence tools, then return structured output: hypothesis, confidence estimate, recommendation, and citations. These tools read the collected evidence; they cannot mutate external systems.

The generation gets a saved ID before calling the model. The app records output and token usage or a failed-generation record. Model errors do not silently switch a live run to a fictional sandbox diagnosis.

The model is useful because it connects the failure signature to the real code diff and states an actionable hypothesis. Its recommendation matters, but its confidence is not a calibrated reliability statistic.

### 4. Code, not the model, grants rollback permission

Seven ordinary TypeScript policy checks inspect deployment identity, complete evidence, risky files/contracts, bounded application scope, candidate health, confirmed production failure, and a sufficiently supported model recommendation.

Any failed gate blocks automatic rollback. The UI shows the specific gate and supporting evidence. “Acknowledge review” records that the local operator has seen a blocked/escalated case; it does not override safety. The expected next action is a human-reviewed forward fix.

Even if all gates pass, a separate environment switch must allow production actions. Before a new rollback, the worker refreshes evidence and repeats the policy. The Vercel adapter performs one more routing check.

### 5. A journal protects the write boundary

Before calling Vercel, the worker saves an action key with status started. After a valid response it saves the receipt as complete. A retry of the same job reuses a complete receipt instead of sending another request.

If the response is lost, Sentinel does not know whether the provider acted. It marks delivery uncertain and stops automatic replay. This is a deliberate safety stop, not an exactly-once guarantee.

The same journal pattern protects Slack messages and GitHub/Linear tickets. An explicit rate-limit rejection can be retried because it says the action was not accepted; an unknown outcome requires inspection.

### 6. Recovery must be observed

After Vercel accepts the request, Sentinel rechecks the stable production alias and sends fresh protected probes. It needs three consecutive healthy windows. A nonce prevents an old cached response from masquerading as a fresh success, and deployment identity prevents a healthy but wrong deployment from passing.

Five-request synthetic failure counts and latency appear in the UI. They are measurements of the test workload, not customer traffic.

The false-success sandbox case illustrates the distinction: the simulated rollback API accepts the call, but routing stays wrong. Verification fails and the incident is not resolved.

### 7. Follow-up records explain the outcome

The worker creates a GitHub follow-up issue and a Linear issue, then sends the Slack thread a final summary with available links. Issues remain open for a forward fix even after a successful rollback. Recovery and reporting completeness are separate; a ticket outage does not erase recovery evidence.

The reporting-outage sandbox injects one explicit rejection, resumes the durable job after backoff, and delivers the remaining report without repeating completed actions.

### 8. The UI reads the record

The console polls persisted state, displays model output and deterministic gates separately, and exposes raw evidence. History and incident URLs address saved runs. Export JSON includes the incident, model generations, and action journal.

Sandbox mode swaps only the external adapters and diagnosis for labeled fixtures. The queue, worker, policy, verification logic, report coordination, and UI remain real. It is useful for development and failure demonstrations, but only a live run proves connected-provider behavior.

## Boundaries to remember

This is a local, single-operator, single-disposable-project design. Trusted demo-channel members can trigger it when enabled. SQLite is not shared cloud storage, and no remote deployment is provided for the command center.

The schema-change scenario supplies incompatible version/file evidence; it does not execute a database migration. The filename/version policy cannot certify arbitrary production code. See [RELIABILITY.md](RELIABILITY.md) before extending scope.
