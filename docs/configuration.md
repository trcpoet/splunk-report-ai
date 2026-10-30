# Configuration

Everything an engineer can set or change, where it lives, and what reads it:
- **Environment variables** come first, grouped by the program that reads them.
- **Settings in code** follow: report rules, people and access, the sync, AI, statistics and ML, caching, look and feel, build and deploy, and developer tools.

How the pieces fit together: [architecture.md](architecture.md). What each file does: the [file reference](reference/README.md).

## Where settings live

| Where | Used by | Notes |
|---|---|---|
| `.env.local` (copy of `.env.example`) | `npm run dev`, `build`, `start`; the Node scripts (`sync`, `seed`, `test`, `eval:spl`, `splunk:setup`, `splunk:feed`), which load it with `--env-file-if-exists`; the ML job, through python-dotenv | Git ignores every `.env*` file except `.env.example`. Generate secrets with `openssl rand -base64 32`. Values already in the shell win. |
| The shell environment | Everything above, and Claude Code tools (`.mcp.json`, the plugin) | Claude Code reads its tools' settings from the shell, not from `.env.local`. |
| Vercel → Settings → Environment Variables | The hosted web app | Production only: PR branches don't deploy. New values apply to new deployments, so redeploy after a change. |
| A `.env` next to `docker-compose.yml` | `docker compose` | Every value has a default ([docker.md](docker.md)). |
| `.github/workflows/ci.yml` | CI | Placeholders only. The build never connects to the database, so GitHub holds no secrets. |
| `lib/*.ts` and other code files | Everyone | Settings that are rules, not values: reports, access, limits. Change them in a PR. |

**Build-time values.**
- The sign-in page is prerendered, so `DEMO_MODE` and `DEMO_PASSWORD` are read when the app is **built**. After changing them, rebuild or redeploy.
- `NEXT_PUBLIC_*` values are baked into the browser bundle at build time too.

## Environment variables

### Shared by several programs

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `MONGODB_URI` | none (required) | `lib/mongodb.ts`, `lib/auth-options.ts`, `ml/score.py` | The database, including its name, e.g. `mongodb://127.0.0.1:27017/splunkevents`. The web app gives up after 5 s if it doesn't answer; the worker waits the driver's 30 s. |
| `RUN_RETENTION_DAYS` | `90` | `database/report-run.model.ts` | Days before MongoDB deletes a run (a TTL index on `runAt`). **Set it before the first sync**: the index is created once. The dummy runs have fixed dates, so demos use `3650`. |
| `REVALIDATE_SECRET` | none | `app/api/revalidate/route.ts`, `lib/splunk/sync.ts`, `ml/score.py` | The shared secret for `POST /api/revalidate`, which the worker and the ML job call after writing. Without it, new data shows after at most a minute instead of at once. |
| `APP_URL` | none | `lib/splunk/sync.ts`, `ml/score.py` | Where the worker and the ML job find the web app, for that refresh. |

