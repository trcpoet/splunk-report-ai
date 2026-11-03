# `src/splunk/`: the sync, Splunk's REST API and the dummy data

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

## `sync.ts`

Copies Splunk scheduled reports and their runs into MongoDB.
- **It reads only what the scheduler already ran.** It never dispatches a search, so it doesn't compete for the scheduler's concurrency limit.
- **It's idempotent.** Reports upsert by slug and runs by sid, so running it again only adds runs it hasn't seen.
- **One failing report doesn't stop the others.** Its error is saved on the report (`syncError`), and the run's exit code is 1.

| Export | What it does |
|---|---|
| `syncAll({ transport, mode, syncReports, timeZone, now, refreshApp, log })` | The whole sync, in five steps (below). Returns `{ reports, newRuns, errors }`. |
| `isSyncedSearch(entry, which)` | Whether a saved search becomes a report: it must be scheduled, and have a card in `config/report-cards.yaml`, or (with `SYNC_REPORTS=emailed`, the default) email its results. |
| `listScheduledReports(transport, timeZone, now, log, which)` | The saved searches `isSyncedSearch` takes, each mapped to `ReportMeta` with its config. Searches that share a name would share a slug, so one stays (a shared one before a private copy) and the rest are logged. |
| `scheduledRunSids(transport, report, count)` | The sids of a report's scheduled runs in Splunk's history, newest first. Runs started by hand don't count. |
| `fetchRun(transport, report, sid)` | One run's facts and results, or `null` while it's still running. `npm run splunk:check` reads a run with it too. |
| `fetchNewRuns(transport, report, knownSids)` | The runs in a report's history that aren't stored yet, with their results. Jobs still running are skipped; the next sync picks them up. A job whose results expired in between is stored with `resultsExpired`. Returns `{ runs, unreadable, failure }`: `unreadable` counts the jobs Splunk answered 404 for, and `failure` is what stopped the fetch early, so the runs before it are still saved. |

What `syncAll` does:
1. It marks the sync as started in `sync_state`.
2. It reads the report cards and lists the scheduled reports, then fetches each one's new runs into `report_runs`. A mistake in the cards file stops the sync here, before any report changes, and the problems are saved as its `lastError`.
3. It recomputes each `reports` document: the latest run, the last `HISTORY_SIZE` (7) runs, highlights and the chart (`map.ts`).
4. It marks reports that are no longer scheduled as `disabled`. If live Splunk lists no reports at all, it hides nothing and records an error instead: that's more likely a token that lost its access.
5. It records the finish and the time zone (`SPLUNK_TZ`) in `sync_state`, then calls `POST /api/revalidate` twice, `SECOND_REFRESH_MS` (3 s) apart, when `APP_URL` and `REVALIDATE_SECRET` are set.

**Tests:** `map.test.ts` runs `syncAll` against the fixture transport end to end.

## `settings.ts`

The sync worker's settings: **`readSyncSettings(env)`** reads `SPLUNK_MODE`, `SPLUNK_BASE_URL`, the token, `SPLUNK_TZ`, `SYNC_INTERVAL_MINUTES` and `SYNC_REPORTS`, and checks them all before the worker starts. A `SettingsError` lists every problem at once; port 8000 (Splunk Web) is a warning. **`transportFor(settings)`** is the fixture transport or `httpTransport`. Used by `worker/sync.ts` and the scripts (`splunk-check.ts`, `card-preview.ts`, `splunk-tiles.ts`). Tested in `settings.test.ts`.

## `errors.ts` (pure)

What went wrong talking to Splunk, in words someone can act on.
- **`errorMessage(error)`** is an error as text, with the cause `fetch` hides, such as a certificate it couldn't verify or `ECONNREFUSED`.
- **`setupHint(error)`** says what to check for the common setup mistakes: a token Splunk turned down (401) or that can't read something (403), nothing answering, an unknown host, a timeout, a certificate Node doesn't trust (set `NODE_EXTRA_CA_CERTS`), http and https mixed up, and a web page instead of JSON (Splunk Web on port 8000, or a proxy).
- **`describeError(error)`** is both, the hint on its own line after `→`. The worker's log and `npm run splunk:check` use it.

