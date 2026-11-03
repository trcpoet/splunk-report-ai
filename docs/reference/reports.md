# `src/reports/`: the report list, report pages, charts and statistics

Everything about reports: reading them (with the access check), the report types, the statistics behind unusual runs and the home page's charts, and the components that show them. The settings for each report are its card in `config/report-cards.yaml`, which `report-config.ts` and `cards/` load; what each report shows is in the [report catalog](../report-catalog.md).

Files marked **server-only** start with `import 'server-only'`, so importing them into browser code fails the build. Files marked **pure** do no I/O and are unit-tested in the `*.test.ts` next to them. In `components/`, **client** files start with `'use client'` and run in the browser too; **server** components run only on the server.

Back to the [file reference](README.md).

## Reading reports

### `dal.ts` (server-only)

**The data access layer.** Every page and API route gets report data only from here, and every exported function checks who is asking.

| Function | Returns | Notes |
|---|---|---|
| `getViewerOrNull()` | The signed-in `Viewer` (`id`, `name`, `email`, `role`, `groups`), or `null` | `'use cache: private'`: kept in that person's browser for 5 minutes, never on the server. A user with no `user_access` record gets no groups, and so sees nothing until one is added. |
| `getViewer()` | The `Viewer` | For pages: signed-out visitors are redirected to `/login`. Wrapped in React `cache()`, so one request reads it once. |
| `getVisibleReports()` | `ReportListItem[]`, title order | Every report the viewer may see, without result rows. |
| `getVisibleReport(slug)` | `SplunkReport` with `columns` and `rows`, or `null` | `null` for missing **and** hidden, so a hidden report looks missing. |
| `getVisibleReportsWithResults()` | `SplunkReport[]` | Every visible report with its latest results, for the AI's context. |
| `getReportSyncError(slug)` | `string` or `null` | Why the last sync couldn't refresh this report. Admins only: the text comes from Splunk's answers. |
| `getRunOutcomes(days = 7)` | `RunOutcomeDay[]` | Runs per day by outcome across the viewer's reports, for the home page chart. The days end on the newest day with a run. |
| `getRunHealth(days = 7)` | `RunHealth` (`days`, `rows`) | The same days and runs, per report: the home page's run health grid. |
| `getScheduleLoad()` | `ScheduleLoad` | How many of the viewer's reports' searches run at once, by time of day, in the schedules' time zone (`src/reports/schedule-load.ts`). |
| `getSyncInfo()` | `{ mode, lastSuccessAt, lastError, timeZone }` or `null` | For "Data as of", for `aiStatus()` (live data keeps AI off), and the scheduler chart's time zone (`UTC` until a sync saves one). |

- **`getSyncNotice()`:** why the reports may be out of date, or `null`, for `SyncNotice`. It uses `syncProblem`; the detail is for admins only.
- **Once per request:** `getVisibleReports` and the run counts behind the two home page views are wrapped in React `cache()`, since the home page's parts each ask for them.
- **Behind them:** five cached loaders, not exported, each with `'use cache'`, tag `reports` and `cacheLife('minutes')`.
  - `loadReports` loads every enabled report once for all viewers, with the ML scores attached as `modelRun` and `attention`.
  - The others are `loadResults(sid)`, `loadRunCounts()`, `loadSyncInfo()` and `loadScheduleLoad(schedules, timeZone)`. The last one is cached per set of reports, because laying out a month of runs takes some milliseconds.
- **Clearing them:** the sync and the ML job clear them all through `/api/revalidate`.
- **Cached values must be plain** (no ObjectIds), which is why `toListItem` copies each field.
- **Used by:** every page and route that shows report data, plus `src/ai/chats.ts`, `src/ai/feedback.ts` and `src/ai/turn.ts`.
- **Change it when:** a page needs a new view of the data. Add an exported function that starts with `getViewer()`, and filter with `canView`.

## Reports and statistics

### `reports.ts` (pure)

The report types shared by the app and the worker:
- `SplunkReport`, `ReportListItem`, `ReportSummary`;
- `RunRecord`, `ReportHighlight`, `ReportChart` (with `ChartThreshold`, `ChartPanel`, `ChartScatter`);
- `ModelRun`, `RunOutcomeDay`, `OutcomeCounts`, `RunHealth`, `RunHealthRow`, `SyncInfo`, `ReportStatus`, `ReportHealth` (a status, or `none` before a run is stored), `ReportCategory`;
- `MAX_CHART_BARS`, `MAX_CHART_POINTS`, `MAX_CHART_SERIES`: the most a chart draws.

