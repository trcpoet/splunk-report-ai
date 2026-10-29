# Codebase guide

What every part of SplunkEvents does, how the pieces are wired together, and what to know before you change them.

Read **The big picture** and **How it fits together** first. Then use **File by file** as a map of the folder you're working in. **Before you change things** lists the rules that are easy to break, and **Glossary** explains the words the code uses.

## The big picture

SplunkEvents shows Splunk scheduled reports, the ones teams used to receive by email, in a web app. Each team sees only its own reports. The app adds:
- plain statistics;
- an AI assistant;
- a machine-learning job.

Three programs share one MongoDB database:

```
Splunk REST API (:8089)  ─┐
  or the dummy fixtures   ├─► sync worker ──────────────► MongoDB ◄────── ML job (Python)
                          │   worker/sync.ts             ▲   │          ml/score.py
                          │                              │   │          reads runs and votes,
                          │   POST /api/revalidate ──┐   │   │          writes scores
                          │   (after each sync)      │   │   ▼
                          │                          ▼   │  lib/dal.ts: cached reads,
                          │                     Next.js web app       checks who is asking
                          │                     ├─ pages: home, reports, Ask AI, sign-in
                          │                     ├─ JSON API: /api/reports, /api/reports/[slug]
                          │                     └─ AI routes: /api/ai/* ─► lib/ai/llm.ts ─► Google Gemini
```

- **The sync worker** copies reports and their runs from Splunk (or the dummy data) into MongoDB. It only reads runs Splunk's scheduler already made; it never starts a search.
- **The web app** never talks to Splunk. It reads MongoDB through one file, `lib/dal.ts`, which also decides who sees what.
- **The ML job** is optional. It reads the runs and the "Worth flagging?" votes, and writes scores back for the app to show.
- **AI** is optional. Without a `GEMINI_API_KEY`, everything except AI answers works.

## How it fits together

### 1. Report data: from Splunk to the screen

1. **Start.** `npm run sync` runs `worker/sync.ts`. It picks a transport:
   - `lib/splunk/transport.ts`: the live Splunk REST API, with a service-account token;
   - `lib/splunk/fixtures/transport.ts`: the same REST paths, answered from the dummy reports in `lib/splunk/fixtures/reports.ts`.
2. **Copy new runs.** `lib/splunk/sync.ts`:
   - lists the scheduled saved searches;
   - keeps the ones listed in `lib/report-config.ts`, or that email their results;
   - fetches only the runs it hasn't stored yet (by sid), and writes them to `report_runs`.
