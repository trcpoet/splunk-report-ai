# `src/splunk/`: copying Splunk's reports into MongoDB

The sync worker (`worker/sync.ts`, `npm run sync`) uses these files. The website never talks to Splunk.
- `settings.ts` reads and checks the worker's settings (`SPLUNK_MODE`, `SPLUNK_BASE_URL`, the token, `SYNC_REPORTS`).
- `transport.ts` calls Splunk's REST API; `fixtures/` answers the same calls with the dummy reports.
- `sync.ts` lists the scheduled reports, fetches their new runs and saves them.
- `map.ts` turns Splunk's answers into the app's reports: schedules, statuses, charts, headline numbers.
- `errors.ts` explains what went wrong, and `check.ts` is `npm run splunk:check`.
- `example/` is the Splunk example's reports and logs ([docs/splunk-example.md](../../docs/splunk-example.md)).

**Open first:** `sync.ts`.

**Tests:** the `*.test.ts` next to each file; `map.test.ts` runs the whole sync against the dummy reports. **More:** [docs/reference/splunk.md](../../docs/reference/splunk.md).