Helpers:
- **`toSummary(report)`:** the fields the browser gets for lists, plus `headline`: the first highlight (label, value, note) for the card, or `null` before the first results. Its `from` is the results' run time when that's older than the last run.
- **`sortByLastRun(reports)`:** the list's order: newest last run first, no run last, ties by title.
- **`paginate(items, page, size = REPORTS_PER_PAGE)`:** one page (20 by default) with where it is (`first`, `last`, `total`, `pages`). A page past the end shows the last one.
- **`getCategories(reports)`:** in a fixed order.
- **`getSimilarReports(report, reports, limit = 3)`:** same category or shared tags.
- **`needsAttention(report)`:** warning or failed. One rule for the home page's count, the briefing, the suggestions and the Reports button.
- **`getReportStats(reports)`:** the headline numbers.
- **`syncProblem(sync, now, staleHours = 2)`:** why the reports may be out of date, or `null`. Dummy data never counts as stale.

### `report-config.ts`

Loads the report cards (`config/report-cards.yaml`) for the sync and the scripts, and holds the types they become: `ReportConfig`, `StatusRule`, `HighlightRule`, `ResultSet`.
- **`reportConfig()`:** the settings the sync uses, keyed by each report's Splunk name: slug, category, tags, `groups`, `chart`, `index`, `statusRule`, `highlights`. **`reportCards()`:** the cards as written, for `card:preview` and `splunk:check`.
- **Read again when the file changes,** so `npm run sync:watch` picks up an edit at its next sync. A mistake throws a `ReportCardsError` that lists every problem.
- **Who loads it:** the sync worker (`src/splunk/sync.ts`) and the scripts; the web app only reads the results. No `server-only` or `next/*` imports.
- **Change it when:** a card needs a setting the sync doesn't have yet. To add or change a report's card, edit `config/report-cards.yaml` instead: [adding-report-cards.md](../adding-report-cards.md), and every field in [configuration.md](../configuration.md#report-cards-configreport-cardsyaml). Access in practice: [report-access.md](../report-access.md).
- **Tests:** `report-config.test.ts` (the file is read again after a change).

### `cards/`: the cards file, checked and turned into rules

- **`schema.ts`:** what a card may hold, as zod schemas (`ReportCard`, `ReportCardsFile`), with a description on each field. Unknown fields are refused, and two cards can't share a slug. Its error messages say what a field can be.
- **`json-schema.ts`:** `cardsJsonSchema()`, the same rules as JSON Schema. `npm run cards:schema` writes it to `config/report-cards.schema.json`, which editors use to check the file as you type.
- **`load.ts`:** `loadReportCards(file)` and `parseReportCards(text)` read the YAML, check it, and turn each card into a `ReportConfig`. `reportCardsPath()` is `REPORT_CARDS_FILE` or `config/report-cards.yaml`. Problems come as one `ReportCardsError`, each with where it is ("Web Server 5xx Error Rate → warn → when: …").
- **`rules.ts` (pure):** turns a card's `highlights`, `warn` and `fail` into the functions the sync runs (`compileHighlights`, `compileStatusRule`, `toReportConfig`), and fills message placeholders (`fill`: `{Column}`, `{Column|number}`, `{Column|2}`, `{Column|hours}`, `{count}`, `{list}`).
- **`columns.ts` (pure):** `columnsUsed(card)`, every results column a card names, so `card:preview` and `splunk:check` can catch a misspelled one.
- **`custom.ts`:** TypeScript rules a card can name with `custom:`, for what the file can't say. Empty for now.
- **Tests:** `rules.test.ts` covers every building block. `load.test.ts` checks the real file (a card for every dummy report, limits that agree, the JSON Schema up to date) and the error messages.

### `insights.ts` (pure)

Plain statistics, with no AI and no ML library.
- **`findUnusualRun(history, modelRun)`:** whether the newest run stands out from at least `MIN_BASELINE` (4) earlier successful runs.
  - It uses the robust score (`robustScore`, median and MAD) of the result count and search time, with `UNUSUAL_SCORE` (3.5) as the bar.
  - Failing that, the ML job's view of the run counts.
  - It returns `null` for a failed run (its status already says so).
  - Otherwise it returns a plain-words message, the usual value, and who flagged it.
- **`unusualTrend(history, run)`:** the sparkline data.
- **`profileResults(columns, rows, total)` and `describeColumn(column, rows)`:** one sentence per results column, for Explain's "At a glance".
- **Used by:** `Briefing`, `ExplainButton`, `src/ai/context.ts`, `src/ai/feedback.ts`.
- **`ml/features.py` repeats these rules.** Change both together; a test checks they agree.

### `run-health.ts` (pure)

The runs behind the home page's "Scheduled runs per day" chart and its run health grid.
- **`lastDays(counts, days)`:** the UTC days up to the newest day with a run. Both views use it, so they show the same days.
- **`totalsByDay(counts, days)`:** each day's runs by outcome, all reports together.
- **`worstStatus(counts)`:** failed beats warning beats healthy; no runs is `null`.
- **`runHealthRows(reports, counts, days)`:** a row per report, failures first, then warnings, then by title.
- **One pass:** the counts cover the whole retention period, so both add them up in a single pass over the days shown, not once per cell.
- **Also exports:** the `RunCount` type, which `dal.ts`'s `loadRunCounts()` returns.
- **Tests:** `run-health.test.ts`.

### `schedule-load.ts` (pure)

`scheduleLoad(reports, timeZone, slotMinutes = 5)`: how many of the reports' searches run at once, by time of day, for the "When searches run" chart.
- **How:** each report's cron is laid out over a reference month, January 2024. It starts on a Monday, so weekly and monthly schedules count. Each run lasts the report's usual run time: the `median` of its finished runs in `history`, in whole minutes. Runs from December 31 carry on past midnight into the 1st.
- **In UTC, whatever the time zone:** crons are clock times, so with no daylight-saving change, every zone gives the same times of day. The zone only labels the chart. croner's `utcOffset: 0` is also about 30 times faster than its `timezone` option.
- **The result:** 288 five-minute slots, each with the most searches at once on its busiest day and the reports running then, plus:
  - `busiest`: the two highest counts, with every time of day they happen, and on which days in words ("Mondays", "weekdays", "once a month"). Neighboring slots are joined only for the same searches on the same days.
  - `onTheHour` of `total`: reports that only ever start at :00. A search every few minutes doesn't count, since moving it wouldn't help.
- **Left out:** a cron croner can't read, and a schedule that never runs in January (yearly, or only in other months).
- **Tests:** `schedule-load.test.ts`, with the demo reports.

## `components/`: the list, cards and report page

### `ReportBrowser.tsx` (client)

The report list on the home page.
- **Order and pages:** newest last run first (`sortByLastRun`), `REPORTS_PER_PAGE` (20) cards a page (`paginate`), with a `Pager` below once there are more. "Showing 21 to 40 of 312 reports" says where you are. Another page scrolls to the top of the list and puts the keyboard focus on its first card; the "Showing" line is read out by itself (`aria-live`).
- **Controls:** a search box, plus status and category filter chips. "No runs yet" appears when some report hasn't run. A new search or filter starts again at page 1.
- **Props:** `reports` (summaries), `categories`.
- **`/#reports` links** ("All Reports") land on the list even when it streams in late, or comes back from the page cache.

### `ReportCard.tsx` (client)

One report as a card: title, status, its headline number from the newest results (`headline`, such as "Overall error rate 1.21%, Budget: 2%"), schedule and run dots. When the last run had no results (it failed, or its results expired), the card says which run the number is from.
- **Prefetching:** every card prefetches the report page's shell. Pointing at a card (hover, focus, touch) also prefetches its content, so it opens at once.
- **Explain** sits on top of the card's corner, since a button can't go inside a link.
- **Loading bar:** a thin bar fades in while the report is still on its way.
- **Used by:** `ReportBrowser`, and "Related reports" on a report page.

### `StatusBadge.tsx` (server)

Healthy, Warning, Failed or No runs yet, with its dot.

### `RunHistory.tsx` (server)

The row of colored dots for the last runs on a card ("Last 7 runs"). Nothing until the first run.

### `ResultsTable.tsx` (client)

The results table, built on TanStack Table v9.
- **Sorting:** click a header. Numbers start largest, text A to Z, and a third click restores the order.
- **Numbers Splunk sent as text** ("$1,234", "1.84%", "12G") sort by value (`parseNumber`).
- **Props:**
  - `filterable` adds a filter box;
  - `sortValues` gives a column a separate sort key, such as raw times behind "Oct 2, 09:00 UTC".
- **Alignment:** numeric columns are right-aligned.
- **Pages:** 50 rows at a time, with a `Pager` once there are more. Sorting and filtering cover every row.
- **Splunk times:** `_time` shows as "Time", in UTC with its seconds, and sorts by the raw value (`formatCell`, `columnLabel`).

### `Pager.tsx` (client)

Previous and Next with where you are ("Rows 1 to 50 of 312", "Page 2 of 16"), for the results table and the report list. The buttons use `aria-disabled`, not `disabled`, so the keyboard focus stays on them at either end.

### `ReportActions.tsx` (client)

**Download CSV** (built in the browser from the rows) and **Copy SPL**. Each confirms for a moment; a failed copy says so. `explain` goes under Copy SPL: the report page puts **Explain report and SPL** there.

## `components/`: charts

All charts use Recharts through shadcn's wrapper (`src/shared/ui/chart.tsx`) and the shared styling in `src/shared/chart-theme.ts`. Each has a table with the same values next to it.

### `ReportChart.tsx` (client)

The results chart: one measure, in one color, as bars, columns, lines or areas.
- **Options from the report's card:**
  - a `threshold` line, with the values past it in the warning color;
  - `max`, which turns bars into meters;
  - `panels`, which draws small multiples.
- **Labels:** only the largest value and the values past the threshold get one.
- **Over time (`LineSeriesChart`):** results with `_time` first draw as lines with a legend, one per `series` column in `--chart-1` to `--chart-5`, always in that order: it's what's validated for color-blind readers. Other measures, and Splunk's own `OTHER` and `NULL` columns, add up to a neutral "Other" line. An empty cell is a gap, not a zero. Up to 4 lines get their names at their ends where those fit.
- **Limits:** at most 25 bars (the first rows) or 500 points, with a note saying so. A line over time is sorted by time and keeps the newest; rows with no time, such as totals, are left off it.

### `ReportScatter.tsx` (client)

A dot per row: the chart's measure up, the scatter's measure across, with an optional log axis. On phones, only the key dots get a name. It draws the 500 rows with the largest values, with a note saying so.

### `RunTrend.tsx` (client)

Results per stored run, oldest to newest. Skipped runs are gaps, not zeros.

## `overview/`: the home page's charts and notices

### `RunOutcomes.tsx` (client)

Scheduled runs per day by outcome, as stacked bars, on the home page. Status colors always come with a text label.

### `RunHealthGrid.tsx` (server)

The home page's run health grid: a row per report, a column per day (the same days as `RunOutcomes`), and the worst outcome of each day's runs.
- **A real table:** the report titles are row headers that link to the report. Each cell has its counts ("Oct 2: 3 healthy, 3 warnings, 1 failed") as hidden text for screen readers and as a `data-tip` on hover.
- **Marks:** a status color with an icon (check, triangle, X), or an outline for a day without runs. A legend names them.
- **Order:** failures first, then warnings, then the rest by title (`src/reports/run-health.ts`).
- **More than `VISIBLE_ROWS` (10) reports:** the rest sit behind "Show N more reports".
- **On phones:** titles take two lines; below 360 px the weekdays shorten to two letters.

### `SchedulerLoad.tsx` (client)

"When searches run": a step line of the most searches running at once by time of day, in the schedules' time zone (`src/reports/schedule-load.ts`).
- **The tooltip** names the reports running at that time.
- **Under the chart:**
  - the busiest times, grouped by how many run at once;
  - a hint when most reports start on the hour;
  - a note that only this app's reports are counted.
- **Show as table:** every time with a search running, sortable.

### `SyncNotice.tsx` (server)

On the home page, says when the reports may be out of date: the last sync had problems, or live data stopped arriving. Admins also see the reason (`getSyncNotice`).