Tested in `errors.test.ts`.

## `check.ts`

**`checkSplunk(transport, { where, syncReports })`**, behind `npm run splunk:check`: tests the connection one step at a time, only reading. Splunk answers; the token works (`/services/authentication/current-context`: the user and its roles); the scheduled searches it can see and how many the sync takes; the cards for reports Splunk doesn't have (a warning); that a run's results can be read: the newest finished run, read with the sync's own `fetchRun`, so a run still going is skipped; and, once that passes, that every column a card names is in its report's newest results (up to `CARDS_TO_CHECK`, 50 cards). Each result is `pass`, `warn` or `fail`, with a hint for the last two. **`allPassed(results)`** is false when any failed. Tested in `check.test.ts` against the fixture transport.

## `preview.ts`

What `npm run card:preview` shows, read the way the sync reads it, without writing anything.
- **`findReport(transport, nameOrSlug, { timeZone, syncReports })`:** the scheduled report the sync would take, by its Splunk name (any capitals) or slug, and the names of all the reports it takes, which the script lists when nothing matches.
- **`newestFinishedRun(transport, report)`:** the newest of its last 10 scheduled runs that finished and still has its results, read with the sync's `scheduledRunSids` and `fetchRun`. Runs still going, failed runs and runs whose results expired are skipped.
- **`previewReport(transport, report)`:** that run, the headline numbers, chart and status the sync would work out (`deriveReportFields` in `map.ts`), whether the report has a card, and the columns the card names that the results don't have (`unknownColumns`).

Tested in `preview.test.ts` against the fixture transport.

## `tiles.ts`

Reads a Splunk dashboard's tiles for `npm run splunk:tiles`, from `/servicesNS/-/-/data/ui/views`.
- **Both kinds of dashboard:** `studioTiles(definition)` reads Dashboard Studio's JSON (its data sources, chained searches and saved-search references, and each single value's color ranges); `simpleXmlTiles(xml)` reads classic Simple XML (`<single>`, `<chart>`, `<table>`, base searches with post-process searches, `rangeValues` and `rangeColors`). `tilesOf(eaiData)` picks the right one.
- **`joinSearch(parts)`:** a base search and the steps chained onto it, as one search, adding the `|` a post-process step may leave out.
- **`inputsOf(search)`:** the dashboard inputs a search uses (`$time_tok$`), which a scheduled report can't have.
- **`findDashboard(transport, nameOrLabel)`:** a dashboard by its name or its title.
- **`guessColumn(search)` and `draftCard(tile)`:** a draft card in YAML. The column comes from the search's last step (`AS "Free GB"`, or the `stats` function). It has no `icon:`, so the app keeps guessing; `iconNote(title)` is the worksheet's line saying which icon that will be (`src/reports/icons.ts`). A single value gets `chart: none` and a `first` headline number; color ranges become a `fail` rule (the worst range) and a `warn` rule (the next one), `above` or `below` from which end is red.

Tested in `tiles.test.ts` with dashboards in both formats.

## `transport.ts`

How the worker talks to Splunk.
- **`httpTransport({ baseUrl, token, timeoutMs = 30000, retries = 3 })`** returns a `SplunkTransport`. Its `get(path, params)` calls the REST API with `Authorization: Bearer <token>`.
- **Retries:** it retries network errors, timeouts and HTTP 429, 500, 502, 503 and 504, with exponential backoff (about 0.5, 1 and 2 s) and a little jitter.
- **`SplunkHttpError`** carries the HTTP status, and `isNotFound(error)` tests for 404. Expired job results answer 404.
- **`SplunkNotJsonError`** is a reply that isn't JSON. `html` is true for a web page, whatever its status: the address is Splunk Web (usually port 8000) or a proxy, not the REST API. It's a `SplunkHttpError` too, with the status, so a proxy's 404 page still counts as not found.
- **Certificates:** for an internal certificate authority, set `NODE_EXTRA_CA_CERTS`. Never turn certificate checks off.
- **`splunkTokenFromEnv(env)`** returns `SPLUNK_TOKEN`, or else the trimmed contents of the file `SPLUNK_TOKEN_FILE` names (a mounted secret). It says which file it couldn't read. Tested in `transport.test.ts`, with a fake `fetch` for the web page cases.

