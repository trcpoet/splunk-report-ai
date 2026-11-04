# The worker, scripts, ML job and root files

Everything outside `src/`. Settings for all of these are in [configuration.md](../configuration.md). Back to the [file reference](README.md).

## `worker/sync.ts`

The sync worker's entry point, a plain Node process run with `tsx`, not part of Next.js.
- **Runs:**
  - `npm run sync` syncs once and exits, with exit code 1 if any report failed;
  - `npm run sync:watch` syncs every `SYNC_INTERVAL_MINUTES` (default 15) until Ctrl+C or SIGTERM.
- **Settings first:** `readSyncSettings` (`src/splunk/settings.ts`) checks them all, and stops with every problem listed.
- **Transport:** it picks one from `SPLUNK_MODE`.
  - `fixture`, the default, uses the dummy reports.
  - `live` uses `httpTransport` with `SPLUNK_BASE_URL` and `SPLUNK_TOKEN`, or the token in the file `SPLUNK_TOKEN_FILE` names.
- **Then** it calls `syncAll` (`src/splunk/sync.ts`) with `SYNC_REPORTS`, prints a one-line summary, and disconnects. Errors print with a hint for common setup mistakes (`describeError`).
- **Only this process holds `SPLUNK_TOKEN`.** Run it beside the web app, never inside it.

## `scripts/`

### `splunk-check.ts`

`npm run splunk:check`: runs `checkSplunk` (`src/splunk/check.ts`) with the sync worker's own settings and prints ✓, ⚠ or ✗ for each step, with what to fix. It only reads, needs no database, and exits with code 1 when a check fails. In fixture mode it checks the dummy data.

### `card-preview.ts`

`npm run card:preview "<report name or slug>"`: shows a report's card as the app will, from its newest finished run (`previewReport`, `src/splunk/preview.ts`): the status and its message, the headline numbers, the chart and the first rows. It works before the report has a card, to list its columns. It only reads, needs no database, and exits with code 1 when the card names a column the results don't have, or there's no finished run yet.

### `splunk-tiles.ts`

`npm run --silent splunk:tiles "<dashboard name or title>" > tiles.md`: a Markdown worksheet for moving a dashboard's tiles into the app (`src/splunk/tiles.ts`). For each tile: its whole search, time range, units and color ranges, a warning for dashboard inputs, and a draft card. It needs `SPLUNK_MODE=live`, and only reads. The steps that follow: [adding-report-cards.md](../adding-report-cards.md#move-a-dashboards-tiles).

### `cards-schema.ts`

`npm run cards:schema`: writes `config/report-cards.schema.json` from the cards' zod schema (`src/reports/cards/schema.ts`). Run it after changing the schema; `load.test.ts` fails while the file is out of date.

### `seed-demo-users.ts`

`npm run seed`: creates the demo users from `src/people/demo-users.ts` and their `user_access` records.
- **Safe to run again:** existing demo users get the current `DEMO_PASSWORD` and access, so changing the password in `.env.local` and re-running it takes effect.
- **Sign-up:** the web app turns sign-up off, and Better Auth enforces that inside its sign-up endpoint. So this script uses its own Better Auth instance with sign-up on.

### `splunk-example/`

The real-Splunk example's scripts ([splunk-example.md](../splunk-example.md)).
- **`admin.ts`:** a small REST client that signs in to a test Splunk as its admin. It keeps trying for 2 minutes while Splunk can't be reached, for example while it restarts. The connector never uses it.
- **`setup.ts`** (`npm run splunk:setup`) sets the test Splunk up through its REST API:
  - indexes, and the SSH log's fields;
  - six scheduled reports;
  - a read-only role and a service account, with a 30-day token written to `SPLUNK_TOKEN_FILE`. It waits for the KV store, which keeps the tokens;
  - 24 hours of logs.

  It's safe to run again.
- **`feed.ts`** (`npm run splunk:feed`) sends each minute's dummy logs just after the minute ends.

### `eval-spl.ts` and `spl-eval-set.json`

