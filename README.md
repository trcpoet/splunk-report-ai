# SplunkEvents

**Splunk reports without the inbox.** SplunkEvents puts every scheduled Splunk report your teams receive by email into one searchable web app. Instead of digging through email threads, people sign in and see the reports their teams used to get: the latest results as a chart and a table, run history, the SPL query, and a CSV download.

**Live demo:** [splunk-report-ai.vercel.app](https://splunk-report-ai.vercel.app). Pick a demo account on the sign-in page to see what each team sees.

> **Demo status:** every report is **dummy data** (see [`lib/splunk/fixtures/reports.ts`](lib/splunk/fixtures/reports.ts)). Hosts, users and results are made up, emails use `example.com`, and IPs come from documentation-only ranges. The sync worker loads it through a fixture that answers like the Splunk REST API, so the whole pipeline runs without a Splunk instance. Logins are seeded demo accounts.

## What the demo shows

- **Sign-in and per-team access:** each user sees only the reports their groups used to receive by email. Admins see everything.
- **Overview:** headline numbers for the reports you can see, scheduled runs per day by outcome, and the report list with search and status/category filters.
- **Report page (`/reports/[slug]`):** status and alert message, key numbers, a chart of the latest results (the chart type saved in Splunk), the results table, the SPL query, a results-per-run trend and the run history, schedule details, the distribution lists that used to receive the email, and **Download CSV** / **Copy SPL** buttons.
- **Briefing and Explain:** the home page says what needs attention and which runs look unusual (plain statistics, `lib/insights.ts`), with a short AI summary. Every report card has **Explain**: an AI summary of the latest run plus a quick look at its results.
- **ML job (`ml/`):** a Python script that scores every run with an Isolation Forest and learns from the briefing's "Worth flagging?" votes which flags matter. The briefing, Explain and Ask AI use its scores. See [docs/ml.md](docs/ml.md).
- **Ask AI (`/ai`):** ask questions about your reports and get answers that link to the reports they use, or describe a search and get the SPL explained step by step (never run). Every chat is saved, and the History tab lists them all. Answers come from Google Gemini and see only your reports. Without a `GEMINI_API_KEY` the page says AI is off. See [docs/ai.md](docs/ai.md).
- **JSON API:** `GET /api/reports` and `GET /api/reports/[slug]` return only what the signed-in user may see (401 when signed out, 404 for reports that are missing or hidden).

## How it works

```
Splunk REST API (:8089) ─┐
   or the fixtures       ├─► sync worker ─► MongoDB ◄─ data access layer (lib/dal.ts) ─► pages, API
                         │   npm run sync               ▲
                         └── POST /api/revalidate ──────┘  clears the cached report data
```

- **Sync worker** (`worker/sync.ts`, `lib/splunk/`): a separate Node process. It lists scheduled saved searches, fetches only runs it hasn't stored yet (job details and results), and upserts them into MongoDB. It never starts searches itself, so it doesn't compete with the scheduler. Splunk deletes run results after `dispatch.ttl` (two schedule periods by default), so MongoDB keeps the history; runs older than `RUN_RETENTION_DAYS` expire.
- **Report settings** (`lib/report-config.ts`): what Splunk doesn't know about a report, such as its category, tags, who may see it, the chart measure, and status rules (for example, "warn when any host is above 2% errors").
- **Access** (`lib/dal.ts`, `lib/access.ts`): every page and API route reads data through the data access layer, which checks the signed-in user's groups. `proxy.ts` only redirects signed-out visitors to `/login`.
- **Login** (Better Auth, email and password for the demo): public sign-up is off; accounts come from `npm run seed`. Report access lives in its own `user_access` collection, so moving to company SSO later doesn't change the access code.
- **Caching and loading** (`lib/dal.ts`, `components/Skeletons.tsx`, `components/Transitions.tsx`): report data is cached on the server until the next sync, each user's own pages in their browser for 5 minutes, and a report card loads its report when you point at it. Placeholders keep their content's size, so nothing jumps.

- **Ask AI** (`lib/ai/`, `app/ai/`, `app/api/ai/`): one file talks to Gemini (`lib/ai/llm.ts`), and the AI only gets the reports the data access layer allows you. Chats live in MongoDB (`lib/chats.ts`), and each account has a daily limit.
- **ML job** (`ml/`): Python, run after a sync. It reads the runs and votes from MongoDB, and writes its scores back for the app to read (`ml_run_scores`, `ml_report_scores`).

New to the code? [docs/codebase-guide.md](docs/codebase-guide.md) explains what every file does and how the pieces connect. New to MongoDB, or changing who sees what? See [docs/mongodb-and-access.md](docs/mongodb-and-access.md). What's cached where, and what each loading or error screen means: [docs/caching-and-loading.md](docs/caching-and-loading.md).

## Running with Docker (no other setup)

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000) and pick a demo account (password `splunk-demo-2026`). This starts MongoDB, loads the dummy reports and runs the app, with nothing else to install or configure. Settings, the ML job and sharing it with a team: [docs/docker.md](docs/docker.md).

