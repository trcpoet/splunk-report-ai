---
name: splunk-reports
description: Add, edit or review Splunk scheduled reports in the SplunkEvents app (dummy data in lib/splunk/fixtures/reports.ts, per-report settings in lib/report-config.ts), write SPL for them, decide who can see them, or work on the Splunk REST sync into MongoDB. Use when a task mentions a Splunk report, SPL, a saved search, report access, or report data in this repo.
---

# Splunk reports in SplunkEvents

Report data flows one way:

```
Splunk REST API, or the fixtures → sync worker (npm run sync) → MongoDB → lib/dal.ts → pages and API
```

The app never reads Splunk or the fixtures directly. It reads MongoDB through the data access layer (`lib/dal.ts`), which also decides who sees what. So after changing report data or settings, run `npm run sync` to see the result.

| What | Where |
|---|---|
| Dummy reports (fixture mode) | `lib/splunk/fixtures/reports.ts` |
| Fixture-only Splunk details: app ids, time ranges, the chart saved in Splunk | `lib/splunk/fixtures/transport.ts` (`APP_IDS`, `TIME_RANGES`, `CHARTS`) |
| What Splunk doesn't know: slug, category, tags, groups, chart measure, status rule, highlights | `lib/report-config.ts`, keyed by the saved search name |
| REST JSON → app models (schedule text, indexes, status, charts, highlights) | `lib/splunk/map.ts` (pure, tested in `map.test.ts`) |
| Fetching from Splunk and writing MongoDB | `lib/splunk/sync.ts`, `worker/sync.ts` |
| Access rule | `lib/access.ts` (`canView`), applied in `lib/dal.ts` |

## Adding a report (fixture mode)

1. **Fixture:** append an object to `reports` in `lib/splunk/fixtures/reports.ts`. Copy an existing entry and keep its 4-space indentation and single quotes.
   - **title**: also the Splunk saved search name, and the key in `report-config`.
   - **schedule / cron / runsPerWeek**: keep all three in agreement, e.g. `'Daily at 06:00 UTC'`, `'0 6 * * *'`, `7`. The sync recomputes schedule text and runs per week from the cron, and the tests fail if they disagree.
   - **timeRange**: one of the labels in `TIME_RANGES` in the fixture transport, or add a new one there.
   - **app**: a label in `APP_IDS` in the fixture transport, or add one.
   - **lastRun / nextRun**: ISO UTC strings, with `nextRun` = `lastRun` + one schedule interval. Keep dates near the other reports (early October 2026).
   - **status / statusMessage**: `'success' | 'warning' | 'failed'`, and the last character of the history pattern must match. In the pipeline, a failed run's message becomes the job's error message. A warning on the newest run comes from a status rule (step 2); otherwise the report syncs as healthy.
   - **resultCount**: results the SPL would return (it can be more than the rows shown).
   - **spl**: one pipe command per line, starting from `index=… sourcetype=…`. It must produce the `columns`, in the same order.
   - **highlights**: kept for reference only. The app shows highlights computed from the results (step 2).
   - **columns / rows**: human-readable headers. Rows hold raw numbers (no thousands separators) and strings, about 5 to 8 rows, sorted like the SPL.
   - **history**: `buildHistory(lastRun, everyHours, pattern, baseCount, baseDurationSec)`, where `pattern` is 7 characters (`s`, `w`, `f`, oldest first).