`npm run eval:spl` scores Write SPL on the 10 requests in `spl-eval-set.json`, with the same steps as the tab: retrieval, prompt, AI, SPL check.
- **It scores each answer:** does it parse, does it only read data, does it use the expected index and fields.
- **It needs no database:** it uses the demo reports.
- **Use it before and after** changing a prompt, the examples or the model, with a real `GEMINI_API_KEY`. `AI_PROVIDER=fake` only checks that the steps run.
- **It runs with `--conditions=react-server`**, so the server-only modules load outside Next.js.

## `ml/`: the Python ML job

How it works: [docs/ml.md](../ml.md) and [ml/README.md](../../ml/README.md).

| File | What it does |
|---|---|
| `score.py` | The job: `python ml/score.py [--plot]`, or `npm run ml` / `ml:plot`. See below. |
| `features.py` | What the models look at for each run: how far its result count and search time are from the report's usual (robust z), and whether it failed. It mirrors `src/reports/insights.ts`: at least 4 earlier successful runs, the 6 most recent of them. |
| `tests/test_ml.py` | `npm run test:ml` (pytest). It builds runs in memory, so it needs no database. It checks that the statistics match the app's, how failed runs are handled, the reasons in plain words, and both models. |
| `requirements.txt` | Exact versions: pymongo, pandas, numpy, scikit-learn, matplotlib, python-dotenv, pytest. |
| `pytest.ini` | Tests live in `tests/`; the `ml/` folder is on the path. |
| `Dockerfile` | `python:3.14-slim` with the requirements, run as user 1000. It's used by `docker compose --profile ml run --rm ml` (as root, for `--plot`) and by the chart's ML CronJob. |
| `README.md` | Setting up `ml/.venv`, running it, and what it writes. |

What `score.py` does:
1. It reads `report_runs` and the flag votes from `ai_feedback`.
2. An Isolation Forest (`CONTAMINATION` 0.05) scores every run from 0 (typical) to 1 (most unusual), and flags the 5% that differ most, with a reason.
3. With `MIN_VOTES` (20) votes, at least one of each kind, a logistic regression learns which flags are worth attention, and reports its cross-validated accuracy.
4. It replaces `ml_run_scores` and `ml_report_scores`.
5. It calls `/api/revalidate` twice, like the sync.
6. With `--plot`, it also draws `ml/out/anomaly-scores.png`.

## Next.js and TypeScript

| File | What it does |
|---|---|
| `next.config.ts` | Turns on `cacheComponents` and `partialPrefetching`. Sets `output: 'standalone'` when `NEXT_OUTPUT=standalone`, as Docker does. Adds the PostHog `/ingest` rewrites and `skipTrailingSlashRedirect`. |
| `src/proxy.ts` | Next 16's name for middleware. It sends visitors without a session cookie to `/login?next=…`. Its `matcher` skips `/login`, API routes, `_next`, the PostHog proxy and static files. It's a quick redirect, not the security check. |
| `src/instrumentation-client.ts` | Starts PostHog in the browser when `NEXT_PUBLIC_POSTHOG_KEY` is set, with exception capture and debug logging in development. |
| `tsconfig.json` | TypeScript settings. `@/*` maps to `src/`, so imports read `@/reports/dal`. On top of `strict`, it treats every `list[i]` and `record[key]` as possibly missing (`noUncheckedIndexedAccess`) and fails on unused code. `npm run typecheck` runs it. |
| `react-canary.d.ts` | Pulls in React's canary types, for `<ViewTransition>`. |
| `next-env.d.ts` | Generated by Next.js, and ignored by git. |
| `eslint.config.mjs` | `npm run lint`: Next's Core Web Vitals and TypeScript rules, including the React Compiler's checks, plus typescript-eslint's `strictTypeChecked` rules, which read the types (shadcn's `src/shared/ui/` keeps the default rules). It caches results in `.eslintcache`, and ignores build output and `ml/.venv`. |
| `postcss.config.mjs` | Tailwind CSS 4 through `@tailwindcss/postcss`. |
| `components.json` | shadcn/ui settings: the style, `src/app/globals.css`, the aliases, lucide icons, and the React Bits registry. |
| `package.json`, `package-lock.json` | Dependencies and scripts (`dev`, `build`, `start`, `lint`, `test`, `sync`, `sync:watch`, `seed`, `ml`, `ml:plot`, `test:ml`, `eval:spl`). Install with `npm ci` to get the lockfile's versions. |

