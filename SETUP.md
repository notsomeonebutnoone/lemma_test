# Setup: what you supply and how to get it

Sentinel runs locally. You deploy only the disposable checkout application and run the live rehearsal yourself. No live account resources were created during implementation.

## 1. What I still need from you

Share these **non-secret** choices if you want the setup tailored to your accounts:

| Item | Example / format |
| --- | --- |
| Hackathon deadline and required submission fields | Date, time zone, submission URL |
| GitHub repository | `your-name/sentinel-demo` |
| Vercel project, team, and stable production domain | Project name; `prj_...`; `team_...`; `https://your-checkout.vercel.app` |
| Slack workspace and dedicated incident channel | Workspace name; `T...`; `C...` or `G...` |
| Linear team | Team name and its UUID |
| Known-good deployment, once deployed | `dpl_...` |

Do **not** paste passwords, tokens, signing secrets, or your full environment file into chat. Put secret values into local `.env.local`. Provider plans, model access, deployment permissions, and credits must be available on your own accounts; the app does not provision or purchase them.

## 2. Prepare the local app

Use Node.js 24. From `D:\hackathon`:

~~~powershell
npm ci
npm run setup
npm run dev
~~~

Setup creates `.env.local` only if absent, generates two independent random tokens, and leaves live switches off. Open the file privately in your editor:

- `SENTINEL_OPERATOR_TOKEN`: unlocks the local dashboard; never upload it to the checkout project.
- `TARGET_PROBE_TOKEN`: authorizes dry-run checkout probes; copy this same value into the Vercel target later.

Open http://127.0.0.1:3000, unlock, and try all four sandbox cases. No external keys are needed for sandbox.

Keep all local configuration in `.env.local`. Avoid conflicting `.env.development.local`, `.env.production.local`, or terminal-exported variables: the web process and worker must see the same configuration and database path. Restart both processes after changing configuration. If setup says the file already exists, edit missing fields instead of expecting it to overwrite the file.

## 3. Create the GitHub repository

Create an empty repository for this project, with Issues enabled. Before publishing, review the source and confirm that `.env.local`, `data/`, `artifacts/`, `.next/`, and `node_modules/` are excluded by `.gitignore`.

If this folder is not already a Git repository, these are commands **for you to run**, replacing the URL:

~~~powershell
git init
git branch -M main
git add .
git status --short
git diff --cached --stat
git check-ignore .env.local
~~~

Inspect the staged files before continuing. `git check-ignore` should print `.env.local`. Do not proceed if credentials or incident data are staged.

~~~powershell
git commit -m "Build Sentinel and healthy disposable checkout"
git remote add origin https://github.com/YOUR-OWNER/YOUR-REPOSITORY.git
git push -u origin main
~~~

Use your normal Git login to push. If a repository or remote already exists, inspect it; do not replace it blindly.

Set `GITHUB_REPOSITORY=YOUR-OWNER/YOUR-REPOSITORY`. For Sentinel's separate API access, create a fine-grained personal access token limited to that repository with:

- Contents: read, to compare commits.
- Pull requests: read, to retrieve associated PRs.
- Issues: read/write, to create follow-up issues.
- Metadata: read, as required by GitHub.

