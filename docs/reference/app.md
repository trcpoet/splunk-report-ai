# `app/`: pages and API routes

Next.js 16's App Router: each folder is a URL, `page.tsx` is what it shows, `layout.tsx` wraps the pages under it, and `route.ts` is an API endpoint. Back to the [file reference](README.md).

## Routes at a glance

| URL | File | Who | What |
|---|---|---|---|
| `/` | `page.tsx` | signed in | Overview: headline numbers, the briefing, runs per day, the report list |
| `/login` | `login/page.tsx` | anyone | Sign-in |
| `/reports/[slug]` | `reports/[slug]/page.tsx` | signed in, may see it | One report |
| `/ai` | `ai/page.tsx` | signed in | Redirects to `/ai/reports` |
| `/ai/reports`, `/ai/spl` | `ai/reports/page.tsx`, `ai/spl/page.tsx` | signed in | Ask AI's two modes |
| `/ai/history` | `ai/history/page.tsx` | signed in | Your chats, with search |
| `GET /api/reports` | `api/reports/route.ts` | signed in | The reports you may see, as summaries |
| `GET /api/reports/[slug]` | `api/reports/[slug]/route.ts` | signed in | One report, with SPL, results and run history |
| `POST /api/revalidate` | `api/revalidate/route.ts` | the worker, the ML job | Drop the cached report data |
| `/api/auth/*` | `api/auth/[...all]/route.ts` | anyone | Better Auth: sign-in, sign-out, session only |
| `POST /api/ai/chat` | `api/ai/chat/route.ts` | signed in | Ask about reports (streamed) |
| `POST /api/ai/spl` | `api/ai/spl/route.ts` | signed in | Write SPL (JSON) |
| `POST /api/ai/briefing` | `api/ai/briefing/route.ts` | signed in | The briefing's "In short" (streamed) |
| `POST /api/ai/explain/[slug]` | `api/ai/explain/[slug]/route.ts` | signed in, may see it | Explain's summary (streamed) |

Signed-out visitors to a page are sent to `/login?next=…` by `proxy.ts`. API routes answer 401 instead.

## The root

### `layout.tsx`

The root layout around every page.
- **What it renders:**
  - a "Skip to content" link;
  - `Navbar`;
  - `AutoRefresh`;
  - the WebGL `LightRays` background;
  - `<main id="content">` holding the page.
- **What it sets:** the default `<title>` and description; the two typefaces, as CSS variables from `fonts.ts`.
- **Back/Forward reload script.** It inlines `RELOAD_PAGES_FROM_HISTORY`, a script that runs before the first paint. When Back or Forward brings a page out of the browser's cache, it hides and reloads it, so a signed-out tab can't show the previous person's reports. This exists because Vercel serves pages as cacheable.
- **Exports:** `metadata`, `RootLayout` (default).
- **Change it when:** you add something every page needs, or retune the background (the `LightRays` props).

### `page.tsx`

Home. In order:
1. "Data as of" and the headline numbers (`getReportStats`);
2. the briefing (`components/Briefing.tsx`);
3. runs per day by outcome (`RunOutcomes`, from `getRunOutcomes`);
4. the report list with search and filters (`ReportBrowser`, fed with `toSummary` so the browser gets summaries only).

Each part streams into its own `<Reveal>`, with skeletons from `Skeletons.tsx`.
- **Uses:** `lib/dal.ts` (`getVisibleReports`, `getRunOutcomes`, `getSyncInfo`), `lib/reports.ts`, `lib/format.ts`.
- **Change it when:** you add a section to the overview. Give it a skeleton the same size.

### `error.tsx`

Shown when a page throws, most often because MongoDB didn't answer within 5 s.
- **What it offers:** "Couldn't load this page", with **Try again** (re-renders in a transition, no full reload), **Go to overview**, and an error ID that matches the server log.
- **Note:** a client component, as Next requires.

### `global-error.tsx`

Shown when the root layout itself fails. It replaces the whole document, so it brings its own `<html>`, `<body>`, fonts and styles.

### `not-found.tsx`

For addresses that match no page. Missing or hidden reports have their own page (below).

### `fonts.ts`

Schibsted Grotesk and Martian Mono through `next/font/google`, exported as `fontVariables`. Shared by `layout.tsx` and `global-error.tsx`. Body text uses the system font.

