# Configuration

Everything an engineer can set or change, where it lives, and what reads it:
- **Environment variables** come first, grouped by the program that reads them.
- **Settings in files** follow: the report cards, people and access, the sync and how often reports update, AI, statistics and ML, caching, look and feel, build and deploy, and developer tools.

How the pieces fit together: [architecture.md](architecture.md). What each file does: the [file reference](reference/README.md).

## Where settings live

| Where | Used by | Notes |
|---|---|---|
| `.env.local` (copy of `.env.example`) | `npm run dev`, `build`, `start`; the Node scripts (`sync`, `seed`, `test`, `eval:spl`, `splunk:setup`, `splunk:feed`), which load it with `--env-file-if-exists`; the ML job, through python-dotenv | Git ignores every `.env*` file except `.env.example`. Generate secrets with `openssl rand -base64 32`. Values already in the shell win. |
| The shell environment | Everything above, and Claude Code tools (`.mcp.json`, the plugin) | Claude Code reads its tools' settings from the shell, not from `.env.local`. |
| Vercel → Settings → Environment Variables | The hosted web app | Production only: PR branches don't deploy. New values apply to new deployments, so redeploy after a change. |
| A `.env` next to `docker-compose.yml` | `docker compose` | Every value has a default ([docker.md](docker.md)). |
| Your copy of `deploy/helm/splunk-events/values.yaml` | The Helm chart, on Kubernetes or OpenShift | Keep it with your platform's configuration, not in this repo. Secrets come from Kubernetes Secrets ([kubernetes.md](kubernetes.md)). |
| `.github/workflows/ci.yml` | CI | Placeholders only. The build never connects to the database, so GitHub holds no secrets. |
| `config/report-cards.yaml` | The sync worker and the scripts | How each report looks in the app: its category, who sees it, its chart, its headline numbers and when it warns. Data, not code ([adding-report-cards.md](adding-report-cards.md)). Change it in a PR. |
| `src/**/*.ts` and other code files | Everyone | Settings that are rules, not values: access, limits. Change them in a PR. |

**Build-time values.**
- The sign-in page is prerendered, so `DEMO_MODE` and `DEMO_PASSWORD` are read when the app is **built**. After changing them, rebuild or redeploy.
- `NEXT_PUBLIC_*` values are baked into the browser bundle at build time too.

## Environment variables

### Shared by several programs

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `MONGODB_URI` | none (required) | `src/database/mongodb.ts`, `src/people/auth-options.ts`, `ml/score.py` | The database, including its name, e.g. `mongodb://127.0.0.1:27017/splunkevents`. The web app gives up after 5 s if it doesn't answer; the worker waits the driver's 30 s. |
| `RUN_RETENTION_DAYS` | `90` | `src/database/reports/report-run.model.ts` | Days before MongoDB deletes a run (a TTL index on `runAt`). **Set it before the first sync**: the index is created once. The dummy runs have fixed dates, so demos use `3650`. |
| `REVALIDATE_SECRET` | none | `src/app/api/revalidate/route.ts`, `src/splunk/sync.ts`, `ml/score.py` | The shared secret for `POST /api/revalidate`, which the worker and the ML job call after writing. Without it, new data shows after at most a minute instead of at once. |
| `APP_URL` | none | `src/splunk/sync.ts`, `ml/score.py` | Where the worker and the ML job find the web app, for that refresh. |