Store it as `GITHUB_TOKEN`. This API token does not need code-push permission. See [GitHub token setup](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## 4. Deploy the healthy checkout to Vercel

Import the GitHub repository in Vercel. Create a **new disposable project** with:

| Setting | Value |
| --- | --- |
| Root Directory | `demo-target` — not the repository root |
| Framework Preset | Other |
| Runtime | Node.js 24 |
| Build | No framework build; use the target's checked-in configuration |
| Environment | `TARGET_PROBE_TOKEN`, same private value as local, available to Production and Preview |

Do not add Sentinel's Slack, GitHub, Linear, model, or operator credentials to Vercel. The root app uses local SQLite and a worker and is not intended for this deployment.

The checked-in variant is healthy. Deploy it from Git so Vercel has the real repository/commit metadata. Confirm the deployment is **Ready / Production** and is serving the project's stable `.vercel.app` domain. Keep automatic Vercel system environment variables exposed so probe responses include `VERCEL_DEPLOYMENT_ID`.

Copy these into `.env.local`:

- `VERCEL_PROJECT_ID`: project ID from project settings.
- `VERCEL_TEAM_ID`: the owning team's ID from team settings.
- `VERCEL_KNOWN_GOOD_DEPLOYMENT_ID`: the healthy production deployment's `dpl_...` ID from deployment details.
- `TARGET_PRODUCTION_URL`: the stable production alias, such as `https://your-checkout.vercel.app`. **Not** a unique deployment URL, custom domain, redirect, or path.
- `VERCEL_ACCESS_TOKEN`: an account token scoped to the owning team with the permissions needed to read deployments/aliases/logs and roll back this project. Use the narrowest scope your account supports; an application allowlist does not narrow the token itself.

If deployment protection blocks probes, obtain the project's automation bypass secret and set `VERCEL_PROTECTION_BYPASS`. Do not work around protection by putting secrets in URLs.

A preview deployment cannot be the known-good candidate. Both versions must be prior/current production deployments in the same Git-connected project. Preserve the pinned good deployment and do not delete it. See [deployment concepts](https://vercel.com/docs/deployments/overview), [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), and [automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## 5. Configure the model

In your Vercel account, open AI Gateway and create an API key. Store it as `AI_GATEWAY_API_KEY`. Check available credits/billing and model access before your rehearsal.

`AI_MODEL` uses a provider/model identifier; the default is in `.env.example`. If that model is unavailable for your account, choose an available tool-calling model that supports structured output and rehearse with it. Changing models changes behavior and must be revalidated.

Sandbox never calls a model. Preflight also does not spend model credits. Live diagnosis does; its output can block a rollback, and the UI honestly displays unknown cost when the provider does not report it. [AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication).

## 6. Configure Slack and the public HTTPS endpoint

Create a Slack app in your demo workspace using [Slack app management](https://api.slack.com/apps). Creating it “from scratch” lets you obtain the signing secret before verifying the endpoint.

1. In Basic Information, copy the Signing Secret to `SLACK_SIGNING_SECRET`.
2. Add bot OAuth scopes `app_mentions:read` and `chat:write`.
3. Install the app to the workspace; put its Bot User OAuth Token into `SLACK_BOT_TOKEN`.
4. Create a dedicated demo channel with trusted participants only. Invite the bot to that channel.
5. Copy the channel ID from channel details into `SLACK_INCIDENT_CHANNEL_ID`. Copy the workspace's `T...` ID from its Slack URL into `SLACK_TEAM_ID`.
6. Restart the local web process after saving the signing secret.

Every human who can issue mentions in that configured channel can trigger a live run when enabled. Do not use a busy company incident channel or invite untrusted users.

Install Cloudflare's `cloudflared` from its [official setup instructions](https://developers.cloudflare.com/tunnel/setup/). You, not Sentinel, start the tunnel:

~~~powershell
cloudflared tunnel --url http://127.0.0.1:3000
~~~

Copy the resulting HTTPS origin, without a path, into `SENTINEL_PUBLIC_URL`, then restart both local processes. A quick tunnel's hostname can change when restarted.

In Slack Event Subscriptions, enable events and set Request URL to:

~~~text
https://YOUR-TUNNEL-HOST/api/slack/events
~~~

Subscribe to the bot event `app_mention`, save, and reinstall if Slack asks after permission changes. A signed URL-verification challenge works while live mode is off. No slash command or Socket Mode is needed.

`slack-app-manifest.json` is a reference/template with the exact bot scopes and subscription. Replace the placeholder before use; if Slack requires a working URL during manifest creation, create the app first and add the event subscription after configuring its signing secret.

Slack expects quick acknowledgment; the handler saves the job before replying, and the worker handles everything slow. Use the production server during rehearsal to avoid dev compilation delays. [Slack signature verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/) and [Events API](https://docs.slack.dev/apis/events-api/).

## 7. Configure Linear

Create or choose a disposable Linear team. In Linear's account settings, open Security & access and create a personal API key with the required team access and issue-creation permission. Store it as `LINEAR_API_KEY`.

Set `LINEAR_TEAM_ID` to the team's **UUID**, not its short issue prefix. On the team's view, use the command menu's “Copy model UUID”, or use Linear's authenticated GraphQL explorer:

~~~graphql
query { teams { nodes { id name } } }
~~~

Do not paste the key into a public query URL or chat. Sentinel sends personal API keys in Linear's Authorization header and validates GraphQL errors even when HTTP returns 200. [Linear API setup and team IDs](https://linear.app/developers/graphql).

## 8. Prepare the server for rehearsal

Stop your own dev process first. Keep both live switches false initially.

~~~powershell
npm run build
npm run start
~~~

In a second terminal, from the same repository:

~~~powershell
npm run worker
~~~

In a third terminal, run the tunnel. Keep all three alive. Open the dashboard and check Worker Online. Local data defaults to `data/sentinel.sqlite`; web and worker must share it.

Run:

~~~powershell
npm run preflight
~~~

With missing configuration it prints only field names and stops. With complete configuration it checks Slack workspace authentication, repository readability/issues enabled, Linear team readability, Vercel scope/Git metadata, and protected dry-run probes. It makes no rollback, issue, message, or model call. Its checkout POSTs exercise a no-side-effect demo endpoint.

Before a regression is deployed, a same-commit/empty comparison warning is expected. The candidate must still be healthy. Preflight does not prove message/issue-write permissions, real model behavior, or signed Slack delivery.

Then follow [DEMO.md](DEMO.md). Enable live switches only when you are ready to perform the stated external actions.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Worker offline | Start worker; same working directory, environment, and DB path as web |
| Port already in use / Next dev lock | Stop your own earlier server or use it; do not start two Next dev processes in this folder |
| Slack verification fails | Exact HTTPS URL, running tunnel/server, correct signing secret, reasonably accurate local clock |
| Mention ignored | App installed/invited, app_mention subscription, exact workspace/channel IDs, text contains investigate/checkout/incident |
| Slack 503 on a command | Live configuration incomplete or live mode still off |
| Probe unauthorized / login HTML | Matching probe token, deployment protection/bypass, deployed environment values |
| Wrong deployment identity | Vercel system variables exposed; stable alias vs immutable deployment URL |
| Incomplete Git evidence | Git-linked deployments, comparable distinct commits, small text diff, no missing patches |
| Candidate blocked as slow | Inspect recorded latency; warm the disposable target using preflight and retest. Do not bypass gates to make the recording green |
| Report delivery uncertain | Inspect provider records and production routing. Do not launch a new run to “retry” an unknown write |
| Changed tunnel hostname | Update local public URL and Slack Request URL, then restart web/worker |

## After rehearsal

Set both live switches false and restart both processes; stop the public tunnel when no longer needed. Revoking a key or editing a file is not an instantaneous cancel of an already-dispatched request. Let active work finish safely and inspect unknown deliveries.

Keep real issues/messages as demo evidence unless you choose to archive them yourself. Review exported JSON before publishing; it can contain repository patches and incident details. Rotate temporary credentials when finished. For a database backup, stop web and worker and copy the database and any remaining SQLite sidecar files together to a private location.