## `map.ts` (pure)

Turns Splunk's REST JSON into the app's models, with no I/O, so all of it is unit-tested.

| Area | Functions |
|---|---|
| Values | `toBool`, `toCell` (keeps "007" and IPs as text), `mapResults` (drops Splunk's internal `_` fields except `_time`) |
| Schedules and times | `describeCron` (short phrasing for common schedules, `cronstrue` for the rest), `runsPerWeek`, `nextRunFromCron`, `parseSplunkTime`, `describeTimeRange` ("Last 24 hours") |
| Searches | `describeIndexes` (`index=web sourcetype=access_combined` → "web (access_combined)"), `parseRecipients`, `groupsFromRecipients` (`secops@example.com` → `secops`), `chartTypeFromDisplay` |
| Reports | `mapSavedSearch` (a saved search plus its config → `ReportMeta`). A private search with a configured name stays admin-only, so it can't take on the report's groups. |
| Runs | `isFinished`, `isFailed`, `runStatus` (applies the report's status rule), `runTime`, `mapRun` (a job → `RunFacts`) |
| Derived fields | `resolveChart` (picks the chart; results over time with several measures get `series`, a line per column), `defaultHighlights` (results with the change since the previous run, the chart's top row, and the search time), `deriveReportFields` (latest run, history, highlights, chart, for the `reports` document) |

**Change it when:** Splunk sends a field in a new shape, or a report needs a new kind of derived field. Add a test in `map.test.ts` with the real JSON.

## `types.ts`

Only the REST fields the sync reads:
- `SplunkFeed<T>` and `SplunkEntry<T>`, Splunk's envelope;
- `SavedSearchContent`, `HistoryContent`, `JobContent`, `JobMessage`, `ResultsResponse`, `AppContent`;
- `SplunkAcl`;
- `SplunkBool`: Splunk sends booleans as `true`/`false` or `"0"`/`"1"`.

Most values arrive as strings, so `map.ts` converts defensively.

## `fixtures/reports.ts`

The 10 dummy reports the demo runs on.
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

`SPLUNK_MODE=fixture` (the default) uses it, so the whole pipeline runs without Splunk. It exports `TIME_RANGES` and `CHARTS`, which the Splunk example reuses.

## `example/`: the Splunk example's reports and logs

For the real-Splunk example ([splunk-example.md](../splunk-example.md)). The app never imports it.
- **`searches.ts`:** `exampleSearches()` gives six of the dummy reports as Splunk saved searches. Each has the fixture SPL plus a last step that names the columns the way its card in `config/report-cards.yaml` expects, and also the report's time range, recipients and chart. `EXAMPLE_INDEXES` lists the indexes the logs go to.
- **`events.ts` (pure):** `eventsForMinute(minute, { live, now })` makes one minute of dummy logs, seeded so a given minute always comes out the same. The logs are Windows and SSH sign-ins, web requests, firewall denies, disk space, and group changes.
  - Planted on purpose: web-03 over the error budget, db-02's `/data` at 96%, and db-03 and app-07 going quiet.
  - Password spraying happens at half past each hour, from the feeder only.
  - The backfill sends the busy logs for the last 4 hours only.
- **Tested** in `events.test.ts`:
  - documentation IPs only;
  - each sourcetype's time format;
  - the indexes;
  - the planted problems.