2. **Settings:** add an entry to `reportConfig` in `lib/report-config.ts` with `slug` (kebab-case, unique), `category` and `tags`. Optional:
   - `groups`: who may see it (see "Access" below).
   - `chart`: `{ y: '<column>' }` to pick the measure to plot, `{ type }` to override the chart saved in Splunk, or `'none'` for a table only.
     - `threshold: { value, label }` draws a dashed limit line (e.g. a 2% error budget), and the bars past it take the warning color. Put the number in a constant that the `statusRule` uses too, so the chart and the warning agree.
     - `max` (e.g. `100` for a percentage) turns bars into meters that fill a track up to it.
     - The measure can be a text column of formatted numbers (`"$1,234"`, `"1.84%"`, `"12G"`). The table and chart read them as numbers.
     - `panels: [{ y, threshold? }, ...]` draws one small chart per measure instead of one chart (small multiples), with the rows in the same order in each, as on the payments report. Use it for measures with different units; never put two y-axes on one chart.
     - `scatter: { x, log?, caption }` adds a second chart: a dot per row, with the chart's measure going up and `x` going across, labeled with the first column. `log: true` suits measures that run from 1 into the thousands (ports). `caption` says how to read it, e.g. "far right suggests a port scan".
     - Panels and the scatter are dropped when their columns are missing or not numeric. The sync works out the chart, so run `npm run sync` after changing it.
   - `index`: overrides the index text parsed from the SPL.
   - `statusRule`: turns results into a warning with a one- or two-sentence message, e.g. "warn when any host is above 2%".
   - `highlights`: custom headline numbers. The default is the result count with its change since the previous run (and a sparkline of the recent runs), the top row by the charted measure, and the search time. A highlight with `meter` (the share of a limit, where 1 is the limit) shows a meter under its value, as on the license usage report.
3. **Chart saved in Splunk:** add the slug to `CHARTS` in the fixture transport (`'bar'`, `'column'` or `null` for a statistics table).
4. **Check:** run `npm test`. The fixture pipeline test round-trips every report and fails on mismatched schedules, statuses or history. Then `npm run sync`, and open the report while signed in as a user who can see it.

Status rules and highlight functions look columns up by header name, so they must match the report's `columns` (in live mode, its Splunk field names).

## Access: who sees which report

- A user sees a report when they're an admin, or when one of their groups is in the report's `allowedGroups`.
- `allowedGroups` = `report-config` `groups`, or else the local parts of the report's email recipients (`secops@example.com` → `secops`).
- Scheduled searches missing from `report-config` are synced only if they email their results, and stay admin-only until added.
- **Before turning off a report's email action in Splunk, copy its groups into `report-config`.** `action.email.to` disappears with the email action, and so would the default groups.
- Users' groups live in MongoDB's `user_access` collection. Demo users come from `lib/demo-users.ts` via `npm run seed`.
- A report a user may not see answers exactly like a missing one (404 from the API, "Report not found" page), so its name doesn't leak. Never return `allowedGroups` from an API route.

## Dummy-data rules (until real Splunk is connected)

- Emails use `@example.com` only.
- IPs come from documentation ranges only: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`.
- Hostnames, users and numbers are made up but realistic. Never paste real data from a Splunk instance into the fixtures.

## Live Splunk

Set `SPLUNK_MODE=live`, `SPLUNK_BASE_URL` (management port, usually 8089), `SPLUNK_TOKEN` and `SPLUNK_TZ` for the worker only. The token is for a service account the reports are shared with, and must never reach the web app or a `NEXT_PUBLIC_` variable. The web app may have its own `SPLUNK_PARSER_TOKEN` instead, for a parse-only role with no index access: Write SPL then checks searches with Splunk's parser (`lib/splunk/parser.ts`), which never runs them. The worker calls, with `output_mode=json`:

| Data | Endpoint |
|---|---|
| Scheduled reports | `GET /servicesNS/-/-/saved/searches?search=is_scheduled=1&count=0` (`search`, `cron_schedule`, `dispatch.earliest_time/latest_time`, `action.email.to`, `next_scheduled_time`, `display.visualizations.*`, `acl`) |
| A report's runs | `GET /servicesNS/{owner}/{app}/saved/searches/{name}/history` (entry name = sid) |
| A run's status | `GET /services/search/jobs/{sid}` (`dispatchState`, `runDuration`, `resultCount`, `messages`) |
| A run's results | `GET /services/search/v2/jobs/{sid}/results` (v1 is disabled; values arrive as strings) |
| App labels | `GET /services/apps/local` |

The worker only reads runs the scheduler already made; it never dispatches searches. Results expire after `dispatch.ttl` (two schedule periods by default), so the worker must sync more often than that. A 404 on results means they expired, and the run is stored without rows.

Read the Next.js guides in `node_modules/next/dist/docs/` before changing data fetching, caching or auth code: this Next.js version differs from older ones (see AGENTS.md). Report reads are cached with `'use cache'` and the `reports` tag; the worker clears them through `POST /api/revalidate`.
