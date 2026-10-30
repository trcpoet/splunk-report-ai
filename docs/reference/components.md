# `components/`: what you see

React components, grouped by feature.
- **"Client"** means the file starts with `'use client'`: it runs in the browser too, for clicks, typing, charts and streaming.
- **"Server"** components run only on the server, and can read data through `lib/dal.ts`.
- **Styles** live in `app/globals.css`, under the class names each component uses.

Back to the [file reference](README.md).

## Layout and navigation

### `Navbar.tsx` (server)

The sticky top bar: the logo (home), the page links and the user menu.
- **Suspense:** both the links and the menu need request data, so each sits in `<Suspense>` with an unmarked or placeholder fallback.
- **Height:** set by `--header-height` in `app/globals.css`, so what sticks under it lines up.
- **Used by:** `app/layout.tsx`.

### `NavLinks.tsx` (client)

The navbar's links: Overview, All Reports, and the **Ask AI** pill.
- **The current page** is marked with `aria-current`. Ask AI counts as current on every page under `/ai`.
- **No links on `/login`**, where they'd only lead back to it.
- **Home:** `HomeLink` scrolls back to the top when you're already home.
- **Exports:** `HomeLink`, `NavLinkList` (the unmarked fallback), `NavLinks` (default).
- **Used by:** `Navbar.tsx`.

### `UserMenu.tsx` (server)

The signed-in person's name and groups, and Sign out.
- **When the session can't be read** (the database is down), it shows just the sign-out button and leaves the error to the page.
- **On the sign-in page**, CSS hides it.
- **Used by:** `Navbar.tsx`.

### `SignOutButton.tsx` (client)

Signs out with Better Auth, then does a full page load to `/login`. That drops the browser's cached pages for the session. It also tells other tabs to reload (`lib/session-sync.ts`). Its label shows when it's signing out, and when it failed.

### `AutoRefresh.tsx` (client)

Refreshes open pages once a minute (`EVERY_MS`), and when a hidden tab is shown again.
- **Skipped:** hidden tabs, `/login`, and the Ask AI pages, where a refresh mid-answer would reset the chat.
- **Signing in or out elsewhere:** when another tab does it, this tab reloads.
- **Used by:** `app/layout.tsx`.

### `Transitions.tsx` (server)

Short crossfades, using React's `<ViewTransition>`. The fades themselves are in `globals.css`.
- **`PageTransition`** wraps a page, so it fades when you follow a link tagged with `PAGE_TRANSITION`.
- **`Reveal`** is a `<Suspense>` whose skeleton fades out and whose content fades in.
- **Used by:** most pages.
- **Known issue:** during a crossfade (about 250 ms), Chrome sends clicks to `<html>`, so a click in that moment is lost.

### `Skeletons.tsx` (server)

Loading placeholders built from the same CSS classes as the content, so nothing moves when it arrives. No fake data, just bars.
- **Exports:**
  - `SkeletonParagraph`;
  - `OverviewSkeleton`, `ReportsSkeleton`, `ReportSkeleton`;
  - `ChatSkeleton`, `ChatListSkeleton`, `PanelListSkeleton`, `HistorySkeleton`;
  - `BriefingSkeleton`, `UserMenuSkeleton`.
- **Each has `role="status"`** and a label for screen readers.
- **Change it when:** you change a layout. Its skeleton must keep the same size.

### `LightRays.tsx` (client)

The animated WebGL background, drawn with `ogl`. The props are set in `app/layout.tsx`: origin, color, speed, spread, length, mouse follow.

### `ExploreBtn.tsx` (client)

"Explore reports" on the home page: glides down to the list, or jumps with reduced motion. Only this button scrolls smoothly; page-wide smooth scrolling would slow Next's own scrolling.

## Sign-in

### `LoginForm.tsx` (client)

Email and password sign-in through Better Auth.
- **Demo accounts:** with demo accounts listed (`demoAccounts`, `demoPassword`), each one signs in with one click.
- **Errors in plain words:**
  - a wrong email or password (401);
  - too many tries (429);
  - an address Better Auth doesn't trust (403), such as a per-deployment Vercel URL.
- **After success:** a full page load to the safe `next` path, which also tells other tabs.
- **Landing here from inside the app** means the session ended while a tab was open, so the form reloads that tab first.
- **Used by:** `app/login/page.tsx`.

## Reports

### `ReportBrowser.tsx` (client)

The report list on the home page.
- **Controls:** a search box, plus status and category filter chips.
- **Props:** `reports` (summaries), `categories`.
- **`/#reports` links** ("All Reports") land on the list even when it streams in late, or comes back from the page cache.

### `ReportCard.tsx` (client)