### `globals.css`

Every style in the app (about 1,600 lines).
- **Design tokens** on `:root`: colors, chart colors, status colors, radius, `--header-height`.
- **Tailwind 4 setup:** `@import "tailwindcss"`, `@theme inline`, a few `@utility` helpers.
- **Components:** plain CSS classes grouped by area, in `@layer components`: navbar, overview, report pages, tables, charts, Ask AI, Explain, the briefing, sign-in.
- **View transitions:** the crossfades, at the end of the file.
- **Change it when:** you style anything. Prefer the tokens over new hex values. See [configuration.md](../configuration.md#look-and-feel).

### `icon.svg`

The browser tab icon.

## `login/`

### `login/page.tsx`

Sign-in.
- **The form shows at once.** Only the check for an existing session waits for the server.
- **Signed-in visitors** are sent on to `next` (checked by `lib/next-path.ts`).
- **If the session can't be checked** (the database is down), the form stays, and signing in says what's wrong.
- **Demo accounts:** in development or with `DEMO_MODE=true`, it lists the accounts from `lib/demo-users.ts` for one click. With `DEMO_MODE`, it also shows `DEMO_PASSWORD`.
- **Build time:** both settings are read when the app is built, because the form is prerendered.
- **Uses:** `components/LoginForm.tsx`, `getViewerOrNull`.

## `reports/[slug]/`

### `reports/[slug]/page.tsx`

One report.
- **What it shows, in order:**
  1. **Header:** the status badge and status message, then Explain.
  2. **Highlights:** headline tiles, with `Meter` and `Sparkline` where set.
  3. **Latest results:** the chart (`ReportChart`, small multiples, or `ReportScatter`, inside `ChartBoundary`), then the sortable, filterable results table (`ResultsTable`).
  4. **Search query (SPL):** with **Explain it step by step**, which opens Write SPL.
  5. **Run history:** `RunTrend` and the run table, then the report's tags.
  6. **Report details:** schedule, time range, index, Splunk app, owner, last run, next run.
  7. **Delivery:** the email lists it used to go to, and about how many emails a week that was.
  8. **Actions and related:** Download CSV and Copy SPL (`ReportActions`), then related reports (`getSimilarReports`, as `ReportCard`s).
- **Missing or hidden:** `getVisibleReport` returns `null` for both, and the page calls `notFound()`. `generateMetadata` titles them both "Report not found".
- **Exports:** `generateMetadata`, `ReportPage` (default).
- **Change it when:** a report needs another section. Most per-report behavior belongs in `lib/report-config.ts` instead.

### `reports/[slug]/not-found.tsx`

"Report not found", the same for missing and hidden reports, so a hidden report's name and existence don't leak.

## `ai/`: Ask AI

### `ai/layout.tsx`

Ask AI's frame, laid out like ChatGPT.
- **What it renders:**
  - a hidden `<h1>`;
  - the chat sidebar (`ChatSidebar`, fed by `listChats()`, in `<Suspense>`);
  - beside it, `<div id="ai-main">`, which holds the top bar (`AiTopBar`) and then the page.
- **Panels:** the bar gets its panels as server-rendered elements, each in its own `<Suspense>`: `ReportsPanel` and `SearchesPanel` from `components/AiPanels.tsx`, plus the attention count.
- **It stays put while the chat changes.** Navigating between chats or modes re-renders only the page.
- **Change it when:** the frame changes. For the chat itself, see `components/ChatView.tsx`.

### `ai/page.tsx`

`/ai` redirects to `/ai/reports`.

### `ai/reports/page.tsx`, `ai/spl/page.tsx`

The two modes. Each sets its `<title>` and renders `AiChat` with `kind` set to `reports` or `spl`, inside `<Reveal>` with `ChatSkeleton`.
- **The address:**
  - `?chat=<id>` opens a saved chat;
  - `?about=<slug>` (reports) or `?explain=<slug>` (SPL) starts a new chat with a question filled in.

### `ai/history/page.tsx`

The chats page, which **Search chats** opens: an `<h2>` "Your chats", then `ChatHistory` with every chat (`listChats()`), with search and a filter by mode.

### `ai/actions.ts`

Server Actions, called from the browser like functions. Anyone can post to them, so each checks its input with zod, and the `lib/` function checks who is asking.

| Action | Checks | Then |
|---|---|---|
| `renameChatAction(id, title)` | id is a chat id; title 1–80 characters | `renameChat`, then `refresh()` redraws the lists |
| `deleteChatAction(id)` | id is a chat id | `deleteChat`, then `refresh()` |
| `voteAction({ kind, targetId, value })` | kind is `answer`, `summary` or `flag`; value is `up`, `down` or `null` | `saveVote`. No redraw, so a chat on screen doesn't reset |
| `saveExampleAction(messageId, save)` | id is a message id | `saveExample` or `removeExample` |

Each returns `{ ok: true }` or `{ ok: false, message }`.

## `api/`: route handlers

### `api/reports/route.ts`

`GET /api/reports`. 401 when signed out. Otherwise `{ reports }`, with only the fields `toSummary` keeps, for the reports `getVisibleReports` allows.

### `api/reports/[slug]/route.ts`

`GET /api/reports/[slug]`. 401 when signed out, 404 for missing or hidden. Otherwise `{ report }`, with its SPL, latest results and run history. Explain on a report card fetches this.

### `api/revalidate/route.ts`

`POST /api/revalidate` with `Authorization: Bearer <REVALIDATE_SECRET>`.
- It compares SHA-256 digests in constant time.
- It answers 401 without the secret, or when no secret is set.
- Otherwise it runs `revalidateTag('reports', { expire: 0 })` and answers `{ revalidated: true }`.
- The sync worker and the ML job call it twice, 3 s apart.

### `api/auth/[...all]/route.ts`

Better Auth's handler, limited to sign-in, sign-out and session lookups.
- **Everything else answers 404:** password changes, user updates, session lists.
- **Why:** the demo accounts are shared, and those endpoints would let one visitor lock others out or see their IP addresses.
- **Change it when:** a feature needs another path, such as SSO's `/sign-in/social` and `/callback/<provider>`.

### `api/ai/chat/route.ts`

`POST /api/ai/chat` with `{ chatId?, message }`: Ask about reports.
1. **Checks:** `prepareTurn()` (`lib/ai/turn.ts`) checks everything first and answers JSON errors:
   - 401 signed out;
   - 400 a bad question;
   - 503 AI off;
   - 404 not your chat;
   - 409 the chat is full;
   - 429 over the daily limit.
2. **The prompt:** `REPORTS_PROMPT` plus `reportsContext()` of the viewer's reports, then the conversation so far.
3. **The answer:** `streamText` with `thinking: 'low'`, streamed as NDJSON: `start`, `text`…, then `done` (with `messageId` and `cutOff`) or `error`.
4. **Saving:** `saveTurn` stores the question and answer together when the answer completes. A full chat gets an error instead.
5. **Usage:** tokens are recorded after the page has the outcome.
- `maxDuration = 60`.

### `api/ai/spl/route.ts`

`POST /api/ai/spl` with `{ chatId?, message }`: Write SPL.
1. **Checks:** `prepareTurn` checks everything first.
2. **Examples:** it finds the most similar example searches (`findSimilarExamples`). It searches with the request plus the one before it, so follow-ups like "only the last 7 days" work. If the AI can't embed right now, the prompt gets every report's search instead.
3. **The answer:** `generateJson` against the Write SPL schema, with `thinking: 'medium'`.
4. **The parse:** `validateSpl` parses the search without running it.
5. **Saving and response:** the turn is saved, and the route returns `{ chatId, message }`.
- `maxDuration = 60`.

### `api/ai/briefing/route.ts`

`POST /api/ai/briefing`: the briefing's "In short", streamed.
- **Errors:** 401 when signed out; 404 with no reports; 503 when AI is off.
- **Sharing:** the summary is keyed by `briefingKey(reports)`, so everyone who sees the same reports shares one.
- **Cost:** results load only when a new briefing is written. It counts toward the site's daily limit only.

### `api/ai/explain/[slug]/route.ts`

`POST /api/ai/explain/[slug]`: Explain's summary of one report's latest run, streamed.
- **Errors:** 401, 404 for missing or hidden, 503 when AI is off.
- **Sharing:** keyed by `reportSummaryKey(report)`, so it's written once per run and then reused.
- **What the AI sees:** only this report.