### Web app

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | none (required) | `src/people/auth-options.ts` | Signs session cookies. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | none (required) | `src/people/auth-options.ts` | The site's own address. Sign-in only works from it, so set it to the URL people use (on Vercel, the production domain, not a per-deployment URL). |
| `DEMO_PASSWORD` | none | `src/app/login/page.tsx` (build time), `scripts/seed-demo-users.ts` | The demo accounts' shared password (8+ characters). Run `npm run seed` after changing it. |
| `DEMO_MODE` | off | `src/app/login/page.tsx` (build time), `src/ai/chats.ts`, `src/ai/config.ts`, `src/ai/components/AiChat.tsx`, `src/app/ai/history/page.tsx` | `true` lists the demo accounts with one-click sign-in **and shows the password**, deletes chats after 24 h, and adds the "demo accounts are shared" notes. **Dummy data only.** |
| `NEXT_PUBLIC_POSTHOG_KEY` | none | `src/instrumentation-client.ts` | Turns on PostHog (US cloud) through the `/ingest` proxy in `next.config.ts`. Without it, PostHog never loads and `track()` (`src/shared/analytics.ts`) does nothing. |
| `GEMINI_API_KEY` | none | `src/ai/llm.ts`, `scripts/eval-spl.ts` | Turns on AI answers. Free-tier keys are for dummy data only ([ai.md](ai.md#privacy-and-safety)). |
| `AI_MODEL` | `gemini-3.8-flash` | `src/ai/config.ts` | The answering model. `gemini-3.1-flash-lite` is cheaper. |
| `AI_EMBEDDING_MODEL` | `gemini-embedding-2` | `src/ai/config.ts` | The model that turns searches into vectors for Write SPL's examples. Changing it re-embeds the examples (the cache key includes the model). |
| `AI_PROVIDER` | `gemini` | `src/ai/config.ts`, `src/ai/llm.ts`, `scripts/eval-spl.ts` | `fake` gives canned answers with no key and no cost, for working on the pages and for tests. |
| `AI_ENABLED` | on | `src/ai/config.ts` | `false` turns AI answers off, even with a key. |
| `AI_DAILY_LIMIT` | `50` | `src/ai/config.ts` → `src/ai/usage.ts` | AI requests per account per UTC day. |
| `AI_SITE_DAILY_LIMIT` | `1000` | `src/ai/config.ts` → `src/ai/usage.ts` | AI requests per UTC day for everyone together, including briefings. |
| `AI_ALLOW_LIVE_DATA` | off | `src/ai/config.ts` | With `SPLUNK_MODE=live` data in the database, AI stays off until this is `true`. Set it only once sending report data to the provider is approved. |
| `SPLUNK_WEB_URL` | none | `src/ai/config.ts` → `src/ai/spl.ts` | Splunk Web's address (e.g. `https://splunk.example.com/en-US`), for **Open in Splunk** under Write SPL answers. |

### Sync worker

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `SYNC_STALE_HOURS` | `2` | `src/reports/dal.ts` (web app) | With live data, the home page warns when no sync has finished for this long. Keep it above how often you sync. |
| `SPLUNK_MODE` | `fixture` | `src/splunk/settings.ts` | `fixture` serves the 10 dummy reports from `src/splunk/fixtures/`. `live` calls Splunk's REST API. The mode is saved in `sync_state`, which is how the web app knows the data is live. |
| `SPLUNK_BASE_URL` | none | `src/splunk/settings.ts` | Required for `live`: the management port, usually `https://<host>:8089`. It must start with `https://` or `http://`; port 8000 (Splunk Web) gets a warning. |
| `SPLUNK_TOKEN` | none | `src/splunk/settings.ts` → `src/splunk/transport.ts` | Required for `live` (or `SPLUNK_TOKEN_FILE`): a service account's authentication token. **Only the worker's environment may hold it.** |
| `SPLUNK_TOKEN_FILE` | none | `src/splunk/settings.ts` → `src/splunk/transport.ts` (`splunkTokenFromEnv`) | Instead of `SPLUNK_TOKEN`: the path of a file holding the token, such as a mounted Docker or Kubernetes secret. `SPLUNK_TOKEN` wins when both are set. |
| `SPLUNK_TZ` | `UTC` | `src/splunk/settings.ts` | The search head's timezone, for the schedule text ("Every day at 06:00") and runs per week. It must be a time zone name the runtime knows, such as `America/New_York`. The sync saves it in `sync_state`, and the home page's "When searches run" chart uses it. |
| `SYNC_INTERVAL_MINUTES` | `15` | `src/splunk/settings.ts` | How often `npm run sync:watch` syncs: a number of minutes above 0 and at most 1440 (a day; longer overflows Node's timers). Keep it shorter than the shortest `dispatch.ttl`, or results expire before they're copied ([how often reports update](#how-often-reports-update)). |
| `SYNC_REPORTS` | `emailed` | `src/splunk/settings.ts` → `src/splunk/sync.ts` (`isSyncedSearch`) | Which scheduled searches become reports. `emailed`: every one that emails its results, plus every one with a card in `config/report-cards.yaml`. `configured`: only the ones with a card, for a Splunk with more emailed searches than the app should show. |
| `REPORT_CARDS_FILE` | `config/report-cards.yaml` | `src/reports/cards/load.ts` (`reportCardsPath`) | The report cards file, for a copy kept outside the repo, such as a file mounted into the worker's container. The sync reads it again whenever it changes. |
| `SYNC_MAX_ROWS` | `5000` | `src/splunk/sync.ts` | Result rows kept per run. Runs with more are stored cut off, marked `truncated`. |
| `NODE_EXTRA_CA_CERTS` | none | Node.js itself | A company CA certificate, for a search head with an internal certificate. Never turn certificate checks off instead. |

### The Splunk example

Only for `docker-compose.splunk.yml` and `npm run splunk:setup` / `splunk:feed` ([splunk-example.md](splunk-example.md)).

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `SPLUNK_GENERAL_TERMS` | none (required) | `docker-compose.splunk.yml` → Splunk's image | `--accept-sgt-current-at-splunk-com`, once you've read Splunk's General Terms. Splunk won't start without it. |
| `SPLUNK_PASSWORD` | `splunk-example-2026` | `docker-compose.splunk.yml` | The test Splunk's admin password. |
| `SPLUNK_ADMIN_URL` | `http://localhost:8089` | `scripts/splunk-example/admin.ts` | The test Splunk's management port, for the setup and the feeder. |
| `SPLUNK_ADMIN_USER`, `SPLUNK_ADMIN_PASSWORD` | `admin`, none | `scripts/splunk-example/admin.ts` | The test Splunk's admin. Only the setup and the feeder use it; the connector gets a token instead. |
| `SPLUNK_EXAMPLE_CRON` | `*/5 * * * *` | `scripts/splunk-example/setup.ts` | When the example's seven reports run. CI runs them every minute. |
| `SPLUNK_TOKEN_FILE` | `.splunk-example/token` | `scripts/splunk-example/setup.ts` | Where the setup writes the connector's token, which the connector then reads. |

### ML job

`ml/score.py` reads `MONGODB_URI` (required), `APP_URL` and `REVALIDATE_SECRET`. It takes them from the shell, or else from the repo's `.env.local`. Without the last two it still saves its scores, and the app shows them once its cache expires. Its setup and flags are in [ml/README.md](../ml/README.md).

### Build and hosting

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `NEXT_OUTPUT` | unset | `next.config.ts` | `standalone` builds Next's minimal server, as the `Dockerfile` does. Vercel builds without it. |
| `PORT` | `3000` | `docker compose` (host port), Next's server | The port the app listens on, or is published on. |
| `DEMO_MODE`, `DEMO_PASSWORD` | `true`, `splunk-demo-2026` in Docker | `Dockerfile` build arguments | Baked into the sign-in page when the image is built. |
| `NODE_ENV`, `NEXT_RUNTIME` | set by Next.js | `src/app/login/page.tsx`, `src/database/mongodb.ts`, `src/people/auth-options.ts`, `src/instrumentation-client.ts` | Not set by hand. In development, the sign-in page lists the demo accounts. Inside Next.js, database connections give up after 5 s. |

### Developer tools

| Variable | Read by | What it does |
|---|---|---|
| `MDB_MCP_CONNECTION_STRING` | `.mcp.json` | The database the read-only MongoDB MCP server looks at (default: local `splunkevents`). |
| `SPLUNK_MCP_URL`, `SPLUNK_MCP_CLIENT_ID` | `plugins/splunk-events/.mcp.json` | The Splunk Cloud MCP server's endpoint and OAuth client, for Claude Code. Export them in the shell, not `.env.local`. |
| `E2E_BASE_URL` | `playwright.config.ts` | The running app the browser tests (`npm run e2e`) open. Default `http://localhost:3000`. |
| `E2E_PASSWORD` | `e2e/auth.setup.ts` | The demo accounts' password for the browser tests. Default: `DEMO_PASSWORD`. |
| `E2E_SCREENSHOTS` | `e2e/reports.spec.ts` | A folder: the browser tests save a screenshot of each page they check there. CI keeps them from the Splunk example. |

## Report cards: `config/report-cards.yaml`

What Splunk doesn't know about each report, one entry (a **card**) per report, under the saved search's exact name. It's data, not code: [adding-report-cards.md](adding-report-cards.md) is the step-by-step guide, with every building block and examples.
- **Who reads it:** the sync worker (`src/reports/report-config.ts` loads it, and `src/reports/cards/` checks it and turns it into rules), `npm run card:preview` and `npm run splunk:check`. The web app only reads the results.
- **Checked as it's read:** a mistake stops the sync and the scripts with every problem listed ("Web Server 5xx Error Rate → warn → when: …").
- **Editors check it as you type:** through `config/report-cards.schema.json`, which `npm run cards:schema` writes from `src/reports/cards/schema.ts`. A test fails when it's out of date.

| Field | Required | What it does |
|---|---|---|
| `slug` | yes | The report's id in URLs (`/reports/<slug>`) and in AI answers (`[[slug]]`). Changing it starts a new report: the sync marks the old one `disabled`, and its stored runs stay under the old slug. |
| `category` | yes | One of `Security`, `Operations`, `Infrastructure`, `Business`, `Compliance`, `Other`. Drives the filter chips. |
| `tags` | no | Free words for search and "similar reports". |
| `groups` | no | Who may see it. **Without it, the email lists** in `action.email.to` decide (`secops@example.com` → `secops`). Copy them here before turning off a report's email action in Splunk, or the access goes with it. |
| `chart` | no | `none` shows only the table. Otherwise:<br>• `type`: `bar`, `column`, `line` or `area`. Overrides the chart saved in Splunk.<br>• `y`: the measure to plot (default: the first numeric column). Results over time (first column `_time`) with several measures draw a line for each instead, up to 5, with the smallest folded into "Other"; setting `y` keeps one measure.<br>• `threshold`: `{ value, label }`, a dashed limit line. Values past it take the warning color.<br>• `max`: turns bars into meters that fill up to it (100 for a percentage).<br>• `panels`: one small chart per measure.<br>• `scatter`: `{ x, log?, caption }`, adds a chart of dots placing `y` against `x`. |
| `index` | no | Overrides the index text parsed from the SPL, for searches like `| rest` or `metadata`. |
| `highlights` | no | The headline numbers: a `label`, a `value` (`first`, `sum`, `max`, `min`, `average`, `count: results`, `ratio` or `top` … `by`), and optionally `format`, `note` and `meter`. Without them, `defaultHighlights` in `src/splunk/map.ts` shows the results (with the change since the previous run), the chart's top row, and the search time. |
| `warn`, `fail` | no | When the report shows "Warning" or "Failed": a condition on a column (`above`, `below`, `atLeast`, `atMost`, `equals`) or on the result count, and a message with `{Column}` placeholders. `fail` is checked first. |
| `custom` | no | The name of a TypeScript rule in `src/reports/cards/custom.ts`, for what the rest can't say. |

**Adding a report:**
1. Add a card under the saved search's exact name. Copy an existing one: `Web Server 5xx Error Rate` has a warn rule, headline numbers and a limit line.
2. Run `npm run card:preview "<name>"`. It shows what the card will look like from the newest run, and flags any column name the results don't have.
3. In fixture mode, add the dummy report to `src/splunk/fixtures/reports.ts` as well. Use `example.com` addresses and documentation IP ranges only.
4. Run `npm run check`. `src/splunk/map.test.ts` runs the whole pipeline over the fixtures, and `src/reports/report-catalog.test.ts` asks for the report's section in [report-catalog.md](report-catalog.md).
5. Run `npm run sync`. Status, highlights and charts are worked out by the sync, so a change shows only after one. For the hosted demo, also sync Atlas after the deploy.

Worked examples, and how access works in practice: [report-access.md](report-access.md).

## People and access

| What | Where | How to change it |
|---|---|---|
| Demo accounts | `src/people/demo-users.ts` | Edit the list (email, name, `admin` or `viewer`, groups), then run `npm run seed`. Existing users get the current password and access. |
| Anyone's groups and role | `user_access` collection (one document per email) | Set them in MongoDB, or have sign-in write them (the SSO plan in [mongodb-and-access.md](mongodb-and-access.md)). Takes effect within 5 minutes (the viewer cache). |
| The access rule | `src/people/access.ts` (`canView`) | One function, tested in `src/people/access.test.ts`. Admins see everything; others need a shared group. |
| Which auth endpoints are served | `src/app/api/auth/[...all]/route.ts` | Only sign-in, sign-out and session lookups. Add paths here when a feature needs them, such as SSO's `/sign-in/social` and `/callback/<provider>`. |
| Where to go after sign-in | `src/people/next-path.ts` | Only paths on this site. |

## The sync

Settings in `src/splunk/sync.ts`:

| Constant | Value | What it does |
|---|---|---|
| `HISTORY_LOOKBACK` | 50 | How many of each report's newest jobs to ask Splunk about. |
| `HISTORY_SIZE` | 7 | Runs kept on each report document, for the run dots, the history table and the AI context. |
| `MAX_ROWS` | `SYNC_MAX_ROWS` or 5000 | Result rows stored per run. |
| `SECOND_REFRESH_MS` | 3000 | The gap between the two cache refreshes after a sync. |

Splunk REST calls retry on 429 and 5xx, with backoff of about 0.5, 1 and 2 s (`src/splunk/transport.ts`). To connect real Splunk, follow [connecting-live-splunk.md](connecting-live-splunk.md).

## How often reports update

Three schedules decide how fresh a report is in the app:

| What | Who sets it | Where |
|---|---|---|
| **When Splunk runs the report** | The report's owner | In Splunk: **Settings → Searches, reports, and alerts → Edit Schedule**. In the Splunk example: `SPLUNK_EXAMPLE_CRON` (such as `0 * * * *`, every hour), then `npm run splunk:setup` again. |
| **How often the app copies new runs** | Whoever runs the sync | `SYNC_INTERVAL_MINUTES` for `npm run sync:watch` and Docker (`60` is every hour). On Kubernetes or OpenShift: `connector.schedule` in the Helm values, such as `"0 * * * *"` ([kubernetes.md](kubernetes.md)). |
| **How often an open page refreshes** | Fixed | Every minute (`EVERY_MS` in `src/shared/components/AutoRefresh.tsx`). It's cheap: it reads the app's cache, never Splunk. |

**The rule:** copy at least as often as Splunk keeps a run's results. By default that's two schedule periods (`dispatch.ttl`), so an hourly report keeps its results for about 2 hours.
- **Hourly reports, hourly sync:** fine, and a good start.
- **A sync slower than the reports' period:** you see fewer runs, and a sync slower than two periods misses results: those runs are stored without rows.
- **A sync much faster than the reports:** harmless. A sync with nothing new adds nothing, but each one still asks Splunk for every report's history.

The home page warns when no sync has finished for `SYNC_STALE_HOURS` (default 2). Keep it above the sync interval.

## Ask AI

Besides the environment variables above, these live in code:

| Setting | Where | Value | What it does |
|---|---|---|---|
| Prompts | `src/ai/prompts.ts` | `REPORTS_PROMPT`, `SPL_PROMPT`, `REPORT_SUMMARY_PROMPT`, `BRIEFING_PROMPT` | What the AI is told, in plain English. **Bump `PROMPT_VERSION`** after changing the summary or briefing prompts, so saved summaries are rewritten. |
| Rows per report | `src/ai/context.ts` | `MAX_ROWS = 20` | Result rows of each report the AI sees. More rows cost more tokens. |
| Answer cap | `src/ai/llm.ts` | `MAX_OUTPUT_TOKENS = 8192` | Caps each answer, thinking included, and with it what one question can cost. |
| Thinking | the AI routes | `low` (chat, summaries), `medium` (Write SPL) | More is slower and costs more. |
| Embedding size | `src/ai/llm.ts` | `EMBEDDING_DIMENSIONS = 768` | The vector size. Part of each vector's cache key. |
| Examples per request | `src/ai/spl-examples.ts` | `SIMILAR_EXAMPLES = 5`, `MAX_SAVED = 500` | How many example searches go into a Write SPL prompt, and how many saved ones are considered. |
| Messages per chat | `src/database/ai/chat.model.ts` | `MAX_CHAT_MESSAGES = 100` | 50 questions and answers; then start a new chat. |
| Demo chat lifetime | `src/ai/chats.ts` | `DEMO_CHAT_HOURS = 24` | With `DEMO_MODE`, chats expire after this. |
| Question length | `src/ai/components/ChatView.tsx` | `MAX_QUESTION = 2000` | Characters per question. |
| Route time limit | `src/app/api/ai/*/route.ts` | `maxDuration = 60` | Seconds a serverless function may run on Vercel. |

**Using another AI.** Rewrite `src/ai/llm.ts` and keep the inputs and outputs of `streamText`, `generateJson` and `embed`. Steps for Vertex AI or a company's own LLM are in [ai.md](ai.md#using-another-ai).

**Measuring a change.** `npm run eval:spl` runs Write SPL over `scripts/spl-eval-set.json` with a real key. Run it before and after changing a prompt, the examples or the model.

## Statistics and the ML job

| Setting | Where | Value | What it does |
|---|---|---|---|
| Earlier runs needed | `src/reports/insights.ts` | `MIN_BASELINE = 4` | A run is compared only with at least this many earlier successful runs. |
| Unusual threshold | `src/reports/insights.ts` | `UNUSUAL_SCORE = 3.5` | How many robust spreads (MAD) from the median count as unusual. |
| The same rules in Python | `ml/features.py` | must match | `test_robust_z_matches_the_app` checks they agree. Change both together. |
| Share of runs the forest flags | `ml/score.py` | `CONTAMINATION = 0.05` | About 3 of the demo's 64 runs. |
| Votes before learning | `ml/score.py` | `MIN_VOTES = 20` | The flag model waits for this many votes, with at least one 👍 and one 👎. |
| Days on the home page | `src/reports/dal.ts` | `getRunOutcomes(days = 7)`, `getRunHealth(days = 7)` | The days in "Scheduled runs per day" and the run health grid. Change both together, so they match. |
| Reports in the grid before "Show more" | `src/reports/overview/RunHealthGrid.tsx` | `VISIBLE_ROWS = 10` | The rest sit behind a "Show N more reports" toggle. |
| Scheduler chart slots | `src/reports/schedule-load.ts` | `slotMinutes = 5` | The chart's step width. Each slot shows the most searches at once on its busiest day of the reference month. |
| Names and times listed | `src/reports/overview/SchedulerLoad.tsx` | `MAX_NAMES = 5`, `MAX_TIMES = 8` | Past these, the busiest-times lines and the tooltip end with "and N more". |

Run the job with `npm run ml` (or `ml:plot` for a chart) after a sync. Its Python setup: [ml/README.md](../ml/README.md).

## Caching, refresh and timeouts

| Setting | Where | Value | What it does |
|---|---|---|---|
| Report cache | `src/reports/dal.ts` | `cacheLife('minutes')`, tag `reports` | Up to a minute on the server, cleared at once by `/api/revalidate`. |
| Viewer cache | `src/reports/dal.ts` | `'use cache: private'` + `cacheLife('minutes')` | 5 minutes in the person's browser. |
| Auto refresh | `src/shared/components/AutoRefresh.tsx` | `EVERY_MS = 60_000` | Open pages re-render once a minute, except Ask AI and the sign-in page. |
| Database timeout (web app) | `src/database/mongodb.ts`, `src/people/auth-options.ts` | 5 s | Pages show "Couldn't load this page" instead of hanging. |

Uncached reads (chats, votes) must start with `await connection()` inside `<Suspense>`. Why, and what each loading or error screen means: [caching-and-loading.md](caching-and-loading.md).

## Look and feel

| What | Where | Notes |
|---|---|---|
| Colors, radius, the navbar's height | `:root` in `src/app/globals.css` | `--background`, `--primary`, `--color-dark-100` and `--color-dark-200` (surfaces), `--color-light-100` and `--color-light-200` (text), `--header-height` (what sticks under the navbar). |
| Chart colors | `--chart-1` … `--chart-5` in `src/app/globals.css` | Validated for the dark surface (contrast, color-blind distance). Re-check if you change them. |
| Status colors | `--status-success`, `--status-warning`, `--status-failed` | Only for run outcomes, never as series colors. |
| Chart styling | `src/shared/chart-theme.ts` | Axes, gridlines, tooltip, bar size, threshold line. |
| Chart limits | `src/reports/reports.ts` | `MAX_CHART_BARS` (25), `MAX_CHART_POINTS` (500), `MAX_CHART_SERIES` (5). Charts say what they leave out, and the results table has every row. |
| Table page size | `src/reports/components/ResultsTable.tsx` | `PAGE_SIZE` (50). Filtering and sorting cover every row. |
| Stale-data warning | `src/reports/reports.ts` | 2 hours by default (`SYNC_STALE_HOURS`). Live data only. |
| Typefaces | `src/app/fonts.ts` | Schibsted Grotesk (headings) and Martian Mono (code), from `src/app/font-files/`, so a build needs no access to Google Fonts. Body text uses the system font. |
| Component styles | `src/app/globals.css`, grouped by area | Plain CSS with Tailwind 4's `@apply`, in `@layer components`. |
| shadcn/ui | `components.json` | Used for the chart wrapper in `src/shared/ui/`. `npx shadcn add <item>` adds more. |
| Background rays | `src/app/layout.tsx` (`<LightRays>` props) | Color, speed and spread of the WebGL background. |
| The 21st design context | `.21st/design.json`, `.21st/DESIGN.md` | The tokens and design constraints the `21st` CLI and its skills read. |

After changing tokens or components:
- `21st init --design-context --refresh` regenerates `.21st/` from `src/app/globals.css`, keeping the constraints;
- `21st review app components` checks the UI against them;
- `21st init --design-context --check` says whether it's still current.

The layout choices for Ask AI (ChatGPT-style) are recorded there as a constraint.

## Build, deploy and CI

| File | What to change there |
|---|---|
| `next.config.ts` | `cacheComponents` and `partialPrefetching` (on); `output: 'standalone'` when `NEXT_OUTPUT=standalone`; the PostHog `/ingest` rewrites. |
| `src/proxy.ts` | Which paths need a session cookie (`matcher`). API routes answer 401 themselves, so they're left out. |
| `vercel.json` | `git.deploymentEnabled`: only `main` deploys. Don't gate deploys on `VERCEL_ENV`: it's empty in the ignore step. |
| `Dockerfile` | Stages:<br>• `tools`: seed and sync, as root, for docker compose;<br>• `build`;<br>• `worker`: the same scripts as user 1000, for Kubernetes;<br>• `app`: the standalone server as user 1000, its files writable by group 0 for OpenShift, with a health check.<br>A plain `docker build` builds `app`. |
| `docker-compose.yml` | Services `mongo` (7.0), `setup` (seed and sync once), `app`, and `ml` behind the `ml` profile. `ml` runs as root, so `--plot` can write `ml/out` ([docker.md](docker.md)). |
| `docker-compose.splunk.yml` | The real-Splunk example: `splunk` (10.0, pinned), `splunk-setup`, `feeder`, `seed`, `app`, `connector` (the worker in live mode) and `mongo` ([splunk-example.md](splunk-example.md)). |
| `.devcontainer/devcontainer.json` | A GitHub Codespaces machine (x86, 4 cores, 16 GB) for the Splunk example, with Docker and an SSH server inside (`gh codespace ssh`). |
| `deploy/helm/splunk-events/` | The Helm chart:<br>• the web Deployment, Service, and Route or Ingress;<br>• the connector and ML CronJobs;<br>• the demo-accounts Job, and the Secret.<br>`values.yaml` documents every value ([kubernetes.md](kubernetes.md)). |
| `.github/workflows/ci.yml` | Jobs "Lint, test and build" (required by the `main` ruleset; keep its name in sync), "ML (Python)" and "Docker". |
| `.github/workflows/splunk-example.yml` | "Splunk example" (not required): runs `docker-compose.splunk.yml` and checks the seven reports arrive from Splunk, that `npm run splunk:check` passes, and runs the browser tests, keeping their screenshots. It runs when `src/splunk/`, `worker/`, the app or the example change, on Mondays, and by hand. |
| `.github/workflows/helm.yml` | "Helm" (not required). It lints and renders the chart, then installs it on a throwaway kind cluster and runs the connector and the ML job once. It runs when the chart or the images change. |
| `eslint.config.mjs` | Next's Core Web Vitals and TypeScript rules, including the React Compiler's checks, plus typescript-eslint's `strictTypeChecked` rules for `.ts`/`.tsx` (not shadcn's `src/shared/ui/`). Turned off, with the reason next to each: `no-confusing-void-expression` (style) and `require-await` (Next.js needs some functions async). Tests may use `!`. |
| `tsconfig.json` | `@/*` maps to the repo root. `strict`, plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noUnusedLocals` and `noUnusedParameters`. |
| `package.json` | The scripts. Tests are `lib/**/*.test.ts`, run with `node --test` through `tsx`. |

## Developer tools

- **`.mcp.json`** gives Claude Code three MCP servers:
  - shadcn, to browse and add components;
  - AntV charts, which renders through AntV's public service, so don't send it real report data;
  - MongoDB, read-only.
- **`plugins/splunk-events/` and `.claude-plugin/`** are a Claude Code plugin. It bundles the Splunk Cloud MCP server and the `splunk-reports` skill, which `.claude/settings.json` turns on for this repo. Installing it: [README](../README.md#claude-code-tools).
- **`AGENTS.md` and `CLAUDE.md`** are notes for coding agents: read the Next.js 16 docs in `node_modules/next/dist/docs/` before writing code, and follow [adding-report-cards.md](adding-report-cards.md) for report cards. `.github/copilot-instructions.md` says the same for GitHub Copilot and assistants like it.
