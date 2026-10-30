# `database/`: the Mongoose models

One file per MongoDB collection, all in the `splunkevents` database. MongoDB itself enforces no schema; these Mongoose models check it in code. Who writes and reads each collection is in [architecture.md](../architecture.md#where-data-lives), and a plain-language introduction to MongoDB is in [mongodb-and-access.md](../mongodb-and-access.md). Back to the [file reference](README.md).

Code never imports a model file directly: it imports from `database/index.ts`, which exports every model and its types. Models are created once (`models.X || model(...)`), so dev hot reloads don't redefine them.

| File | Collection | Key | Kept |
|---|---|---|---|
| `report.model.ts` | `reports` | `slug` (unique) | Kept; `disabled` once no longer scheduled |
| `report-run.model.ts` | `report_runs` | `sid` (unique) | `RUN_RETENTION_DAYS` (TTL on `runAt`) |
| `sync-state.model.ts` | `sync_state` | `_id: 'splunk'` | One document |
| `user-access.model.ts` | `user_access` | `email` (unique, lowercase) | Until changed |
| `chat.model.ts` | `chats` | `_id`; indexed by `userId` + `updatedAt` | Until deleted; `expiresAt` (TTL) in demo mode |
| `ai-usage.model.ts` | `ai_usage` | `_id: '<userId>:<YYYY-MM-DD>'` or `'site:<YYYY-MM-DD>'` | 7 days (TTL) |
| `ai-summary.model.ts` | `ai_summaries` | `_id`: the cache key from `lib/ai/keys.ts` | 30 days (TTL) |
| `ai-feedback.model.ts` | `ai_feedback` | `userId` + `kind` + `targetId` (unique) | Kept |
| `ai-embedding.model.ts` | `ai_embeddings` | `_id`: a hash of the model, size, purpose and text | 90 days (TTL) |
| `spl-example.model.ts` | `spl_examples` | `_id`: the answer's message id | Until taken back |
| `ml-score.model.ts` | `ml_run_scores`, `ml_report_scores` | `_id`: the run's sid; the report's slug | Replaced by each ML run |

Better Auth keeps its own `user`, `session`, `account` and `verification` collections, through `lib/auth-options.ts`.

## `report.model.ts`

One report per Splunk scheduled search. The sync upserts it by slug and recomputes the derived fields on every run.
- **From Splunk:**
  - `splunk` (name, app, app label, owner, sharing, read roles);
  - `title`, `description`, `spl`, `cron`, `schedule` (text), `runsPerWeek`, `timeRange`, `index`, `recipients`, `nextRun`.
- **From `report-config`:** `category`, `tags`, `allowedGroups` (indexed), `chart`.
- **Derived:**
  - `latest`, the newest run with its status message;
  - `history`, the last 7 runs;
  - `results`, the run whose rows the page shows;
  - `highlights`.
- **Housekeeping:** `syncedAt`, `syncError`, `disabled`.
- **Result rows aren't here.** They live in `report_runs`, so the report list stays small.

## `report-run.model.ts`

One document per scheduled run (a Splunk search job), keyed by `sid`. This is the long-term history: Splunk deletes job results after `dispatch.ttl`.
- **Fields:**
  - `reportSlug`, `runAt`, `dispatchState`, `status`, `statusMessage`, `durationSec`, `resultCount`;
  - `hasResults`, `resultsExpired`, `truncated` (more than `SYNC_MAX_ROWS` rows);
  - `columns`, `rows`;
  - `syncedAt`.
- **Indexes:**
  - `{ reportSlug, runAt }` for a report's runs;
  - a TTL index on `runAt` from `RUN_RETENTION_DAYS`. The index is created once, so set the variable before the first sync.

## `sync-state.model.ts`

A single document (`_id: 'splunk'`) describing the latest sync: `mode` (`fixture` or `live`), `timeZone` (the worker's `SPLUNK_TZ`, default `UTC`), `lastStartedAt`, `lastFinishedAt`, `lastSuccessAt`, `lastError`, and `counts` (`reports`, `newRuns`, `errors`). It powers "Data as of", tells the app whether its data is live (which keeps AI off unless allowed), and gives the home page's scheduler chart its time zone. Exports `SYNC_STATE_ID`.

## `user-access.model.ts`

Who may see which reports, kept apart from Better Auth's `user` record, so changing the auth library or the identity provider never touches access.
- **Fields:** `email` (unique, lowercase), `role` (`admin` or `viewer`), `groups`, `source` (`seed`, `idp` or `manual`).
- **No record means no groups:** a user without one sees no reports.

## `chat.model.ts`

One saved Ask AI conversation. The messages live inside the chat, because they're always read together and there are at most `MAX_CHAT_MESSAGES` (100) of them.
- **Chat fields:** `userId`, `kind` (`reports` or `spl`), `title`, `messages`, `expiresAt` (demo mode), plus timestamps.
- **Message fields:** `role`, `text`, `createdAt`, and for Write SPL, `spl`.
  - `spl` holds the summary, steps, time range, fields, assumptions and follow-ups;
  - plus `validation` (the parser's verdict) and `basedOn` (the examples used).
- **Exports:** `ChatKind`, `IChat`, `IChatMessage`, `MAX_CHAT_MESSAGES`.
- **Access:** only `lib/chats.ts` reads and writes it, and it checks `userId` every time.

## `ai-usage.model.ts`

How many AI requests each account, and the whole site, made on a day: `requests`, `inputTokens`, `outputTokens`, `createdAt`. One document per account per UTC day, and one per day for the site. Read and written by `lib/ai/usage.ts`.

## `ai-summary.model.ts`

AI text made once and shown to everyone it applies to: `kind` (`report` for Explain, `briefing`), `text`, `model`, `createdAt`.
- **`_id` is the cache key**, which changes when the data or the prompt changes, so an old summary is simply never asked for again.
- **Used by:** `lib/ai/summaries.ts`, and `lib/feedback.ts` to check summary votes.

## `ai-feedback.model.ts`

One 👍 or 👎 per person per thing:
- `userId`, `kind` (`answer`, `summary` or `flag`), `targetId`, `value`, `reportSlug`;
- for flags, `flag` (`reason`, `status`, `measure`, `score`, `modelScore`, `runAt`).

The flag votes, with what was flagged, are what the ML job learns from. Exports `FeedbackKind`, `Vote` and `FlagDetails`.

## `ai-embedding.model.ts`

Saved vectors of the searches Write SPL compares requests with: `vector`, `model`, `createdAt`. `_id` hashes the model, the vector size, the purpose and the text, so a changed text or another model gets a new vector. Each text is sent to the AI only once.

## `spl-example.model.ts`

Searches saved from Write SPL with "Save as example": `request`, `summary`, `query`, `allowedGroups` (the saver's groups), `savedBy`, `createdAt`. Indexed by `{ allowedGroups, createdAt }`, for "saved examples this viewer may use, newest first". Used by `lib/spl-examples.ts`.

## `ml-score.model.ts`

What the Python ML job writes and the app reads. The job replaces both collections on each run.
- **`MlRunScore`** (`ml_run_scores`, `_id` the sid): `reportSlug`, `runAt`, `score` (0 typical to 1 most unusual), `unusual`, `reason`, `measure` (`results`, `duration` or `null`), `model`, `scoredAt`.
- **`MlReportScore`** (`ml_report_scores`, `_id` the slug): `attention` (how often a flag on the report is worth it, learned from votes), `trainedOn`, `accuracy`, `model`, `scoredAt`.

`lib/dal.ts` attaches them to reports as `modelRun` and `attention`.

## `index.ts`

Exports every model, its types and its constants, so the rest of the code imports from `@/database`.
