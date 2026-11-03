---
name: splunk-reports
description: Add, edit or review Splunk scheduled reports in the SplunkEvents app (dummy data in src/splunk/fixtures/reports.ts, report cards in config/report-cards.yaml), turn dashboard tiles into report cards, write SPL for them, decide who can see them, or work on the Splunk REST sync into MongoDB. Use when a task mentions a Splunk report, a report card, a dashboard tile, SPL, a saved search, report access, or report data in this repo.
---

# Splunk reports in SplunkEvents

Report data flows one way:

```
Splunk REST API, or the fixtures → sync worker (npm run sync) → MongoDB → src/reports/dal.ts → pages and API
```

The app never reads Splunk or the fixtures directly. It reads MongoDB through the data access layer (`src/reports/dal.ts`), which also decides who sees what. So after changing report data or settings, run `npm run sync` to see the result.

| What | Where |
|---|---|
| Dummy reports (fixture mode) | `src/splunk/fixtures/reports.ts` |
| Fixture-only Splunk details: app ids, time ranges, the chart saved in Splunk | `src/splunk/fixtures/transport.ts` (`APP_IDS`, `TIME_RANGES`, `CHARTS`) |
| What Splunk doesn't know: slug, category, tags, groups, chart, warn and fail rules, headline numbers | `config/report-cards.yaml` (a card per report, keyed by the saved search name), loaded and checked by `src/reports/report-config.ts` and `src/reports/cards/` |
| REST JSON → app models (schedule text, indexes, status, charts, highlights) | `src/splunk/map.ts` (pure, tested in `map.test.ts`) |
| Fetching from Splunk and writing MongoDB | `src/splunk/sync.ts`, `worker/sync.ts` |
| Access rule | `src/people/access.ts` (`canView`), applied in `src/reports/dal.ts` |

## Adding a report (fixture mode)

1. **Fixture:** append an object to `reports` in `src/splunk/fixtures/reports.ts`. Copy an existing entry and keep its 4-space indentation and single quotes.
   - **title**: also the Splunk saved search name, and the key of its card in `config/report-cards.yaml`.
   - **schedule / cron / runsPerWeek**: keep all three in agreement, e.g. `'Daily at 06:00 UTC'`, `'0 6 * * *'`, `7`. The sync recomputes schedule text and runs per week from the cron, and the tests fail if they disagree.
   - **timeRange**: one of the labels in `TIME_RANGES` in the fixture transport, or add a new one there.
   - **app**: a label in `APP_IDS` in the fixture transport, or add one.
   - **lastRun / nextRun**: ISO UTC strings, with `nextRun` = `lastRun` + one schedule interval. Keep dates near the other reports (early October 2026).
   - **status / statusMessage**: `'success' | 'warning' | 'failed'`, and the last character of the history pattern must match. In the pipeline, a failed run's message becomes the job's error message. A warning on the newest run comes from the card's `warn` rule (step 2); otherwise the report syncs as healthy.
   - **resultCount**: results the SPL would return (it can be more than the rows shown).
   - **spl**: one pipe command per line, starting from `index=… sourcetype=…`. It must produce the `columns`, in the same order.
   - **highlights**: kept for reference only. The app shows highlights computed from the results (step 2).
   - **columns / rows**: human-readable headers. Rows hold raw numbers (no thousands separators) and strings, about 5 to 8 rows, sorted like the SPL.
   - **history**: `buildHistory(lastRun, everyHours, pattern, baseCount, baseDurationSec)`, where `pattern` is 7 characters (`s`, `w`, `f`, oldest first).
2. **Card:** add a card to `config/report-cards.yaml` under the report's exact name, with `slug` (kebab-case, unique), `category` and `tags`. It's data, not code: `docs/adding-report-cards.md` has every building block with examples, and `config/report-cards.schema.json` describes each field. Copy a similar card. Optional:
   - `groups`: who may see it (see "Access" below).
   - `chart`: `{ y: <column> }` picks the measure to plot, `{ type: line }` overrides the chart saved in Splunk, and `none` shows a table only.
     - `threshold: { value, label }` draws a dashed limit line (e.g. a 2% error budget), and the bars past it take the warning color. Use the same number as the `warn` rule on that column; a test checks they agree.
     - `max` (e.g. `100` for a percentage) turns bars into meters that fill a track up to it.
     - The measure can be a text column of formatted numbers (`"$1,234"`, `"1.84%"`, `"12G"`). The table and chart read them as numbers.
     - `panels: [{ y, threshold? }, ...]` draws one small chart per measure instead of one chart (small multiples), with the rows in the same order in each, as on the payments report. Use it for measures with different units; never put two y-axes on one chart.
     - `scatter: { x, log?, caption }` adds a second chart: a dot per row, with the chart's measure going up and `x` going across, labeled with the first column. `log: true` suits measures that run from 1 into the thousands (ports). `caption` says how to read it, e.g. "far right suggests a port scan".
     - Panels and the scatter are dropped when their columns are missing or not numeric. The sync works out the chart, so run `npm run sync` after changing it.
   - `index`: overrides the index text parsed from the SPL.
   - `warn` / `fail`: when the report shows Warning or Failed, as a condition and a message: `when: { column: Error rate %, above: 2 }`, `one: "{Host} is above 2%."`, and optionally `many`, `item` (for `{list}`) and `row: { top: <column> }`. `fail` is checked first. Put messages in double quotes.
   - `highlights`: the headline numbers, each a `label` and a `value` (`first`, `sum`, `max`, `min`, `average`, `count: results`, `ratio: [a, b]`, or `top` with `by`), with optional `format`, `note` and `meter`. The default is the result count with its change since the previous run (and a sparkline of the recent runs), the top row by the charted measure, and the search time. A `meter: { of: <limit> }` shows a meter under the value, as on the license usage report.
   - `custom`: a TypeScript rule in `src/reports/cards/custom.ts`, only for what the building blocks can't say.