One report as a card: title, status, schedule and run dots.
- **Prefetching:** every card prefetches the report page's shell. Pointing at a card (hover, focus, touch) also prefetches its content, so it opens at once.
- **Explain** sits on top of the card's corner, since a button can't go inside a link.
- **Loading bar:** a thin bar fades in while the report is still on its way.
- **Used by:** `ReportBrowser`, and "Related reports" on a report page.

### `StatusBadge.tsx` (server)

Success, Warning or Failed, with its dot.

### `RunHistory.tsx` (server)

The row of colored dots for the last runs on a card.

### `ResultsTable.tsx` (client)

The results table, built on TanStack Table v9.
- **Sorting:** click a header. Numbers start largest, text A to Z, and a third click restores the order.
- **Numbers Splunk sent as text** ("$1,234", "1.84%", "12G") sort by value (`parseNumber`).
- **Props:**
  - `filterable` adds a filter box;
  - `sortValues` gives a column a separate sort key, such as raw times behind "Oct 2, 09:00 UTC".
- **Alignment:** numeric columns are right-aligned.

### `ReportActions.tsx` (client)

**Download CSV** (built in the browser from the rows) and **Copy SPL**. Each confirms for a moment; a failed copy says so.

## Charts

All charts use Recharts through shadcn's wrapper (`ui/chart.tsx`) and the shared styling in `lib/chart-theme.ts`. Each has a table with the same values next to it.

### `ReportChart.tsx` (client)

The results chart: one measure, in one color, as bars, columns, lines or areas.
- **Options from `report-config`:**
  - a `threshold` line, with the values past it in the warning color;
  - `max`, which turns bars into meters;
  - `panels`, which draws small multiples.
- **Labels:** only the largest value and the values past the threshold get one.

### `ReportScatter.tsx` (client)

A dot per row: the chart's measure up, the scatter's measure across, with an optional log axis. On phones, only the key dots get a name.

### `RunOutcomes.tsx` (client)

Scheduled runs per day by outcome, as stacked bars, on the home page. Status colors always come with a text label.

### `RunTrend.tsx` (client)

Results per stored run, oldest to newest. Skipped runs are gaps, not zeros.

### `Sparkline.tsx` (server)

A tiny line in plain SVG. With `highlightLast` and `usual`, it marks an unusual run and its usual value. Its `label` is read out by screen readers.

### `Meter.tsx` (server)

A thin bar showing how much of a limit a highlight uses. At or past the limit, it takes the warning color.

### `ChartBoundary.tsx` (client)

An error boundary. A chart that can't be drawn shows "This chart couldn't be drawn. The table has every value." instead of breaking the page.

### `ui/chart.tsx` (client)

shadcn's Recharts wrapper: `ChartContainer`, tooltips and legends themed from CSS variables. Generated by shadcn, so edit it sparingly.

## Briefing, Explain and votes

### `Briefing.tsx` (server)