3. **Turn Splunk's JSON into the app's models.** `lib/splunk/map.ts` works out the schedule text from the cron line, the status (running the report's status rule from `lib/report-config.ts`), the chart and the highlights.
4. **Update the reports.** The sync recomputes each document in `reports`: its latest run, last 7 runs, highlights and chart. It records the time in `sync_state`, then calls `POST /api/revalidate` twice, 3 seconds apart.
5. **Read in the app.** `lib/dal.ts` loads every report into a server cache (`'use cache'`, tag `reports`). It filters them for whoever is asking, and loads each report's result rows only when a page needs them.

### 2. Who sees what

1. **Sign-in** is Better Auth with email and password (`lib/auth.ts`, `lib/auth-options.ts`).
   - Sign-up is off. Accounts come from `npm run seed` (`scripts/seed-demo-users.ts`, `lib/demo-users.ts`).
2. **`proxy.ts`** sends visitors without a session cookie to `/login`. It's a quick redirect, not the security check.
3. **`getViewer()`** in `lib/dal.ts` reads the session and the person's groups from `user_access`. The result is cached in that person's browser only (`'use cache: private'`).
4. **`canView()`** in `lib/access.ts` is the one access rule:
   - an admin sees every report;
   - anyone else sees a report when one of their groups is in its `allowedGroups`. Those come from the report's `groups` in `lib/report-config.ts`, or else from its email recipients.
5. **A hidden report looks missing.** A report someone may not see answers exactly like a report that doesn't exist (404, "Report not found"), so its name doesn't leak.

### 3. A page request

1. `app/layout.tsx` draws the navbar and the background, then the page.
2. Content that needs data sits inside `<Reveal fallback={…}>` (`components/Transitions.tsx`), which is `<Suspense>` with a short crossfade.
   - The fallback is a skeleton from `components/Skeletons.tsx`, the same size as the content, so nothing jumps.
3. Server components (the default) read data through `lib/dal.ts`. Components marked `'use client'` handle clicks, typing and streaming.
4. **Keeping pages current:**
   - Next keeps the last pages you visited, hidden, so Back is instant.
   - `components/AutoRefresh.tsx` refreshes open pages once a minute, except the Ask AI pages.
5. **When something fails:**
   - `app/error.tsx` handles a failed page;
   - `app/global-error.tsx` handles a failed layout;
   - `app/not-found.tsx` handles an unknown address.

### 4. Ask AI

1. **The page.** `app/ai/reports` and `app/ai/spl` render `components/AiChat.tsx`, a server component that loads the open chat, its votes and suggested questions. It passes them to `components/ChatView.tsx`, the client side of the conversation.
2. **The request.** Asking posts to `/api/ai/chat` (Ask about reports) or `/api/ai/spl` (Write SPL). Both routes first run `prepareTurn()` from `lib/ai/turn.ts`, which checks, in order:
   - signed in;
   - a valid question;
   - AI turned on (`lib/ai/config.ts`);
   - the chat is the person's own and has room;
   - today's limit (`lib/ai/usage.ts`).
3. **What the AI is told.** `lib/ai/context.ts` writes the person's visible reports as text: status, highlights, runs, SPL and up to 20 rows each. `lib/ai/prompts.ts` adds the instructions.
4. **The AI call.** `lib/ai/llm.ts` is the only file that calls the AI: Gemini through `@google/genai`, or canned answers with `AI_PROVIDER=fake`.
5. **The answer:**
   - **Ask about reports:** streams back line by line as NDJSON (`lib/ai/stream.ts`). Reports named as `[[slug]]` become links (`lib/ai/report-links.ts`).
   - **Write SPL:** returns checked JSON, with the steps, a safety check and the time range (`lib/ai/spl.ts`). The app never runs the search.
6. **Saving.** `lib/chats.ts` saves each question with its answer.
   - The History tab lists chats (`components/ChatHistory.tsx`).
   - Rename and delete are Server Actions in `app/ai/actions.ts`.

### 5. Briefing, Explain and votes

- **The briefing** (`components/Briefing.tsx`, a server component) lists reports that warn or fail, and newest runs that stand out. Those are found by `lib/insights.ts` (median and MAD statistics) or flagged by the ML job.
- **The AI summaries.** "In short" (`components/BriefingSummary.tsx`) and the Explain panel (`components/ExplainButton.tsx`) stream summaries from `/api/ai/briefing` and `/api/ai/explain/[slug]`. Both use `components/useSummary.ts`.
  - `lib/ai/summaries.ts` saves each summary under a key from `lib/ai/keys.ts`. It's written once, shared by everyone the key applies to, and counted toward the daily limits once.
- **Votes.** 👍 / 👎 go through `voteAction` (`app/ai/actions.ts`) to `lib/feedback.ts`. It works out from the server's own data what was voted on, so a page can't vote on something it wasn't shown.

### 6. The ML job

- **The job.** `ml/score.py`:
  - reads `report_runs` and the flag votes;
  - scores every run with an Isolation Forest, using features from `ml/features.py`;
  - once there are 20 votes of both kinds, learns which flags matter with a logistic regression;
  - writes `ml_run_scores` and `ml_report_scores`, then refreshes the app.
- **In the app.** `lib/dal.ts` attaches each report's newest-run score (`modelRun`) and the learned `attention`. The briefing, Explain and the AI context all use them. See [ml.md](ml.md).

### 7. Shipping

- **Repository:** `trcpoet/splunk-report-ai` on GitHub. `main` changes only through pull requests with green CI.
- **CI** (`.github/workflows/ci.yml`) has three jobs:
  - "Lint, test and build", which branch protection requires;
  - "ML (Python)";
  - "Docker".
- **Vercel** deploys `main` only (`vercel.json`). The hosted demo's database is MongoDB Atlas. After a merge that changes the dummy data, sync Atlas ([docs/mongodb-and-access.md](mongodb-and-access.md)).
- **Docker:** `docker compose up --build` runs everything locally ([docker.md](docker.md)).

## File by file

### Root of the repo

| File | What it does |
|---|---|
| `package.json` | Packages and scripts: `dev`, `build`, `start`, `lint`, `test`, `sync`, `sync:watch`, `seed`, `ml`, `ml:plot`, `test:ml`. |
| `next.config.ts` | Next.js settings: Cache Components and partial prefetching on, the PostHog proxy, and standalone output for Docker builds. |
| `proxy.ts` | Redirects visitors without a session cookie to `/login`. This is Next 16's name for middleware. |
| `instrumentation-client.ts` | Starts PostHog in the browser, only when `NEXT_PUBLIC_POSTHOG_KEY` is set. |
| `tsconfig.json` | TypeScript settings. `@/` means the repo root, so imports read `@/lib/dal`. |
| `eslint.config.mjs` | ESLint with Next's rules and the React Compiler's checks. Skips build output and `ml/.venv`. |
| `postcss.config.mjs` | Tailwind CSS 4 through PostCSS. |
| `components.json` | shadcn/ui settings, used by `components/ui/`. |
| `react-canary.d.ts` | Types for React's `<ViewTransition>`. |
| `vercel.json` | Deploys `main` only. Other branches get no deployment. |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | The Docker setup ([docker.md](docker.md)). |
| `.env.example` | Every setting, explained. Copy it to `.env.local`, which git ignores. |
| `.github/workflows/ci.yml` | CI: lint, tests and build; Python tests; Docker. |
| `README.md` | What the app is, how to run it, the scripts, and hosting. |
| `AGENTS.md`, `CLAUDE.md` | Notes for AI coding agents. Most importantly: this Next.js version differs from older ones, so read its bundled docs in `node_modules/next/dist/docs/`. |
| `.mcp.json` | Tools for Claude Code in this repo: the shadcn and chart servers, and read-only MongoDB. |
| `.claude/`, `.claude-plugin/`, `plugins/splunk-events/` | Claude Code tooling: the `splunk-reports` skill, and an optional Splunk Cloud MCP server, which needs `SPLUNK_MCP_URL`. |

### `app/`: pages and API routes

| File | What it does |
|---|---|
| `layout.tsx` | The root layout: fonts, navbar, background light rays, automatic refresh, and the Back/Forward reload script for signed-out tabs. |
| `page.tsx` | Home: headline numbers, "Data as of", the briefing, runs per day, and the report list. |
| `login/page.tsx` | Sign-in. In `DEMO_MODE` it lists the demo accounts with one-click sign-in. It's built ahead of time, so `DEMO_MODE` and `DEMO_PASSWORD` are read at build time. |
| `reports/[slug]/page.tsx` | One report: status, highlights, charts, the results table, SPL, the results trend, run history and Explain. |
| `reports/[slug]/not-found.tsx` | "Report not found", for missing and hidden reports alike. |
| `ai/layout.tsx` | The Ask AI heading and its three tabs. |
| `ai/page.tsx` | `/ai` redirects to `/ai/reports`. |
| `ai/reports/page.tsx`, `ai/spl/page.tsx` | The two chat tabs: `AiChat` with `kind` set to `reports` or `spl`. |
| `ai/history/page.tsx` | Every saved chat. |
| `ai/actions.ts` | Server Actions: rename a chat, delete a chat, vote. Each checks its input. |
| `api/reports/route.ts`, `api/reports/[slug]/route.ts` | The JSON API: 401 when signed out, 404 for missing or hidden reports. |
| `api/revalidate/route.ts` | Drops the cached report data. Needs `REVALIDATE_SECRET`. |
| `api/auth/[...all]/route.ts` | Better Auth: sign-in, sign-out and session lookups only. |
| `api/ai/chat/route.ts` | Ask about reports: a streamed answer. |
| `api/ai/spl/route.ts` | Write SPL: a JSON answer with the steps and the safety check. |
| `api/ai/briefing/route.ts`, `api/ai/explain/[slug]/route.ts` | Streamed summaries, written once and saved. |
| `error.tsx`, `global-error.tsx`, `not-found.tsx` | The error and not-found screens. |
| `fonts.ts` | The two typefaces. |
| `globals.css` | Design tokens (colors, chart colors, status colors) and the styles of every component, grouped by area. |

### `components/`

| File | What it does |
|---|---|
| `Navbar.tsx`, `NavLinks.tsx`, `UserMenu.tsx`, `SignOutButton.tsx` | The top bar: links (with the Ask AI pill), the signed-in user and sign-out. |
| `LoginForm.tsx` | The sign-in form, with one-click demo accounts in `DEMO_MODE`. |
| `AutoRefresh.tsx` | Refreshes open pages once a minute (not on Ask AI). |
| `Transitions.tsx` | `PageTransition`, `Reveal` (Suspense with a crossfade) and `PAGE_TRANSITION`. |
| `Skeletons.tsx` | Loading placeholders, the same size as what they stand for. |
| `ExploreBtn.tsx` | "Explore reports" on the home page: scrolls down to the list. |
| `LightRays.tsx` | The animated background (WebGL, through `ogl`). |
| `ReportBrowser.tsx`, `ReportCard.tsx` | The report list with search and filters, and one card. A card prefetches its report, and has an Explain button. |
| `StatusBadge.tsx` | A status label with its dot. |
| `ReportChart.tsx`, `ReportScatter.tsx`, `RunOutcomes.tsx`, `RunTrend.tsx`, `Sparkline.tsx`, `Meter.tsx` | Charts: the results chart, the scatter, runs per day, results per run, the small trend lines, and limit meters. |
| `ChartBoundary.tsx` | Keeps a chart that can't be drawn from breaking the page. |
| `ui/chart.tsx` | shadcn's wrapper around Recharts. |
| `ResultsTable.tsx` | The sortable, filterable results table (TanStack Table). |
| `RunHistory.tsx` | The run history table on a report page. |
| `ReportActions.tsx` | Download CSV and Copy SPL. |
| `CopyButton.tsx` | A button that copies text and says so. |
| `Briefing.tsx`, `BriefingSummary.tsx`, `useSummary.ts` | The briefing, its AI "In short", and the hook that streams a summary. |
| `ExplainButton.tsx` | The Explain button and its side panel: AI summary, "At a glance" statistics, and links into Ask AI. |
| `FeedbackButtons.tsx` | 👍 / 👎 for answers, summaries and briefing flags. |
| `AiChat.tsx`, `AiTabs.tsx` | Ask AI: one tab's server part (chat, votes, side panel), and the tab bar. |
| `ChatView.tsx` | The conversation: messages, the box to type in, streaming, Stop and Retry. |
| `ChatAnswer.tsx` | An answer as Markdown, with report chips. |
| `SplAnswer.tsx` | A Write SPL answer: the numbered steps, the full query, safety warnings, and Open in Splunk. |
| `ChatHistory.tsx` | The History tab: filter, search, rename and delete. |

### `lib/`: logic shared by pages, routes, the worker and tests

| File | What it does |
|---|---|
| `dal.ts` | **The data access layer.** Every page and API route reads report data here. It caches reports for all viewers and filters them for the one asking. |
| `access.ts` | `canView()`: the access rule. Pure, and tested. |
| `auth.ts`, `auth-options.ts`, `auth-client.ts` | Better Auth on the server, its settings (shared with the seed script), and in the browser. |
| `session-sync.ts` | Signing in or out in one tab reloads the other tabs. |
| `next-path.ts` | Where to go after signing in. Only paths on this site. |
| `mongodb.ts` | The one MongoDB connection, shared by the app, the worker and the scripts. It gives up after 5 seconds in the web app. |
| `reports.ts` | Report types and pure helpers (stats, summaries, categories, similar reports). |
| `report-config.ts` | What Splunk doesn't know about each report: slug, category, tags, groups, chart, status rule and highlights. |
| `insights.ts` | Unusual runs (median and MAD), the results profile behind "At a glance", and the sparkline data. Pure. |
| `format.ts` | Dates and numbers, always in UTC, so the server and the browser print the same text. |
| `chats.ts` | Saved chats. Every function checks the owner, and page reads start with `connection()`. |
| `feedback.ts` | Votes. Works out and checks what a vote is about. |
| `demo-users.ts` | The demo accounts and their groups. |
| `chart-theme.ts` | Shared chart styling. |
| `analytics.ts` | `track()` for PostHog. Does nothing without a key. |
| `utils.ts` | `cn()` for joining CSS class names (shadcn). |
| `ai/config.ts` | Whether AI answers are on, and why not; the model and the limits. |
| `ai/llm.ts` | **The only file that calls the AI:** `streamText`, `generateJson`, and the fake provider. To use another AI, rewrite this file. |
| `ai/prompts.ts` | The instructions, in plain English, with `PROMPT_VERSION`. |
| `ai/context.ts` | The reports as text for the AI: only visible reports, in a fixed order, with data cleaned. |
| `ai/turn.ts` | The checks before every chat answer. |
| `ai/usage.ts` | Daily limits, per account and site-wide. |
| `ai/stream.ts` | The NDJSON events between the routes and the browser. |
| `ai/spl.ts` | The Write SPL answer format, how its steps become a query, and the safety check. |
| `ai/report-links.ts` | `[[slug]]` in an answer becomes a link to that report. |
| `ai/suggestions.ts` | Starter questions built from the person's own reports. |
| `ai/summaries.ts` | Writes, saves and shares Explain summaries and briefings. |
| `ai/keys.ts` | Cache keys for summaries, and ids for briefing flags. |
| `splunk/sync.ts` | The sync: reports, new runs, derived fields, and the app refresh. |
| `splunk/transport.ts` | Calls the Splunk REST API, with retries. |
| `splunk/map.ts` | Splunk JSON to app models. Pure, and tested. |
| `splunk/types.ts` | The Splunk REST fields the sync reads. |
| `splunk/fixtures/reports.ts`, `splunk/fixtures/transport.ts` | The 9 dummy reports, and a fake Splunk that serves them. |
| `*.test.ts` | Unit tests next to the code they test, run with `npm test` (`node:test` through `tsx`). |

### `database/`: Mongoose models, one per collection

| File | Collection | Holds |
|---|---|---|
| `report.model.ts` | `reports` | One per scheduled report, with its latest run, last 7 runs, highlights and chart. |
| `report-run.model.ts` | `report_runs` | One per run (by sid), with its result rows. Deleted after `RUN_RETENTION_DAYS`. |
| `sync-state.model.ts` | `sync_state` | When the last sync finished, for "Data as of". |
| `user-access.model.ts` | `user_access` | Each person's groups, and whether they're an admin. |
| `chat.model.ts` | `chats` | Saved Ask AI chats, at most 100 messages each. |
| `ai-usage.model.ts` | `ai_usage` | Requests and tokens per account per day. Kept 7 days. |
| `ai-summary.model.ts` | `ai_summaries` | Saved Explain summaries and briefings. Kept 30 days. |
| `ai-feedback.model.ts` | `ai_feedback` | 👍 / 👎, which are the ML job's labels. |
| `ml-score.model.ts` | `ml_run_scores`, `ml_report_scores` | The ML job's output. |
| `index.ts` | | Exports every model. |

Better Auth keeps its own `user`, `session`, `account` and `verification` collections.

### Other folders

| Path | What it does |
|---|---|
| `worker/sync.ts` | The sync worker's entry point: `npm run sync` (once) and `npm run sync:watch` (every `SYNC_INTERVAL_MINUTES`). Only it holds `SPLUNK_TOKEN`. |
| `scripts/seed-demo-users.ts` | `npm run seed`: creates the demo users and their access. Safe to run again. |
| `ml/` | The Python ML job: `score.py`, `features.py`, `tests/`, `requirements.txt`, `Dockerfile` ([ml/README.md](../ml/README.md)). |
| `public/` | Icons and images. |
| `docs/` | Plain-language guides: [ai.md](ai.md), [ml.md](ml.md), [caching-and-loading.md](caching-and-loading.md), [mongodb-and-access.md](mongodb-and-access.md), [report-access.md](report-access.md), [connecting-live-splunk.md](connecting-live-splunk.md), [docker.md](docker.md), and this guide. |

## Before you change things

**This Next.js is version 16, with Cache Components.** Read the guide for what you touch in `node_modules/next/dist/docs/`; much differs from older versions.
- **Cached data:** use `'use cache'` with `cacheTag('reports')`, as in `lib/dal.ts`. The sync clears it through `/api/revalidate`.
- **Uncached data:** it must sit inside `<Suspense>` or `<Reveal>`.
- **Uncached MongoDB reads in a page** must start with `await connection()`. Otherwise `next dev` reports "unstable value `Date.now()` while prerendering" ([caching-and-loading.md](caching-and-loading.md)).
- **Per-person data** uses `'use cache: private'`, which is cached in that person's browser only.
- **Middleware** is called `proxy.ts`.

**Next keeps the pages you visited, hidden.** So:
- give elements unique ids with `useId()`, not fixed ones;
- clean up in effects (a hidden page runs its cleanup);
- close dialogs when a page hides.

**The React Compiler's lint rules are on.** No `setState` directly in an effect's body, no `Date.now()` or `Math.random()` while rendering, and no changing props or captured variables.

**Access.**
- Read report data only through `lib/dal.ts`, and chats and votes only through `lib/chats.ts` and `lib/feedback.ts`. All of them check who is asking.
- Never return `allowedGroups` from an API.
- Hidden must look the same as missing.

**Secrets.**
- `.env*` files stay out of git.
- `SPLUNK_TOKEN` lives in the sync worker's environment only.
- Use `DEMO_MODE` only with dummy data.
- Never put a real company's Splunk address, token or data in this public repo.

**The sync.**
- It never starts searches.
- After changing `lib/report-config.ts` or the dummy data, run `npm run sync` (and sync Atlas for the hosted demo).

**AI.**
- Only `lib/ai/llm.ts` calls the AI.
- Use `AI_PROVIDER=fake` to work on the pages without a key.
- With live Splunk data, AI stays off until `AI_ALLOW_LIVE_DATA=true`.

**Dates and numbers** go through `lib/format.ts`, so the server and the browser show the same text.

**Shipping.** Branch off `splunk-events`, open a PR against `main`, and wait for CI. Vercel deploys `main` only.

**Code style.**
- Each file starts with a plain-English comment saying what it's for.
- One job per file.
- Comments say *why*.
- Tests are named as sentences.
- Guides go in `docs/`.

## Glossary

| Word | Meaning |
|---|---|
| Report | A Splunk scheduled saved search that the app shows. Its `slug` is its id in URLs. |
| Run | One execution of a report by Splunk's scheduler, identified by its `sid`. |
| Fixtures | The dummy reports and the fake Splunk that serves them (`lib/splunk/fixtures/`). |
| Sync | Copying reports and new runs from Splunk or the fixtures into MongoDB. |
| Viewer | The signed-in person a page or route is answering. |
| Visible | A report the viewer may see (`canView`). |
| Status rule | A function in `report-config` that turns results into a warning, such as "a host above 2% errors". |
| Highlight | A headline number on a report, such as results with their change since the previous run. |
| Unusual run | A newest run that stands out from its earlier runs (`lib/insights.ts`), or that the ML job flags. |
| Flag | An entry in the briefing, either "Needs attention" or "Unusual runs", with a "Worth flagging?" vote. |
| Briefing | The summary box on the home page and in Ask AI's side panel. |
| Turn | One question and its answer in a chat. |
| Revalidate | Telling the app to drop its cached report data (`/api/revalidate`). |

## Making the code easier to read

The code already follows most of what helps: a plain-English header on almost every file, one job per file, shared pure functions with tests next to them, and a guide per area in `docs/`. In order of value for the effort, the next steps would be:

1. **Add header comments to the files that lack one:**
   - `components/Navbar.tsx`, `components/StatusBadge.tsx`, `components/RunHistory.tsx`, `components/LightRays.tsx`;
   - `app/ai/reports/page.tsx`, `app/ai/spl/page.tsx`;
   - `lib/utils.ts`, `lib/ai/config.test.ts`.
   This is a few minutes of work.
2. **Move the browser click-through checks into the repo.** They live outside it today. As Playwright tests in an `e2e/` folder, run by CI against `docker compose up`, they would document how each page behaves, and catch changes that break it.
3. **Split `app/globals.css`** (about 1,400 lines) into one file per area, imported from `globals.css`, so styles are easier to find: base, reports, charts, briefing, Ask AI.
4. **Group `components/` into feature folders:** `reports/`, `charts/`, `ai/`, `briefing/`, `layout/`. 36 files sit side by side today. Moving them changes many imports, so do it in one PR of its own.
5. **Split the longest modules by concern:**
   - `lib/splunk/map.ts` (about 450 lines) into schedule, status, charts and highlights;
   - `components/ChatView.tsx` (about 350 lines) into the message list and the box to type in.
6. **Record the "why" decisions** as short notes in `docs/decisions/`, one per decision:
   - the REST API rather than Splunk's SDKs;
   - Gemini behind one file;
   - `connection()` for uncached reads;
   - the double cache refresh;
   - Vercel deploying `main` only.
