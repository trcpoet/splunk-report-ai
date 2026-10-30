# `lib/`: shared logic

Code shared by pages, API routes, the sync worker, the scripts and the tests. AI code is in [lib-ai.md](lib-ai.md), and Splunk code in [lib-splunk.md](lib-splunk.md). Back to the [file reference](README.md).

Files marked **server-only** start with `import 'server-only'`, so importing them into browser code fails the build. Files marked **pure** do no I/O and are unit-tested in the `*.test.ts` next to them.

## Data access

### `dal.ts` (server-only)

**The data access layer.** Every page and API route gets report data only from here, and every exported function checks who is asking.

| Function | Returns | Notes |
|---|---|---|
| `getViewerOrNull()` | The signed-in `Viewer` (`id`, `name`, `email`, `role`, `groups`), or `null` | `'use cache: private'`: kept in that person's browser for 5 minutes, never on the server. A user with no `user_access` record gets no groups, and so sees nothing until one is added. |
| `getViewer()` | The `Viewer` | For pages: signed-out visitors are redirected to `/login`. Wrapped in React `cache()`, so one request reads it once. |
| `getVisibleReports()` | `ReportListItem[]`, title order | Every report the viewer may see, without result rows. |
| `getVisibleReport(slug)` | `SplunkReport` with `columns` and `rows`, or `null` | `null` for missing **and** hidden, so a hidden report looks missing. |
| `getVisibleReportsWithResults()` | `SplunkReport[]` | Every visible report with its latest results, for the AI's context. |
| `getRunOutcomes(days = 7)` | `RunOutcomeDay[]` | Runs per day by outcome across the viewer's reports, for the home page chart. The days end on the newest day with a run. |
| `getRunHealth(days = 7)` | `RunHealth` (`days`, `rows`) | The same days and runs, per report: the home page's run health grid. |
| `getScheduleLoad()` | `ScheduleLoad` | How many of the viewer's reports' searches run at once, by time of day, in the schedules' time zone (`lib/schedule-load.ts`). |
| `getSyncInfo()` | `{ mode, lastSuccessAt, lastError, timeZone }` or `null` | For "Data as of", for `aiStatus()` (live data keeps AI off), and the scheduler chart's time zone (`UTC` until a sync saves one). |

- **Behind them:** five cached loaders, not exported, each with `'use cache'`, tag `reports` and `cacheLife('minutes')`.
  - `loadReports` loads every enabled report once for all viewers, with the ML scores attached as `modelRun` and `attention`.
  - The others are `loadResults(sid)`, `loadRunCounts()`, `loadSyncInfo()` and `loadScheduleLoad(schedules, timeZone)`. The last one is cached per set of reports, because laying out a month of runs takes some milliseconds.
- **Clearing them:** the sync and the ML job clear them all through `/api/revalidate`.
- **Cached values must be plain** (no ObjectIds), which is why `toListItem` copies each field.
- **Used by:** every page and route that shows report data, plus `lib/chats.ts`, `lib/feedback.ts` and `lib/ai/turn.ts`.
- **Change it when:** a page needs a new view of the data. Add an exported function that starts with `getViewer()`, and filter with `canView`.

### `access.ts` (pure)

`canView(viewer, allowedGroups)`: admins see every report; anyone else sees a report when one of their groups is in its `allowedGroups`. That's the whole rule.
- **Also exports:** the `Role` (`admin` | `viewer`) and `Viewer` types.
- **Used by:** `dal.ts`, `chats.ts`, `feedback.ts`, `spl-examples.ts`, the AI code.
- **Tests:** `access.test.ts` checks every demo user against every dummy report.

### `mongodb.ts`

`connectDB()`: one Mongoose connection, cached on `global` so dev hot reloads reuse it.
- **Timeout:** inside Next.js (`NEXT_RUNTIME` set), it gives up after 5 s, so pages show an error instead of hanging. The worker keeps the driver's 30 s, to ride out an Atlas election.
- **Also exports:** `disconnectDB()`, for scripts.
- **No `server-only` and no `next/*` imports:** the worker and the scripts load it too.

## Sign-in and sessions

### `auth-options.ts`

Better Auth's settings, shared by the web app and the seed script: the app name, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the MongoDB adapter.
- **The adapter** gets only the database, which keeps transactions off. A standalone `mongod` doesn't support them.
- **Also exports:** `closeAuthDatabase()` for scripts.
- **No `next/*` imports**, so plain Node can load it.

### `auth.ts` (server-only)

The web app's Better Auth instance, with **sign-up turned off**. Accounts come from `npm run seed`, later from the company's identity provider, so nobody can register `admin@example.com` and inherit its access.
- **Used by:** `dal.ts`, `app/api/auth/[...all]/route.ts`.

### `auth-client.ts`

Better Auth in the browser: `authClient`, on the same origin. Used by `LoginForm` and `SignOutButton`.

### `session-sync.ts`