3. **Chart saved in Splunk:** add the slug to `CHARTS` in the fixture transport (`'bar'`, `'column'`, `'line'` or `null` for a statistics table). Results with `_time` first and several measures draw a line per measure by themselves.
4. **Catalog:** add a `### <title>` section to `docs/report-catalog.md`, in the same shape as the others (question, slug, schedule, who sees it, search, columns, chart, headline numbers, warning rule and its limit), and a row in its table at a glance. `src/reports/report-catalog.test.ts` fails until you do.
5. **Check:** run `npm run card:preview "<title>"` (it shows the status, headline numbers and chart from the newest run, and flags a column the results don't have), then `npm run check` (types, lint, tests). The fixture pipeline test round-trips every report and fails on mismatched schedules, statuses or history. Then `npm run sync`, and open the report while signed in as a user who can see it. The card on the home page shows the report's first highlight.

Cards look columns up by header name, so they must match the report's `columns` (in live mode, its Splunk field names). Never guess a column: take it from `npm run card:preview`.

## Turning dashboard tiles into cards

`npm run --silent splunk:tiles "<dashboard>" > tiles.md` (live mode) writes a worksheet: each tile's whole search, time range, units, color ranges and a draft card. A tile must become a scheduled report in Splunk first (a Splunk admin's job: replace `$inputs$`, set the time range, schedule it, share it with the service account's role). Then paste the draft card, fix its columns with `card:preview`, and check. The full recipe and the rules for AI assistants: `docs/adding-report-cards.md`.

## Access: who sees which report

- A user sees a report when they're an admin, or when one of their groups is in the report's `allowedGroups`.
- `allowedGroups` = the card's `groups`, or else the local parts of the report's email recipients (`secops@example.com` → `secops`).
- Scheduled searches without a card are synced only if they email their results (and not at all with `SYNC_REPORTS=configured`), and stay admin-only until they get one.
- **Before turning off a report's email action in Splunk, copy its groups into its card.** `action.email.to` disappears with the email action, and so would the default groups.
- Users' groups live in MongoDB's `user_access` collection. Demo users come from `src/people/demo-users.ts` via `npm run seed`.
- A report a user may not see answers exactly like a missing one (404 from the API, "Report not found" page), so its name doesn't leak. Never return `allowedGroups` from an API route.

## Dummy-data rules (until real Splunk is connected)

- Emails use `@example.com` only.
- IPs come from documentation ranges only: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`.
- Hostnames, users and numbers are made up but realistic. Never paste real data from a Splunk instance into the fixtures.

## Live Splunk

Set `SPLUNK_MODE=live`, `SPLUNK_BASE_URL` (management port, usually 8089), `SPLUNK_TOKEN` and `SPLUNK_TZ` for the worker only, then run `npm run splunk:check`: it tests the connection step by step without syncing, and says what to fix (`src/splunk/check.ts`, hints in `src/splunk/errors.ts`). The worker checks its settings when it starts (`src/splunk/settings.ts`). `SYNC_REPORTS=configured` syncs only the reports with a card; the default, `emailed`, also takes every emailed scheduled search. The token is for a service account the reports are shared with, and must never reach the web app or a `NEXT_PUBLIC_` variable. The worker calls, with `output_mode=json`:

| Data | Endpoint |
|---|---|
| Scheduled reports | `GET /servicesNS/-/-/saved/searches?search=is_scheduled=1&count=0` (`search`, `cron_schedule`, `dispatch.earliest_time/latest_time`, `action.email.to`, `next_scheduled_time`, `display.visualizations.*`, `acl`) |
| A report's runs | `GET /servicesNS/{owner}/{app}/saved/searches/{name}/history` (entry name = sid) |
| A run's status | `GET /services/search/jobs/{sid}` (`dispatchState`, `runDuration`, `resultCount`, `messages`) |
| A run's results | `GET /services/search/v2/jobs/{sid}/results` (v1 is disabled; values arrive as strings) |
| App labels | `GET /services/apps/local` |

The worker only reads runs the scheduler already made; it never dispatches searches. Results expire after `dispatch.ttl` (two schedule periods by default), so the worker must sync more often than that. A 404 on results means they expired, and the run is stored without rows.

The worker can read its token from a file instead: `SPLUNK_TOKEN_FILE` (a mounted secret). To try live mode without a company Splunk, `docker-compose.splunk.yml` runs Splunk Enterprise's trial with seven of the dummy reports and their logs (`src/splunk/example/`, set up by `scripts/splunk-example/`) and the worker reading it: see `docs/splunk-example.md`. Its searches are the fixture SPL plus a `rename` step, so keep the fixture SPL runnable.

Read the Next.js guides in `node_modules/next/dist/docs/` before changing data fetching, caching or auth code: this Next.js version differs from older ones (see AGENTS.md). Report reads are cached with `'use cache'` and the `reports` tag; the worker clears them through `POST /api/revalidate`.
