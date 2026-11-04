# Running it inside a company

A checklist for running SplunkEvents on a company's network, with a company's Splunk and real report data. Work through it in order. Each item says **what** to do, and **why** in a line.

How the pieces fit together: [architecture.md](architecture.md). Every setting: [configuration.md](configuration.md). The Helm chart: [kubernetes.md](kubernetes.md).

**The safe settings in one place** are at the end: [Company settings to start from](#company-settings-to-start-from).

## 1. Before any code moves

- [ ] **Ask whether outside code may come in.** Most companies review open-source or personal code before it enters their repositories, often through an open-source office or the security team. Ask your manager who decides.
  - *Why:* the rule is about where code came from, not how it got there. Retyping this repo, pasting its files, or having an AI rebuild it from the public repo still counts as bringing it in.
- [ ] **Check your employment agreement.** Look for a "prior inventions" clause, and list this project there if it's yours.
  - *Why:* it keeps clear who owns which copy. Code you write on company time and equipment usually belongs to the company.
- [ ] **If outside code isn't allowed,** build the company's version fresh, on company equipment, without this repo open. Reusing the ideas is fine; copying the code isn't.
- [ ] **Decide the direction now: company ← public, never back.** Nothing from the company copy (code, settings, names, report data, screenshots) goes into the public repo, issues or PRs.

## 2. Keep personal and work separate

- [ ] **No personal accounts on the work laptop.** Don't sign in to a personal GitHub, Codespace, Vercel or Atlas from it.
- [ ] **No company data on personal machines or services.** That means no company Splunk address, token or results in a personal Codespace, laptop, Vercel project, Atlas cluster or AI chat.
  - *Why:* each of these copies company data to a place the company doesn't control.
- [ ] **The Codespace in `.devcontainer/` is for the dummy-data Splunk example only** ([splunk-example.md](splunk-example.md)). Don't use it for company work.

## 3. Outside services the app can talk to

The app can send data to these services. Inside a company, turn off every one that isn't approved.

| Service | When it's on | What leaves the network | How to keep it off |
|---|---|---|---|
| **PostHog** (usage analytics, US cloud) | `NEXT_PUBLIC_POSTHOG_KEY` is set | Page views, clicks (including the text of what was clicked), browser errors, and the app's own events, such as `report_csv_downloaded` with the report's slug | Leave the key empty. Also delete the two `/ingest` rewrites and `skipTrailingSlashRedirect` in `next.config.ts` ([below](#posthog-in-plain-words)). |
| **Next.js telemetry** | By default, when you run `next dev` or `next build` | Anonymous facts about the build, such as the Next version and which features are used, sent to `telemetry.nextjs.org`. No report data. | `NEXT_TELEMETRY_DISABLED=1` wherever you run or build. The `Dockerfile` already sets it. |
| **Google Gemini** (Ask AI, Write SPL, Explain, the briefing) | `GEMINI_API_KEY` is set | Questions, and up to 20 result rows of each report the viewer can see | `AI_ENABLED=false`, and no `GEMINI_API_KEY`. Never set `AI_ALLOW_LIVE_DATA` until the company approves the AI service. |
| **AntV charts MCP** (`.mcp.json`) | Only inside Claude Code | Whatever you ask it to chart | Leave `.mcp.json` out of the company copy. |
| **Splunk Cloud MCP** (`plugins/splunk-events/`) | Only inside Claude Code | Searches, through Splunk's MCP server | Leave `plugins/` and `.claude-plugin/` out of the company copy. |

Fonts and icons are in the repo, so the app fetches nothing from Google Fonts or any CDN.

### PostHog in plain words

- **PostHog** is a usage-tracking service, like Google Analytics. With a key, each person's browser reports what they open and click to PostHog's servers in the US.
- **The `/ingest` rewrite** in `next.config.ts` is a forwarding rule. When the browser calls `<your site>/ingest/…`, the app's server passes the call on to `us.i.posthog.com`. Sites do this so ad blockers don't stop the tracking.
- **Without a key nothing is tracked**, because the browser never loads PostHog. But the forwarding rule is still there, so the server would still pass on anything sent to `/ingest`. Deleting the rule means nothing can reach PostHog through the app, even by mistake.
- **To delete it:** remove the two `/ingest` rewrites and `skipTrailingSlashRedirect: true` from `next.config.ts`. Keep the `/favicon.ico` one. Optionally take `ingest` out of the `matcher` in `src/proxy.ts`. `track()` in `src/shared/analytics.ts` already does nothing without PostHog, so no other code changes.

## 4. Build

- [ ] **Build images from the `Dockerfile`, not with `docker-compose.yml`.** Compose builds the sign-in page with demo mode on and the public demo password.
- [ ] **Never run `next dev` as the server people use.** In development the sign-in page lists the demo accounts.
- [ ] **Use the company's registry for base images** (`node:24-slim`, and `python:3.14-slim` for the ML job). Change the `FROM` lines or use the registry's mirror ([kubernetes.md](kubernetes.md#1-build-and-push-the-images)).
- [ ] **Install packages through the company's npm and pip mirrors,** so they're scanned. Set the registry in `.npmrc`; npm then fetches the packages in `package-lock.json` from it.
- [ ] **Run the company's dependency and container scans** on the images, and keep Next.js at 16.4.2 or newer (a security fix).
- [ ] **Leave the developer-tool files out of the company copy:** `.mcp.json`, `.claude/`, `.claude-plugin/`, `plugins/`, `.21st/`, `.devcontainer/` and `CLAUDE.md`. The app doesn't need them to build or run.
  - **Keep `AGENTS.md` and `.github/copilot-instructions.md`.** They tell the company's approved AI coding assistant how to add report cards safely ([adding-report-cards.md](adding-report-cards.md)). They're plain text and send nothing anywhere.
- [ ] **Set `NEXT_TELEMETRY_DISABLED=1`** on laptops and build machines too, not only in the image.

## 5. Secrets

- [ ] **Generate new secrets for the company:** `BETTER_AUTH_SECRET` and `REVALIDATE_SECRET`, each with `openssl rand -base64 32`. Never reuse ones from a personal or demo setup.
- [ ] **Keep them in the company's secret manager** (Vault, External Secrets, or Kubernetes Secrets the platform team manages). Point the chart at it with `secrets.existingSecret`, not `secrets.values`.
- [ ] **Never commit a `.env` file,** a filled-in `values.yaml`, or a token. Git ignores `.env*` files except `.env.example`; keep your values file with the platform's configuration, not in the repo.
- [ ] **Never put a secret in a `NEXT_PUBLIC_*` variable.** Those are baked into the browser's JavaScript, where anyone can read them.
- [ ] **On a laptop,** keep `.env.local` only on the work laptop, and only with values you're allowed to hold there.

## 6. Splunk access

- [ ] **Ask for a service account, not your own login.** Give it a read-only role that can see only the scheduled searches the app should show. The example setup's role `splunk_events_reader` shows the idea ([splunk-example.md](splunk-example.md)).
- [ ] **Give the token only to the connector.** Mount it as a file and use `SPLUNK_TOKEN_FILE`. The chart already keeps it out of the web app's pods, and its CI checks that.
- [ ] **Use `https://` to the management port (8089).** If the certificate comes from the company's own certificate authority, add that authority with `NODE_EXTRA_CA_CERTS` (`connector.caBundle.configMap` in the chart). **Never turn certificate checks off.**
- [ ] **Choose which searches become reports.** `SYNC_REPORTS=configured` copies only the reports that have a card in `config/report-cards.yaml` ([adding-report-cards.md](adding-report-cards.md)). The default, `emailed`, copies every scheduled search that emails its results, which can be far more than you meant.
- [ ] **To turn dashboard tiles into cards** with `npm run splunk:tiles`, the service account also needs read access to those dashboards. The command only reads, but its worksheet holds the company's searches, so keep it inside the company.
- [ ] **Limit how much is copied:** `SYNC_MAX_ROWS` (default 5000 rows per run).
- [ ] **Check the connection before the first sync:** `npm run splunk:check` ([connecting-live-splunk.md](connecting-live-splunk.md)).
- [ ] **Agree on token rotation** with the Splunk team: who renews it, and how often.

## 7. Database

- [ ] **Use a MongoDB the company has approved, never a personal Atlas cluster.**
- [ ] **Give the app its own database user** that can read and write only the app's database.
- [ ] **Require TLS and authentication** in `MONGODB_URI`, and follow the company's backup and encryption rules.
- [ ] **Set `RUN_RETENTION_DAYS` before the first sync,** to match the company's data-retention rules. The index that deletes old runs is created once (default 90 days).
- [ ] **Remember that some things are kept forever.** Outside demo mode, AI chats, votes and saved Write SPL examples have no expiry. Agree how long they may stay, and delete them by hand or add an expiry if needed.

## 8. Sign-in and access

- [ ] **Don't create the demo accounts.** Don't run `npm run seed`, keep `demo.enabled: false` in the chart, and leave `DEMO_MODE` and `DEMO_PASSWORD` unset.
  - *Why:* the demo password is in this public repo, so anyone who has read it could sign in.
- [ ] **Plan company single sign-on before real people use it.** Today the only accounts are the demo accounts. The plan is OIDC or SAML against the company's directory ([mongodb-and-access.md](mongodb-and-access.md), [splunk-data-and-ai-strategy.md](splunk-data-and-ai-strategy.md)).
- [ ] **Check who sees which report.** Without `groups` on its card in `config/report-cards.yaml`, a report's email lists decide who sees it (`secops@…` → group `secops`). Check that those groups match the people allowed to see the data ([report-access.md](report-access.md)).
- [ ] **Keep admins few.** An `admin` sees every report.
- [ ] **Set `BETTER_AUTH_URL` (`url` in the chart)** to the exact address people open. Sign-in only works from it.

## 9. On the network

- [ ] **Serve it over HTTPS only,** with the company's certificate on the Route or Ingress.
- [ ] **Keep it on the internal network,** behind the company's VPN or access gateway, not open to the internet.
- [ ] **Add security headers.** The app sets none itself. Ask the platform team to add them at the Route, Ingress or gateway, or add a `headers()` block to `next.config.ts`:
  - `Strict-Transport-Security` (HTTPS only);
  - `X-Content-Type-Options: nosniff`;
  - `X-Frame-Options: DENY` or a `Content-Security-Policy` with `frame-ancestors 'none'` (no embedding in other sites);
  - `Referrer-Policy: same-origin`.
- [ ] **Open only the network paths it needs:** from the namespace to Splunk's port 8089 and to MongoDB, plus an approved AI service if you use one. Block everything else going out if the platform allows it.
- [ ] **Keep `web.replicas: 1`** until the refresh reaches every pod ([kubernetes.md](kubernetes.md#before-you-go-live)).

## 10. Data handling

- [ ] **Find out how sensitive the reports are.** Splunk results can hold user names, IP addresses, host names and account details. The company's data-classification rules decide where they may be stored and who may see them.
- [ ] **Know that viewers can download a report's rows** as CSV from its page. Anyone who can see a report can take its data with them.
- [ ] **Keep AI off** until the company approves an AI service for this data. Then use that service (Vertex AI or the company's own LLM, [ai.md](ai.md#using-another-ai)), never a free-tier key, and only then set `AI_ALLOW_LIVE_DATA=true`.
- [ ] **Check what the logs hold.** The connector logs counts and errors, not result rows. AI errors are logged on the server. Send the logs where the company keeps application logs.
- [ ] **Don't share screenshots of real reports** outside the company, including in the public repo, issues or AI chats.

## 11. Before go-live

- [ ] Approval for the code (section 1) is written down.
- [ ] Security or architecture review done, if the company requires one for internal apps.
- [ ] Owner named: who fixes it, renews the Splunk token, and updates dependencies.
- [ ] The settings below are in place, and the outside services in section 3 are off.
- [ ] Sign-in uses company accounts, and the demo accounts don't exist.
- [ ] A test sign-in as a viewer sees only that viewer's reports.

### What to ask whom

| Team | Ask for |
|---|---|
| Your manager | Who approves outside code, and whether this project needs a review |
| Open-source or legal office | Approval to bring the code in, or confirmation that a fresh build is fine |
| Splunk team | A read-only service account and token, the searches it may read (and the dashboards, if you'll turn their tiles into cards), the management port's address and certificate authority |
| Database team | A MongoDB database and user, its retention and backup rules |
| Platform team | A namespace, the image registry and package mirrors, the app's address and certificate, secrets, network access and security headers ([kubernetes.md](kubernetes.md#what-to-ask-your-platform-team)) |
| Identity team | Single sign-on (OIDC or SAML) for the app |
| Security team | Whether any AI service is approved for this data |

## Company settings to start from

For `.env.local` on a work laptop, or `web.env` and `connector.env` in the chart. Secrets go in the secret manager, not here.

```bash
# Outside services off
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_POSTHOG_KEY=
AI_ENABLED=false
GEMINI_API_KEY=
AI_ALLOW_LIVE_DATA=

# No demo accounts
DEMO_MODE=
DEMO_PASSWORD=

# Your company's Splunk
SPLUNK_MODE=live
SPLUNK_BASE_URL=https://<search head>:8089
SPLUNK_TOKEN_FILE=<path of the mounted token>   # connector only
SPLUNK_TZ=<the search head's timezone, e.g. America/New_York>
SYNC_REPORTS=configured
SYNC_MAX_ROWS=5000

# Data kept
RUN_RETENTION_DAYS=<the company's retention, in days>   # before the first sync
```

Plus the code change from section 3: delete the two PostHog `/ingest` rewrites in `next.config.ts`.