Signing in or out in one tab reloads the app's other tabs, through a `BroadcastChannel`. A full page load drops pages cached for the previous session.
- **Exports:** `announceSessionChange()`, `onSessionChange(callback)`.
- **Used by:** `LoginForm`, `SignOutButton`, `AutoRefresh`.

### `next-path.ts` (pure)

`safeNextPath(next)`: where to go after signing in. Only paths on this site; it catches tricks like `/\evil.com`. Tested.

### `demo-users.ts`

`DEMO_USERS`: the five demo accounts, with name, role and groups. Their groups match the dummy reports' email lists, so each account sees a different set.
- **Used by:** `scripts/seed-demo-users.ts` (creates them) and `app/login/page.tsx` (lists them in demo mode).
- **Change it when:** you want other demo accounts. Then run `npm run seed`.

## Chats, votes and saved examples

### `chats.ts` (server-only)

Saved Ask AI chats. Every function checks the owner; for anyone else, a chat doesn't exist. Page reads start with `connection()`, because chats aren't cached.

| Export | What it does |
|---|---|
| `listChats(limit = 200)` | The viewer's chats, newest first, each with a one-line `preview` and a `group` (Today, Yesterday, Last 7 days, Older). Wrapped in React `cache()`, so the sidebar and the chats page share one read. |
| `getChat(id)` | One chat with its messages, or `null` (missing, someone else's, not an id). |
| `saveTurn(viewer, { chatId, kind, question, answer })` | Saves a question and its answer together, in one update. A new chat is upserted. A full chat, or someone else's, saves nothing and returns `null`. |
| `renameChat(id, title)`, `deleteChat(id)` | Owner-checked. |
| `isOwnAnswer(messageId)` | Whether an answer is in one of the viewer's chats, for votes. |
| `turnsLeft(chat)`, `chatTitle(question)`, `newChatId()`, `chatGroup(updatedAt, now)`, `CHAT_ID` | Helpers. `CHAT_ID` is the 24-hex-digit id pattern every input is checked against. |

- **Demo mode:** with `DEMO_MODE`, new chats get `expiresAt` 24 h out, and MongoDB deletes them.
- **Also exports:** the `ChatMessage`, `ChatDetail`, `ChatSummary` and `ChatGroup` types, which client components import as types only.

### `chat-list.ts` (pure)

The sidebar's list in the browser.
- **`mergeChats(server, saved)`** adds chats saved since the page loaded, and moves a chat with a newer answer to the top. For a chat in both lists, the server's title wins, since it may have been renamed.
- **`idTime(id)`** reads the server's clock out of a MongoDB id, so the order doesn't depend on the browser's clock.
- **Tests:** `chat-list.test.ts`.

### `feedback.ts` (server-only)

👍 / 👎 votes, one per person per thing.
- **`saveVote(viewer, { kind, targetId, value })`** works out on the server what the vote is about:
  - an answer in the viewer's own chats;
  - a saved summary of a report they can see;
  - a flag the briefing shows them now.
  For a flag it records the details (reason, measure, scores), which are the ML job's labels.
- **`getVotes(viewer, kind, ids)`** returns the viewer's votes, by target id.
- **Used by:** `voteAction`, `Briefing`, `AiChat`, `lib/ai/summaries.ts`.

### `spl-examples.ts` (server-only)

Write SPL's examples, used for retrieval: the viewer's reports' searches, plus searches people saved with **Save as example**.
- **A saved search** is shared with the groups of the person who saved it. Admins see them all.

| Export | What it does |
|---|---|
| `findSimilarExamples(viewer, request)` | The `SIMILAR_EXAMPLES` (5) closest examples to the request. Throws when the AI can't embed right now; the route then writes the prompt without them. |
| `saveExample(viewer, messageId)` / `removeExample(viewer, messageId)` | Saves an answer from the viewer's own chats, if it only reads data and parses, or takes it back. |
| `savedExampleIds(viewer, ids)` | Which of these answers the viewer has saved. |

- **Embeddings:** example vectors are cached in `ai_embeddings`, so each text is embedded once; requests are embedded fresh. At most `MAX_SAVED` (500) saved searches are considered.

## Reports and statistics

### `reports.ts` (pure)

The report types shared by the app and the worker:
- `SplunkReport`, `ReportListItem`, `ReportSummary`;
- `RunRecord`, `ReportHighlight`, `ReportChart` (with `ChartThreshold`, `ChartPanel`, `ChartScatter`);
- `ModelRun`, `RunOutcomeDay`, `OutcomeCounts`, `RunHealth`, `RunHealthRow`, `SyncInfo`, `ReportStatus`, `ReportCategory`.

Helpers:
- **`toSummary(report)`:** the fields the browser gets for lists.
- **`getCategories(reports)`:** in a fixed order.
- **`getSimilarReports(report, reports, limit = 3)`:** same category or shared tags.
- **`needsAttention(report)`:** warning or failed. One rule for the home page's count, the briefing, the suggestions and the Reports button.
- **`getReportStats(reports)`:** the headline numbers.

### `report-config.ts`

What Splunk doesn't know about each report, keyed by the saved search's name: slug, category, tags, `groups`, `chart`, `index`, `statusRule`, `highlights`.
- **Who loads it:** the sync worker applies it (`lib/splunk/map.ts`, `lib/splunk/sync.ts`); the web app only reads the results. No `server-only` or `next/*` imports.
- **Shared limits:** named constants (`ERROR_BUDGET_PCT`, `DISK_CRITICAL_PCT`, …) keep a status rule and its chart in agreement.
- **Change it when:** you add a report or change its rules. Every field, and the steps: [configuration.md](../configuration.md#reports-libreport-configts). Access in practice: [report-access.md](../report-access.md).

### `insights.ts` (pure)

Plain statistics, with no AI and no ML library.
- **`findUnusualRun(history, modelRun)`:** whether the newest run stands out from at least `MIN_BASELINE` (4) earlier successful runs.
  - It uses the robust score (`robustScore`, median and MAD) of the result count and search time, with `UNUSUAL_SCORE` (3.5) as the bar.
  - Failing that, the ML job's view of the run counts.
  - It returns `null` for a failed run (its status already says so).
  - Otherwise it returns a plain-words message, the usual value, and who flagged it.
- **`unusualTrend(history, run)`:** the sparkline data.
- **`profileResults(columns, rows, total)` and `describeColumn(column, rows)`:** one sentence per results column, for Explain's "At a glance".
- **Used by:** `Briefing`, `ExplainButton`, `lib/ai/context.ts`, `lib/feedback.ts`.
- **`ml/features.py` repeats these rules.** Change both together; a test checks they agree.

### `run-health.ts` (pure)

The runs behind the home page's "Scheduled runs per day" chart and its run health grid.
- **`lastDays(counts, days)`:** the UTC days up to the newest day with a run. Both views use it, so they show the same days.
- **`countsOn(counts, day, slug?)`:** a day's runs by outcome, for one report or all.
- **`worstStatus(counts)`:** failed beats warning beats healthy; no runs is `null`.
- **`runHealthRows(reports, counts, days)`:** a row per report, failures first, then warnings, then by title.
- **Also exports:** the `RunCount` type, which `dal.ts`'s `loadRunCounts()` returns.
- **Tests:** `run-health.test.ts`.

### `schedule-load.ts` (pure)

`scheduleLoad(reports, timeZone, slotMinutes = 5)`: how many of the reports' searches run at once, by time of day, for the "When searches run" chart.
- **How:** each report's cron is laid out over a reference month, January 2024. It starts on a Monday and has no daylight-saving change in most zones, so weekly and monthly schedules count. Each run lasts the report's usual run time: the `median` of its finished runs in `history`, in whole minutes.
- **The result:** 288 five-minute slots, each with the most searches at once on its busiest day and the reports running then, plus:
  - `busiest`: the two highest counts, with every time of day they happen. Neighboring slots are joined.
  - `onTheHour` of `total`: reports that start at :00.
- **Speed:** croner's `utcOffset` with January's offset, which is about 30 times faster than its `timezone` option and gives the same runs. A cron croner can't read is skipped.
- **Tests:** `schedule-load.test.ts`, with the demo reports.

### `format.ts` (pure)

Dates and numbers, always in UTC with fixed English month names, so the server and the browser print the same text.
- **Exports:** `formatDateTime`, `formatDay`, `formatTime`, `formatClock`, `formatDuration`, `formatNumber`, `formatCompact`, `parseNumber`, `plural`, `firstLine`.
- **`formatClock(minutes)`** writes minutes after midnight as a time of day: 480 is "08:00".
- **`parseNumber`** reads Splunk's text numbers ("$1,234", "1.84%", "12G").
- **Rule:** use these instead of `toLocaleString`, which differs between server and browser.

## Look and analytics

### `chart-theme.ts`

Shared chart styling, following the dataviz rules: recessive axes, hairline gridlines, text in text colors, the threshold line, the bar size. Used by every chart component.

### `analytics.ts`

`track(event, properties)`: sends a PostHog event, only once PostHog has loaded, which needs `NEXT_PUBLIC_POSTHOG_KEY`. Events include `ai_question_asked`, `ai_vote` and `report_explained`.

### `utils.ts`

`cn()`, which joins class names (`clsx` plus `tailwind-merge`), for shadcn's `components/ui/`.

## Tests

`npm test` runs every `lib/**/*.test.ts` with Node's test runner through `tsx`. Tests are named as sentences.
- **Here:** `access`, `chat-list`, `format`, `insights`, `next-path`, `run-health`, `schedule-load`.
- **AI:** `ai/config`, `ai/context`, `ai/keys`, `ai/report-links`, `ai/retrieval`, `ai/spl`, `ai/stream`, `ai/suggestions`, `ai/validate`.
- **Splunk:** `splunk/map`. This one runs the whole sync pipeline against the fixtures.