What needs attention across the viewer's reports.
- **What it lists:**
  - reports that warn or fail (`needsAttention`);
  - newest runs that stand out (`findUnusualRun`, or the ML job's flag), with a sparkline.
- **Votes:** each flag has a "Worth flagging?" vote.
- **AI summary:** when AI is on, it adds `BriefingSummary`.
- **Variants:** a card on the home page (`variant="home"`); in Ask AI's Reports panel (`"side"`).
- **Order:** once the ML job has learned, flags are ordered by its `attention`.

### `BriefingSummary.tsx` (client)

The briefing's "In short": streams from `/api/ai/briefing` through `useSummary`. The briefing gives it a key that changes with the data.

### `useSummary.ts` (client)

A hook that asks a summary endpoint and follows its NDJSON stream.
- **Returns:** a status (`loading`, `streaming`, `done`, `failed`), the text, whether it was cut off, and the saved id and vote for its 👍 / 👎.
- **A saved summary** arrives at once.

### `ExplainButton.tsx` (client)

**Explain** on report cards and report pages. It opens a side panel (`usePanel`) with:
- **In plain words:** the AI summary, from `/api/ai/explain/[slug]`;
- **At a glance:** the unusual run, the ML score, the status message, and one sentence per results column (`lib/insights.ts`);
- **Ask more:** links into Ask AI.

The panel's content mounts only when it opens. On a card, the report is fetched from `/api/reports/[slug]`.

### `FeedbackButtons.tsx` (client)

👍 / 👎. The vote shows at once and is saved through `voteAction`; if saving fails, it goes back and says so. Pressing the same thumb again takes it back.
- **Props:**
  - `kind`: `answer`, `summary` or `flag`;
  - `targetId`, and `initial`, the saved vote;
  - `question`, read out with the thumbs;
  - `compact`, icons only;
  - `tips`, the tooltips.

### `SidePanel.tsx` (client)

The shared side panel, a bottom sheet on phones.
- **`usePanel()`** is the logic: a native modal `<dialog>`, so focus moves in, Esc closes it, and focus returns to the button. A backdrop click closes it, and it closes when the page is hidden.
- **`SidePanel`** is the Ask AI top bar's button and panel. A link inside closes it.
- **Used by:** `AiTopBar.tsx`, `ExplainButton.tsx`.

## Ask AI

### `AiChat.tsx` (server)

One Ask AI mode. It reads the address:
- `?chat=<id>` loads that chat, its votes and saved examples;
- `?about=` / `?explain=` fills in a question.

It renders `ChatView`, keyed by chat id, so opening another chat starts fresh.
- **A chat from the other mode** redirects there.
- **An unknown id** says "Chat not found".
- **AI off:** `aiStatus()` decides whether AI is on, and what to say when it isn't.

### `AiTopBar.tsx` (client)

The bar above the chat.
- **`ModeSwitch`:** Ask about reports | Write SPL. These are links, and each mode remembers its last chat.
- **The panel button:** Reports, with the attention count, or Searches (`SidePanel`).
- **On phones:** Your chats and New chat.
- **`NewChatLink`** is used here and in the sidebar. In the open mode it sends `NEW_CHAT`, which stops an answer on its way and clears the chat, then navigates if the address names a chat.
- **Exports:** `ModeSwitch`, `NewChatLink`, `AiTopBarFallback`, `AiTopBar` (default).

### `AiPanels.tsx` (server)

What the panels hold:
- **`ReportsPanel`:** the briefing, then every report the AI can see, linking to `?about=`;
- **`SearchesPanel`:** each report's index, linking to `?explain=`;
- **`AttentionCount`:** the badge.

They render on the server with the layout; their browser parts load only when a panel opens.

### `ChatSidebar.tsx` (client)

The chat sidebar:
- **Skip the list of chats**, New chat, Search chats;
- then every chat grouped Today / Yesterday / Last 7 days / Older, with the open one marked.

The list comes from the server. Chats saved since then arrive as `CHAT_SAVED` events, merged by `mergeChats` (`lib/chat-list.ts`). Deleted ones leave on `CHAT_DELETED`. The rows are `HistoryRow` with `compact`.

### `ChatView.tsx` (client)

The conversation.
- **New chat:** a centered question with the box to type in under it, and suggestions.
- **A chat:** bubbles for questions and plain text for answers.
  - Under each answer: icon-only Copy and 👍 / 👎, plus notes, Try again, and the ↓ button.
- **Sending:** posts to `/api/ai/chat` (reading the NDJSON stream) or `/api/ai/spl`.
  - Stop aborts the request.
  - A new chat gets its `?chat=` address once its first answer is saved.
  - Each saved answer sends `CHAT_SAVED`.
- **Address changes:** it follows the address, including Back and Forward. It listens for `NEW_CHAT` and `STOP_ANSWER`.
- **Limits:** questions are up to `MAX_QUESTION` (2,000) characters. The newest text stays in view unless you scroll up.

### `ChatAnswer.tsx` (client)

An answer as Markdown, through react-markdown, which never runs HTML.
- **Report links:** `[[slug]]` markers become report chips (`ReportChip`), and only for reports the viewer may see.
- **Other links** stay plain text, and images are dropped.
- **Used by:** `ChatView`, `BriefingSummary`, `ExplainButton`.

### `SplAnswer.tsx` (client)

A Write SPL answer:
- **Before the query:** the summary, then badges (read-only or not, parses or not, time range), then the parser's line and any warnings.
- **The query** sits in a code block with Copy.
- **Buttons:** Save as example (`saveExampleAction`, only for read-only searches that parse) and Open in Splunk.
- **The steps:** numbered, and pointing at one highlights its line.
- **After the steps:** the fields, the guesses to check, and follow-ups (including **Fix the error**).

### `ChatHistory.tsx` (client)

The chats page: search, filter by mode, and chats grouped by day.
- **`HistoryRow`** is one chat: open, rename in place, or delete after a confirm. The sidebar reuses it with `compact` and `current`.
- **Deleting the open chat** sends `STOP_ANSWER`, opens a new chat first, and comes back if the delete fails.
- **Exports:** `GROUPS`, `HistoryRow`, `ChatHistory` (default).

### `CopyButton.tsx` (client)

Copies text and says "Copied" for 2 s. If the browser refuses, it says "Couldn't copy". With `iconOnly`, its words become its name and tooltip (`data-tip`).
