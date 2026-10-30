# `lib/splunk/`: the sync, Splunk's REST API and the dummy data

How reports get from Splunk, or the dummy fixtures, into MongoDB. The worker that runs this is `worker/sync.ts` ([tooling.md](tooling.md#workersyncts)). Connecting real Splunk step by step: [connecting-live-splunk.md](../connecting-live-splunk.md). Back to the [file reference](README.md).

None of these files import `server-only` or `next/*`, because they run in the worker, a plain Node process.

## The REST calls

The sync only reads. Every call asks for `output_mode=json`.

| Call | Why |
|---|---|
| `GET /services/apps/local` | App labels, for "Splunk app" on a report page |
| `GET /servicesNS/-/-/saved/searches?search=is_scheduled=1` | Every scheduled saved search, with its schedule, SPL, email action and access |
| `GET /servicesNS/<owner>/<app>/saved/searches/<name>/history` | A report's newest jobs (up to 50) |
| `GET /services/search/jobs/<sid>` | One job's facts: state, run time, duration, result count, messages |
| `GET /services/search/v2/jobs/<sid>/results` | One job's result rows (up to `SYNC_MAX_ROWS`) |

The web app makes one more call, only for Write SPL, and only with a parse-only token: `POST /services/search/parser` (`parser.ts`).

## `sync.ts`

Copies Splunk scheduled reports and their runs into MongoDB.
- **It reads only what the scheduler already ran.** It never dispatches a search, so it doesn't compete for the scheduler's concurrency limit.
- **It's idempotent.** Reports upsert by slug and runs by sid, so running it again only adds runs it hasn't seen.
- **One failing report doesn't stop the others.** Its error is saved on the report (`syncError`), and the run's exit code is 1.

| Export | What it does |
|---|---|
| `syncAll({ transport, mode, timeZone, now, refreshApp, log })` | The whole sync, in five steps (below). Returns `{ reports, newRuns, errors }`. |
| `listScheduledReports(transport, timeZone, now)` | The scheduled searches that email their results, plus any listed in `report-config`, each mapped to `ReportMeta` with its config. |
| `fetchNewRuns(transport, report, knownSids)` | The runs in a report's history that aren't stored yet, with their results. Jobs still running are skipped; the next sync picks them up. A job whose results expired in between is stored with `resultsExpired`. |
| `ScheduledReport`, `SyncOptions`, `SyncSummary` | The types. |

What `syncAll` does:
1. It marks the sync as started in `sync_state`.
2. It lists the scheduled reports, then fetches each one's new runs into `report_runs`.
3. It recomputes each `reports` document: the latest run, the last `HISTORY_SIZE` (7) runs, highlights and the chart (`map.ts`).
4. It marks reports that are no longer scheduled as `disabled`.
5. It records the finish and the time zone (`SPLUNK_TZ`) in `sync_state`, then calls `POST /api/revalidate` twice, `SECOND_REFRESH_MS` (3 s) apart, when `APP_URL` and `REVALIDATE_SECRET` are set.

**Tests:** `map.test.ts` runs `syncAll` against the fixture transport end to end.

## `transport.ts`

How the worker talks to Splunk.
- **`httpTransport({ baseUrl, token, timeoutMs = 30000, retries = 3 })`** returns a `SplunkTransport`. Its `get(path, params)` calls the REST API with `Authorization: Bearer <token>`.
- **Retries:** it retries network errors, timeouts and HTTP 429, 500, 502, 503 and 504, with exponential backoff (about 0.5, 1 and 2 s) and a little jitter.
- **`SplunkHttpError`** carries the HTTP status, and `isNotFound(error)` tests for 404. Expired job results answer 404.
- **Certificates:** for an internal certificate authority, set `NODE_EXTRA_CA_CERTS`. Never turn certificate checks off.

## `map.ts` (pure)

Turns Splunk's REST JSON into the app's models, with no I/O, so all of it is unit-tested.

| Area | Functions |
|---|---|
| Values | `toBool`, `toCell` (keeps "007" and IPs as text), `mapResults` (drops Splunk's internal `_` fields except `_time`) |
| Schedules and times | `describeCron` (short phrasing for common schedules, `cronstrue` for the rest), `runsPerWeek`, `nextRunFromCron`, `parseSplunkTime`, `describeTimeRange` ("Last 24 hours") |
| Searches | `describeIndexes` (`index=web sourcetype=access_combined` → "web (access_combined)"), `parseRecipients`, `groupsFromRecipients` (`secops@example.com` → `secops`), `chartTypeFromDisplay` |
| Reports | `mapSavedSearch` (a saved search plus its config → `ReportMeta`) |
| Runs | `isFinished`, `isFailed`, `runStatus` (applies the report's status rule), `runTime`, `mapRun` (a job → `RunFacts`) |
| Derived fields | `resolveChart`, `defaultHighlights` (results with the change since the previous run, the chart's top row, and the search time), `deriveReportFields` (latest run, history, highlights, chart, for the `reports` document) |

**Change it when:** Splunk sends a field in a new shape, or a report needs a new kind of derived field. Add a test in `map.test.ts` with the real JSON.

## `types.ts`

Only the REST fields the sync reads:
- `SplunkFeed<T>` and `SplunkEntry<T>`, Splunk's envelope;
- `SavedSearchContent`, `HistoryContent`, `JobContent`, `JobMessage`, `ResultsResponse`, `AppContent`;
- `SplunkAcl`;
- `SplunkBool`: Splunk sends booleans as `true`/`false` or `"0"`/`"1"`.

Most values arrive as strings, so `map.ts` converts defensively.

## `parser.ts`

`splunkParse({ baseUrl, token, query, timeoutMs = 5000 })` checks a search with Splunk's own parser, `POST /services/search/parser`, without running it. Write SPL uses it through `lib/ai/validate.ts`. It needs `SPLUNK_PARSER_TOKEN`, a token for a role that can't read any index. The worker's `SPLUNK_TOKEN` never reaches the web app.

## `fixtures/reports.ts`

The 9 dummy reports the demo runs on.
- **What each holds:** a saved search (name, SPL, cron, email recipients, app, owner), result columns and rows, and a run history built by `buildHistory`.
- **Everything is fake:** emails use `example.com`, and IPs come from the documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
- **The spike:** the failed-logins report has a spike in its newest run (117 accounts against about 38), so there's always an unusual run to see.
- **Exports:** `FixtureReport`, `buildHistory`, `reports`.
- **Used by:** the fixture transport, `scripts/eval-spl.ts`, and most tests.

## `fixtures/transport.ts`

`fixtureTransport()` answers the same REST paths from the dummy reports, in Splunk's JSON shape. It behaves like a real search head:
- every report keeps its last 7 runs in history;
- only the newest finished run still has results; older ones answer 404, like results deleted after `dispatch.ttl`;
- result values arrive as strings.

`SPLUNK_MODE=fixture` (the default) uses it, so the whole pipeline runs without Splunk.