## Running locally

Requires Node.js 22.9 or newer (the scripts use `--env-file-if-exists`) and MongoDB 8.

1. **Install packages:** `npm install`
2. **Start MongoDB.** With Homebrew (lightest on a laptop):

   ```bash
   brew tap mongodb/brew
   brew install mongodb-community@8.0
   brew services start mongodb-community@8.0
   ```

   Newer Homebrew asks you to trust third-party taps first: `brew trust --formula mongodb/brew/mongodb-community@8.0`. Its default config listens on localhost only.

   Or with Docker: `docker run -d --name splunkevents-mongo -p 127.0.0.1:27017:27017 -v splunkevents-mongo-data:/data/db mongo:8`

3. **Configure:** copy `.env.example` to `.env.local` and fill it in. Generate the secrets with `openssl rand -base64 32`.
4. **Create the demo users:** `npm run seed`
5. **Load the reports:** `npm run sync` (9 reports and 63 runs the first time; running it again adds nothing new)
6. **Start the app:** `npm run dev`, then open [http://localhost:3000](http://localhost:3000)

### Demo logins

All use the value of `DEMO_PASSWORD` from `.env.local` as their password (see it with `grep DEMO_PASSWORD .env.local`). To pick your own, change it there and run `npm run seed` again. In development and on the hosted demo, the login page lists the accounts.

| User | Groups | Sees |
|---|---|---|
| admin@example.com | admin | all 9 reports |
| soc.analyst@example.com | secops, soc-tier1 | failed logins, firewall denies, privileged group changes |
| sre.oncall@example.com | sre, web-oncall, infra-oncall | web 5xx, disk space, forwarder health |
| finance.analyst@example.com | finance-ops, it-finance | payments, license usage |
| it.director@example.com | it-director | failed logins, VPN by country |

A report's groups default to the email lists it was sent to (`secops@example.com` → `secops`). Override them per report in `lib/report-config.ts`, and copy them there **before** you turn off a report's email action in Splunk, because the defaults disappear with it. Scheduled searches that aren't in `report-config` yet are admin-only. See [docs/report-access.md](docs/report-access.md) for every setting and a worked example.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run sync` | Sync once, then exit (exit code 1 if any report failed) |
| `npm run sync:watch` | Sync every `SYNC_INTERVAL_MINUTES` (default 15) |
| `npm run seed` | Create the demo users and their access (safe to run again) |
| `npm test` | Unit tests, plus the full sync pipeline against the fixtures |
| `npm run lint` | ESLint |
| `npm run ml` / `ml:plot` | Score the runs with the ML job (`ml:plot` also draws a chart). Set up its Python environment first: [ml/README.md](ml/README.md) |
| `npm run test:ml` | The ML job's tests |
| `npm run eval:spl` | Score Write SPL on 10 requests over the demo reports (needs a Gemini key; see [docs/ai.md](docs/ai.md#how-write-spl-learns-from-your-searches)) |

## Hosted demo

The live demo runs on Vercel with a free MongoDB Atlas cluster (M0). To host your own:

1. In Atlas, create a cluster, a database user with `readWrite` on `splunkevents`, and a network access entry for `0.0.0.0/0` (Vercel functions have no fixed IP addresses).
2. Before the first deploy, load the data from your machine with the Atlas connection string. The dummy runs have fixed dates, so set a long retention or MongoDB deletes them after 90 days:

   ```bash
   export MONGODB_URI="mongodb+srv://<user>:<password>@<cluster host>/splunkevents" RUN_RETENTION_DAYS=3650
   DEMO_PASSWORD="<public demo password>" npm run seed
   npm run sync
   ```

3. Import the repo in Vercel and set `MONGODB_URI`, `RUN_RETENTION_DAYS=3650`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the site's URL), `DEMO_MODE=true`, `DEMO_PASSWORD`, `REVALIDATE_SECRET` and `APP_URL` (the site's URL).

Vercel deploys only `main` (`vercel.json`'s `git.deploymentEnabled`); other branches get no deployment. Pull requests are checked by CI instead, and preview builds would fail anyway: the Preview environment has no settings, such as `MONGODB_URI`. (An `ignoreCommand` that checks `VERCEL_ENV` skipped production too, because the variable was empty in that step.)

`DEMO_MODE=true` lists the demo accounts on the sign-in page with one-click sign-in and shows their password, so use it only with dummy data. The sign-in form is built into the page when the app is built, so after changing `DEMO_MODE` or `DEMO_PASSWORD`, redeploy (Vercel applies new settings only to new deployments anyway). Because visitors share those accounts, `/api/auth` only serves sign-in, sign-out and session lookups ([`app/api/auth/[...all]/route.ts`](app/api/auth/[...all]/route.ts)): nobody can change a demo account's password or see who else is signed in to it.

## Connecting real Splunk

**Step-by-step guide:** [docs/connecting-live-splunk.md](docs/connecting-live-splunk.md) (work laptop setup, what to ask your Splunk admin, testing the token, troubleshooting). **Who sees which report:** [docs/report-access.md](docs/report-access.md). **The overall strategy** (AD sign-in, what to copy, RAG over past searches, learning from feedback, an agent with guardrails, anomaly detection): [docs/splunk-data-and-ai-strategy.md](docs/splunk-data-and-ai-strategy.md).

In short, the mapping, access and UI code stay the same; only the worker's settings change:

1. Create a Splunk service account with an authentication token, and share the scheduled reports with its role.
2. On Splunk Cloud, add the worker's IP address to the `search-api` allow list (needs `sc_admin` or a support ticket; trial stacks have no REST access).
3. Set `SPLUNK_MODE=live`, `SPLUNK_BASE_URL` (the management port, usually `https://<host>:8089`), `SPLUNK_TOKEN` and `SPLUNK_TZ` (the search head's timezone) for the worker only. The web app never needs the token.
4. For an internal certificate authority, point `NODE_EXTRA_CA_CERTS` at its certificate. Don't turn off certificate checks.
5. Run `npm run sync:watch` more often than your shortest `dispatch.ttl`, so no run's results expire before they are stored.

Add company SSO (Entra ID or Okta through Better Auth) before exposing real report data, and write each user's groups into `user_access` at sign-in.

## Claude Code tools

This repo ships a Claude Code plugin, `splunk-events` (in `plugins/`), that bundles the Splunk Cloud MCP server and the `splunk-reports` skill. `.mcp.json` also adds three MCP servers: shadcn (browse and add components), AntV charts, and MongoDB (read-only, to look at the synced collections).

```bash
claude plugin marketplace add ./
claude plugin install splunk-events@splunk-events-tools --scope project
```

The Splunk MCP server uses OAuth. Ask your Splunk admin for the stack's MCP endpoint URL and an OAuth client whose redirect URI is `http://localhost:8787/callback` (scopes `openid offline_access`). Then export both values in your shell, not in `.env.local`, because Claude Code reads them:

```bash
export SPLUNK_MCP_URL="https://<your-stack>.splunkcloud.com/.../mcp"
export SPLUNK_MCP_CLIENT_ID="<client id>"
```

Restart Claude Code, run `/mcp`, choose `splunk`, and sign in through the browser.

The MongoDB server connects to the local `splunkevents` database by default. To point it elsewhere, export `MDB_MCP_CONNECTION_STRING`.

> The AntV chart server renders charts through AntV's public service by default, so don't send it real report data.

## Tech stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, MongoDB with Mongoose, Better Auth, shadcn/ui charts (Recharts), Google Gemini through `@google/genai` (Ask AI), Python with pandas and scikit-learn (the ML job), and optionally PostHog.