### Web app

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | none (required) | `lib/auth-options.ts` | Signs session cookies. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | none (required) | `lib/auth-options.ts` | The site's own address. Sign-in only works from it, so set it to the URL people use (on Vercel, the production domain, not a per-deployment URL). |
| `DEMO_PASSWORD` | none | `app/login/page.tsx` (build time), `scripts/seed-demo-users.ts` | The demo accounts' shared password (8+ characters). Run `npm run seed` after changing it. |
| `DEMO_MODE` | off | `app/login/page.tsx` (build time), `lib/chats.ts`, `lib/ai/config.ts`, `components/AiChat.tsx`, `app/ai/history/page.tsx` | `true` lists the demo accounts with one-click sign-in **and shows the password**, deletes chats after 24 h, and adds the "demo accounts are shared" notes. **Dummy data only.** |
| `NEXT_PUBLIC_POSTHOG_KEY` | none | `instrumentation-client.ts` | Turns on PostHog (US cloud) through the `/ingest` proxy in `next.config.ts`. Without it, PostHog never loads and `track()` (`lib/analytics.ts`) does nothing. |
| `GEMINI_API_KEY` | none | `lib/ai/llm.ts`, `scripts/eval-spl.ts` | Turns on AI answers. Free-tier keys are for dummy data only ([ai.md](ai.md#privacy-and-safety)). |
| `AI_MODEL` | `gemini-3.8-flash` | `lib/ai/config.ts` | The answering model. `gemini-3.1-flash-lite` is cheaper. |
| `AI_EMBEDDING_MODEL` | `gemini-embedding-2` | `lib/ai/config.ts` | The model that turns searches into vectors for Write SPL's examples. Changing it re-embeds the examples (the cache key includes the model). |
| `AI_PROVIDER` | `gemini` | `lib/ai/config.ts`, `lib/ai/llm.ts`, `scripts/eval-spl.ts` | `fake` gives canned answers with no key and no cost, for working on the pages and for tests. |
| `AI_ENABLED` | on | `lib/ai/config.ts` | `false` turns AI answers off, even with a key. |
| `AI_DAILY_LIMIT` | `50` | `lib/ai/config.ts` → `lib/ai/usage.ts` | AI requests per account per UTC day. |
| `AI_SITE_DAILY_LIMIT` | `1000` | `lib/ai/config.ts` → `lib/ai/usage.ts` | AI requests per UTC day for everyone together, including briefings. |
| `AI_ALLOW_LIVE_DATA` | off | `lib/ai/config.ts` | With `SPLUNK_MODE=live` data in the database, AI stays off until this is `true`. Set it only once sending report data to the provider is approved. |
| `SPLUNK_WEB_URL` | none | `lib/ai/config.ts` → `lib/ai/spl.ts` | Splunk Web's address (e.g. `https://splunk.example.com/en-US`), for **Open in Splunk** under Write SPL answers. |

### Sync worker

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `SPLUNK_MODE` | `fixture` | `worker/sync.ts` | `fixture` serves the 9 dummy reports from `lib/splunk/fixtures/`. `live` calls Splunk's REST API. The mode is saved in `sync_state`, which is how the web app knows the data is live. |
| `SPLUNK_BASE_URL` | none | `worker/sync.ts` | Required for `live`: the management port, usually `https://<host>:8089`. |
| `SPLUNK_TOKEN` | none | `worker/sync.ts` → `lib/splunk/transport.ts` | Required for `live` (or `SPLUNK_TOKEN_FILE`): a service account's authentication token. **Only the worker's environment may hold it.** |
| `SPLUNK_TOKEN_FILE` | none | `worker/sync.ts` → `lib/splunk/transport.ts` (`splunkTokenFromEnv`) | Instead of `SPLUNK_TOKEN`: the path of a file holding the token, such as a mounted Docker or Kubernetes secret. `SPLUNK_TOKEN` wins when both are set. |
| `SPLUNK_TZ` | `UTC` | `worker/sync.ts` | The search head's timezone, for the schedule text ("Every day at 06:00") and runs per week. |
| `SYNC_INTERVAL_MINUTES` | `15` | `worker/sync.ts` | How often `npm run sync:watch` syncs. Keep it shorter than the shortest `dispatch.ttl`, or results expire before they're copied. |
| `SYNC_MAX_ROWS` | `5000` | `lib/splunk/sync.ts` | Result rows kept per run. Runs with more are stored cut off, marked `truncated`. Not in `.env.example`. |
| `NODE_EXTRA_CA_CERTS` | none | Node.js itself | A company CA certificate, for a search head with an internal certificate. Never turn certificate checks off instead. |

### The Splunk example

Only for `docker-compose.splunk.yml` and `npm run splunk:setup` / `splunk:feed` ([splunk-example.md](splunk-example.md)).

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `SPLUNK_GENERAL_TERMS` | none (required) | `docker-compose.splunk.yml` → Splunk's image | `--accept-sgt-current-at-splunk-com`, once you've read Splunk's General Terms. Splunk won't start without it. |
| `SPLUNK_PASSWORD` | `splunk-example-2026` | `docker-compose.splunk.yml` | The test Splunk's admin password. |
| `SPLUNK_ADMIN_URL` | `http://localhost:8089` | `scripts/splunk-example/admin.ts` | The test Splunk's management port, for the setup and the feeder. |
| `SPLUNK_ADMIN_USER`, `SPLUNK_ADMIN_PASSWORD` | `admin`, none | `scripts/splunk-example/admin.ts` | The test Splunk's admin. Only the setup and the feeder use it; the connector gets a token instead. |
| `SPLUNK_EXAMPLE_CRON` | `*/5 * * * *` | `scripts/splunk-example/setup.ts` | When the example's six reports run. CI runs them every minute. |
| `SPLUNK_TOKEN_FILE` | `.splunk-example/token` | `scripts/splunk-example/setup.ts` | Where the setup writes the connector's token, which the connector then reads. |

### ML job

`ml/score.py` reads `MONGODB_URI` (required), `APP_URL` and `REVALIDATE_SECRET`. It takes them from the shell, or else from the repo's `.env.local`. Without the last two it still saves its scores, and the app shows them once its cache expires. Its setup and flags are in [ml/README.md](../ml/README.md).

### Build and hosting

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `NEXT_OUTPUT` | unset | `next.config.ts` | `standalone` builds Next's minimal server, as the `Dockerfile` does. Vercel builds without it. |
| `PORT` | `3000` | `docker compose` (host port), Next's server | The port the app listens on, or is published on. |
| `DEMO_MODE`, `DEMO_PASSWORD` | `true`, `splunk-demo-2026` in Docker | `Dockerfile` build arguments | Baked into the sign-in page when the image is built. |
| `NODE_ENV`, `NEXT_RUNTIME` | set by Next.js | `app/login/page.tsx`, `lib/mongodb.ts`, `lib/auth-options.ts`, `instrumentation-client.ts` | Not set by hand. In development, the sign-in page lists the demo accounts. Inside Next.js, database connections give up after 5 s. |

### Developer tools

| Variable | Read by | What it does |
|---|---|---|
| `MDB_MCP_CONNECTION_STRING` | `.mcp.json` | The database the read-only MongoDB MCP server looks at (default: local `splunkevents`). |
| `SPLUNK_MCP_URL`, `SPLUNK_MCP_CLIENT_ID` | `plugins/splunk-events/.mcp.json` | The Splunk Cloud MCP server's endpoint and OAuth client, for Claude Code. Export them in the shell, not `.env.local`. |

## Reports: `lib/report-config.ts`

This file holds what Splunk doesn't know about each report, keyed by the saved search's exact name. The sync worker applies it, and the web app reads the results. It must not import `server-only` or `next/*`, because plain Node loads it too.

| Field | Required | What it does |
|---|---|---|
| `slug` | yes | The report's id in URLs (`/reports/<slug>`) and in AI answers (`[[slug]]`). Changing it starts a new report: the sync marks the old one `disabled`, and its stored runs stay under the old slug. |
| `category` | yes | One of `Security`, `Operations`, `Infrastructure`, `Business`, `Compliance`, `Other`. Drives the filter chips. |
| `tags` | yes | Free words for search and "similar reports". |
| `groups` | no | Who may see it. **Without it, the email lists** in `action.email.to` decide (`secops@example.com` → `secops`). Copy them here before turning off a report's email action in Splunk, or the access goes with it. |
| `chart` | no | `'none'` shows only the table. Otherwise:<br>• `type`: `bar`, `column`, `line` or `area`. Overrides the chart saved in Splunk.<br>• `y`: the measure to plot (default: the first numeric column).<br>• `threshold`: `{ value, label }`, a dashed limit line. Values past it take the warning color.<br>• `max`: turns bars into meters that fill up to it (100 for a percentage).<br>• `panels`: one small chart per measure.<br>• `scatter`: `{ x, log?, caption }`, adds a chart of dots placing `y` against `x`. |
| `index` | no | Overrides the index text parsed from the SPL, for searches like `| rest` or `metadata`. |
| `statusRule` | no | `(results) => { status: 'warning' \| 'failed', message } \| null`. Turns a run's results into a warning, such as "a host is above 2% errors". `null` means fine. |
| `highlights` | no | `(results) => ReportHighlight[]`. The headline numbers: `{ label, value, note?, meter?, trend? }`. `meter` is the share of a limit used (0.6 is 60%). Without it, `defaultHighlights` in `lib/splunk/map.ts` shows the results (with the change since the previous run), the chart's top row, and the search time. |

**Adding a report:**
1. Add an entry under the saved search's exact name. Copy an existing one: `'Web Server 5xx Error Rate'` has a status rule, highlights and a threshold chart.
2. Keep limits in named constants at the top (`ERROR_BUDGET_PCT`), so the rule and the chart use the same number.
3. Use `formatNumber` from `lib/format.ts` in messages, so numbers read the same everywhere.
4. In fixture mode, add the dummy report to `lib/splunk/fixtures/reports.ts` as well. Use `example.com` addresses and documentation IP ranges only.
5. Run `npm test`. `lib/splunk/map.test.ts` runs the whole pipeline over the fixtures.
6. Run `npm run sync`. Status, highlights and charts are worked out by the sync, so a change shows only after one. For the hosted demo, also sync Atlas after the deploy.

Worked examples, and how access works in practice: [report-access.md](report-access.md).

## People and access

| What | Where | How to change it |
|---|---|---|
| Demo accounts | `lib/demo-users.ts` | Edit the list (email, name, `admin` or `viewer`, groups), then run `npm run seed`. Existing users get the current password and access. |
| Anyone's groups and role | `user_access` collection (one document per email) | Set them in MongoDB, or have sign-in write them (the SSO plan in [mongodb-and-access.md](mongodb-and-access.md)). Takes effect within 5 minutes (the viewer cache). |
| The access rule | `lib/access.ts` (`canView`) | One function, tested in `lib/access.test.ts`. Admins see everything; others need a shared group. |
| Which auth endpoints are served | `app/api/auth/[...all]/route.ts` | Only sign-in, sign-out and session lookups. Add paths here when a feature needs them, such as SSO's `/sign-in/social` and `/callback/<provider>`. |
| Where to go after sign-in | `lib/next-path.ts` | Only paths on this site. |

## The sync

Settings in `lib/splunk/sync.ts`:

| Constant | Value | What it does |
|---|---|---|
| `HISTORY_LOOKBACK` | 50 | How many of each report's newest jobs to ask Splunk about. |
| `HISTORY_SIZE` | 7 | Runs kept on each report document, for the run dots, the history table and the AI context. |
| `MAX_ROWS` | `SYNC_MAX_ROWS` or 5000 | Result rows stored per run. |
| `SECOND_REFRESH_MS` | 3000 | The gap between the two cache refreshes after a sync. |

Splunk REST calls retry on 429 and 5xx, with backoff of about 0.5, 1 and 2 s (`lib/splunk/transport.ts`). To connect real Splunk, follow [connecting-live-splunk.md](connecting-live-splunk.md).

## Ask AI

Besides the environment variables above, these live in code:

| Setting | Where | Value | What it does |
|---|---|---|---|
| Prompts | `lib/ai/prompts.ts` | `REPORTS_PROMPT`, `SPL_PROMPT`, `REPORT_SUMMARY_PROMPT`, `BRIEFING_PROMPT` | What the AI is told, in plain English. **Bump `PROMPT_VERSION`** after changing the summary or briefing prompts, so saved summaries are rewritten. |
| Rows per report | `lib/ai/context.ts` | `MAX_ROWS = 20` | Result rows of each report the AI sees. More rows cost more tokens. |
| Answer cap | `lib/ai/llm.ts` | `MAX_OUTPUT_TOKENS = 8192` | Caps each answer, thinking included, and with it what one question can cost. |
| Thinking | the AI routes | `low` (chat, summaries), `medium` (Write SPL) | More is slower and costs more. |
| Embedding size | `lib/ai/llm.ts` | `EMBEDDING_DIMENSIONS = 768` | The vector size. Part of each vector's cache key. |
| Examples per request | `lib/spl-examples.ts` | `SIMILAR_EXAMPLES = 5`, `MAX_SAVED = 500` | How many example searches go into a Write SPL prompt, and how many saved ones are considered. |
| Messages per chat | `database/chat.model.ts` | `MAX_CHAT_MESSAGES = 100` | 50 questions and answers; then start a new chat. |
| Demo chat lifetime | `lib/chats.ts` | `DEMO_CHAT_HOURS = 24` | With `DEMO_MODE`, chats expire after this. |
| Question length | `components/ChatView.tsx` | `MAX_QUESTION = 2000` | Characters per question. |
| Route time limit | `app/api/ai/*/route.ts` | `maxDuration = 60` | Seconds a serverless function may run on Vercel. |

**Using another AI.** Rewrite `lib/ai/llm.ts` and keep the inputs and outputs of `streamText`, `generateJson` and `embed`. Steps for Vertex AI or a company's own LLM are in [ai.md](ai.md#using-another-ai).

**Measuring a change.** `npm run eval:spl` runs Write SPL over `scripts/spl-eval-set.json` with a real key. Run it before and after changing a prompt, the examples or the model.

## Statistics and the ML job

| Setting | Where | Value | What it does |
|---|---|---|---|
| Earlier runs needed | `lib/insights.ts` | `MIN_BASELINE = 4` | A run is compared only with at least this many earlier successful runs. |
| Unusual threshold | `lib/insights.ts` | `UNUSUAL_SCORE = 3.5` | How many robust spreads (MAD) from the median count as unusual. |
| The same rules in Python | `ml/features.py` | must match | `test_robust_z_matches_the_app` checks they agree. Change both together. |
| Share of runs the forest flags | `ml/score.py` | `CONTAMINATION = 0.05` | About 3 of the demo's 64 runs. |
| Votes before learning | `ml/score.py` | `MIN_VOTES = 20` | The flag model waits for this many votes, with at least one 👍 and one 👎. |

Run the job with `npm run ml` (or `ml:plot` for a chart) after a sync. Its Python setup: [ml/README.md](../ml/README.md).

## Caching, refresh and timeouts

| Setting | Where | Value | What it does |
|---|---|---|---|
| Report cache | `lib/dal.ts` | `cacheLife('minutes')`, tag `reports` | Up to a minute on the server, cleared at once by `/api/revalidate`. |
| Viewer cache | `lib/dal.ts` | `'use cache: private'` + `cacheLife('minutes')` | 5 minutes in the person's browser. |
| Auto refresh | `components/AutoRefresh.tsx` | `EVERY_MS = 60_000` | Open pages re-render once a minute, except Ask AI and the sign-in page. |
| Database timeout (web app) | `lib/mongodb.ts`, `lib/auth-options.ts` | 5 s | Pages show "Couldn't load this page" instead of hanging. |

Uncached reads (chats, votes) must start with `await connection()` inside `<Suspense>`. Why, and what each loading or error screen means: [caching-and-loading.md](caching-and-loading.md).

## Look and feel

| What | Where | Notes |
|---|---|---|
| Colors, radius, the navbar's height | `:root` in `app/globals.css` | `--background`, `--primary`, `--color-dark-100` and `--color-dark-200` (surfaces), `--color-light-100` and `--color-light-200` (text), `--header-height` (what sticks under the navbar). |
| Chart colors | `--chart-1` … `--chart-5` in `app/globals.css` | Validated for the dark surface (contrast, color-blind distance). Re-check if you change them. |
| Status colors | `--status-success`, `--status-warning`, `--status-failed` | Only for run outcomes, never as series colors. |
| Chart styling | `lib/chart-theme.ts` | Axes, gridlines, tooltip, bar size, threshold line. |
| Typefaces | `app/fonts.ts` | Schibsted Grotesk (headings) and Martian Mono (code), through `next/font`. Body text uses the system font. |
| Component styles | `app/globals.css`, grouped by area | Plain CSS with Tailwind 4's `@apply`, in `@layer components`. |
| shadcn/ui | `components.json` | Used for the chart wrapper in `components/ui/`. `npx shadcn add <item>` adds more. |
| Background rays | `app/layout.tsx` (`<LightRays>` props) | Color, speed and spread of the WebGL background. |
| The 21st design context | `.21st/design.json`, `.21st/DESIGN.md` | The tokens and design constraints the `21st` CLI and its skills read. |

After changing tokens or components:
- `21st init --design-context --refresh` regenerates `.21st/` from `app/globals.css`, keeping the constraints;
- `21st review app components` checks the UI against them;
- `21st init --design-context --check` says whether it's still current.

The layout choices for Ask AI (ChatGPT-style) are recorded there as a constraint.

## Build, deploy and CI

| File | What to change there |
|---|---|
| `next.config.ts` | `cacheComponents` and `partialPrefetching` (on); `output: 'standalone'` when `NEXT_OUTPUT=standalone`; the PostHog `/ingest` rewrites. |
| `proxy.ts` | Which paths need a session cookie (`matcher`). API routes answer 401 themselves, so they're left out. |
| `vercel.json` | `git.deploymentEnabled`: only `main` deploys. Don't gate deploys on `VERCEL_ENV`: it's empty in the ignore step. |
| `Dockerfile` | Three stages: `tools` (seed and sync), `build`, `app` (the standalone server, as user `node`, with a health check). |
| `docker-compose.yml` | Services `mongo` (7.0), `setup` (seed and sync once), `app`, and `ml` behind the `ml` profile ([docker.md](docker.md)). |
| `docker-compose.splunk.yml` | The real-Splunk example: `splunk` (10.0, pinned), `splunk-setup`, `feeder`, `seed`, `app`, `connector` (the worker in live mode) and `mongo` ([splunk-example.md](splunk-example.md)). |
| `.devcontainer/devcontainer.json` | A GitHub Codespaces machine (x86, 4 cores, 16 GB) for the Splunk example, with Docker inside. |
| `.github/workflows/ci.yml` | Jobs "Lint, test and build" (required by the `main` ruleset; keep its name in sync), "ML (Python)" and "Docker". |
| `.github/workflows/splunk-example.yml` | "Splunk example" (not required): runs `docker-compose.splunk.yml` and checks the six reports arrive from Splunk. It runs when `lib/splunk/`, `worker/` or the example change, on Mondays, and by hand. |
| `eslint.config.mjs` | Next's Core Web Vitals and TypeScript rules, including the React Compiler's checks. |
| `tsconfig.json` | `@/*` maps to the repo root. |
| `package.json` | The scripts. Tests are `lib/**/*.test.ts`, run with `node --test` through `tsx`. |

## Developer tools

- **`.mcp.json`** gives Claude Code three MCP servers:
  - shadcn, to browse and add components;
  - AntV charts, which renders through AntV's public service, so don't send it real report data;
  - MongoDB, read-only.
- **`plugins/splunk-events/` and `.claude-plugin/`** are a Claude Code plugin. It bundles the Splunk Cloud MCP server and the `splunk-reports` skill, which `.claude/settings.json` turns on for this repo. Installing it: [README](../README.md#claude-code-tools).
- **`AGENTS.md` and `CLAUDE.md`** are notes for coding agents: read the Next.js 16 docs in `node_modules/next/dist/docs/` before writing code.