## Docker, Vercel and CI

| File | What it does |
|---|---|
| `Dockerfile` | Multi-stage build on `node:24-slim`:<br>• `deps` runs `npm ci`;<br>• `tools` has all the code, for seed and sync;<br>• `build` runs `next build` with placeholders, with `DEMO_MODE` and `DEMO_PASSWORD` as build arguments (off unless set), and gives group 0 the owner's rights on what `app` copies;<br>• `worker` is `tools` as user 1000 (`HOME=/tmp`), for the chart's connector and demo-accounts Job;<br>• `app` runs the standalone server as user 1000 on :3000, with a health check on `/login`. It comes last, so a plain `docker build` builds it. |
| `docker-compose.yml` | `docker compose up --build`:<br>• `mongo` (7.0, with a health check);<br>• `setup` (seed, then sync, once);<br>• `app`;<br>• `ml`, under `--profile ml`, as root so `--plot` can write `ml/out`.<br>Every setting has a default ([docker.md](../docker.md)). |
| `docker-compose.splunk.yml` | The real-Splunk example:<br>• `splunk` (10.0, pinned: from 10.2 the KV store can't start on Linux kernels 6.19+);<br>• `splunk-setup`, `feeder` and `seed`;<br>• `app`;<br>• `connector`, the worker in live mode with the token file;<br>• `mongo`.<br>([splunk-example.md](../splunk-example.md)) |
| `.devcontainer/devcontainer.json` | A GitHub Codespaces machine (x86, 4 cores, 16 GB) with Docker inside, for the Splunk example. `BETTER_AUTH_URL` is set to the codespace's address. Its SSH server lets you run commands from your own terminal with `gh codespace ssh`. |
| `deploy/helm/splunk-events/` | The Helm chart ([kubernetes.md](../kubernetes.md)):<br>• `templates/`: the web Deployment and Service, a Route (`route.enabled`) or an Ingress, the connector CronJob, the ML CronJob (`ml.enabled`), the demo-accounts Job (`demo.enabled`), the Secret (unless `secrets.existingSecret`);<br>• `_helpers.tpl`: names, labels, images, secret variables, and security contexts that fit OpenShift's restricted policy;<br>• `values.yaml`: every value, commented;<br>• `values-openshift-example.yaml`: a live setup with placeholders.<br>The Splunk token's Secret goes to the connector only. |
| `deploy/helm/ci/` | The chart's CI install: `values.yaml` (fixture mode, demo accounts, placeholder secrets) and `mongo.yaml` (a throwaway MongoDB). |
| `.dockerignore` | Keeps secrets (`.env*` except `.env.example`, `.splunk-example`), `.git`, `.next`, `node_modules`, `ml/.venv`, `ml/out`, `.claude` and logs out of the build context. |
| `vercel.json` | `git.deploymentEnabled`: only `main` deploys. |
| `.github/workflows/ci.yml` | On every PR and push to `main`, with newer pushes cancelling older runs:<br>• **"Lint, test and build"**, required by the `main` ruleset: the type check, ESLint, the tests and `next build`;<br>• **"ML (Python)"**, which runs pytest on Python 3.14;<br>• **"Docker"**, which builds, starts, signs in, reads `/api/reports`, runs the browser tests (`npm run e2e`) against the demo data, then runs the ML job. |
| `.github/workflows/splunk-example.yml` | "Splunk example" (not required). It runs `docker-compose.splunk.yml` with the reports and sync every minute, then checks:<br>• the seven reports arrive with Splunk's results and columns, including a real `timechart`;<br>• the status rules fire;<br>• the sync ran in live mode.<br>• `npm run splunk:check` passes, and explains a wrong token and port 8000;<br>• the browser tests pass against Splunk's reports, and their screenshots are kept as the run's "screenshots-from-splunk" artifact.<br>It runs when the connector, the app or the example change, on Mondays, and by hand. |
| `.github/workflows/helm.yml` | "Helm" (not required):<br>• `helm lint` and `helm template` with both value files;<br>• a check that the web app never gets `SPLUNK_TOKEN`;<br>• the three images built and installed on a kind cluster, with the connector and the ML job run once, then a sign-in.<br>It runs when the chart, the Dockerfiles or `worker/` change. |

## Browser tests

| File | What it does |
|---|---|
| `playwright.config.ts` | `npm run e2e`: Playwright against an app that's already running (`E2E_BASE_URL`, default `http://localhost:3000`), in the Chrome installed on the machine (`channel: 'chrome'`), so nothing is downloaded. One worker, because Better Auth limits sign-ins. It reads `.env.local` for `DEMO_PASSWORD`. |
| `e2e/auth.setup.ts` | Signs in as the admin through the login form once, and saves the session in `e2e/.auth/` (git ignores it) for the other tests. |
| `e2e/reports.spec.ts` | The home page lists at most 20 reports, newest run first, and each one that has run shows its headline number; the filters are in the address, and Back brings them back (after a report, and after a link cleared them); a report page shows its chart and its results table; no console errors. It works against the demo data and a real Splunk. `E2E_SCREENSHOTS=<folder>` saves screenshots. |
| `e2e/access.spec.ts` | Who may read what, over HTTP: signed out gets 401, the finance analyst gets 404 for every report the admin sees and they don't, and an auth endpoint the app doesn't use (change password) answers 404. It signs in once more, as the finance analyst. |

## Settings and git

| File | What it does |
|---|---|
| `.env.example` | Every setting, explained. Copy it to `.env.local`. |
| `config/report-cards.yaml` | The report cards: how each Splunk report looks in the app ([adding-report-cards.md](../adding-report-cards.md)). Its first line points editors at `config/report-cards.schema.json`, which checks it as you type. |
| `.github/copilot-instructions.md` | Points GitHub Copilot, and assistants that read it, at the card guide and the repo's rules. |
| `.gitignore` | Ignores `.env*` (except `.env.example`), `.next/`, `node_modules/`, `ml/.venv/`, `ml/out/`, `.splunk-example/` (the example's token), `*.tsbuildinfo` and editor folders. |
| `README.md` | What the app is, how to run it, the scripts, hosting, connecting Splunk, and the docs. |
| `AGENTS.md`, `CLAUDE.md` | Notes for coding agents: this Next.js is version 16, so read its bundled docs in `node_modules/next/dist/docs/` before writing code; and for report cards, follow `docs/adding-report-cards.md`. `next dev` re-adds the block in `AGENTS.md` between its markers, and leaves the rest alone. |

## Claude Code and 21st

| Path | What it does |
|---|---|
| `.mcp.json` | MCP servers for Claude Code in this repo:<br>• shadcn;<br>• AntV charts (renders through AntV's public service, so dummy data only);<br>• MongoDB, read-only, on `MDB_MCP_CONNECTION_STRING`. |
| `.claude/settings.json` | Turns on the `splunk-events` plugin for this repo. |
| `.claude/skills/splunk-reports/SKILL.md` | The `splunk-reports` skill: how to add, edit or review reports, write their SPL, and decide who sees them. |
| `.claude-plugin/marketplace.json` | The local plugin marketplace, `splunk-events-tools`. |
| `plugins/splunk-events/` | The plugin: `.claude-plugin/plugin.json`, the Splunk Cloud MCP server over OAuth (`.mcp.json`, from `SPLUNK_MCP_URL` and `SPLUNK_MCP_CLIENT_ID`), and the same skill. Installing it: [README](../../README.md#claude-code-tools). |
| `.21st/design.json`, `.21st/DESIGN.md` | The design context for the `21st` CLI and its skills: tokens read from `src/app/globals.css`, and constraints, including the Ask AI layout. `21st init --design-context --refresh` regenerates it; `--check` says whether it's current. |

## `public/`

Static files served as they are, all under `public/icons/`:
- `logo.svg`, in the navbar;
- `clock.svg`, `calendar.svg` and `audience.svg`, on report cards;
- `arrow-down.svg`, on the "Explore reports" button.

The browser tab icon is `src/app/icon.svg`.
