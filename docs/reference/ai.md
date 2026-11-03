# `src/ai/`: Ask AI, Write SPL and summaries

Everything behind the Ask AI page, Explain and the briefing's "In short". The user's guide is [ai.md](../ai.md); the request flow is in [architecture.md](../architecture.md#ask-ai). Back to the [file reference](README.md).

Most files here are **pure**, so the browser, the server and the tests share them. The ones that read secrets or the database are server code: `llm.ts`, `summaries.ts`, `turn.ts`, `usage.ts`, `validate.ts`.

## Talking to the AI

### `llm.ts`

**The only file that calls the AI provider** (Google Gemini, through `@google/genai`). The rest of the app passes plain text in, and gets text or checked JSON back.

| Export | What it does |
|---|---|
| `streamText(options, onText)` | Streams an answer, calling `onText` for each piece. Returns the full text, whether it was cut off at `MAX_OUTPUT_TOKENS` (8,192), and token usage. Used by chat, Explain and the briefing. |
| `generateJson({ ...options, schema })` | One answer as JSON matching a zod schema (sent to Gemini as a JSON Schema), then checked. Returns `{ value, usage }`. Used by Write SPL. |
| `embed(inputs, purpose)` | Turns texts into vectors of `EMBEDDING_DIMENSIONS` (768), for retrieval. `purpose` is `query` or `document`. |
| `embeddingModelInUse()` | The embedding model's name, part of each saved vector's key. |
| `AiError` | A failure with a `kind` (`stopped`, `blocked`, `busy`, `key`, `unavailable`, `invalid`) and a message the page shows as it is. |
| `Turn`, `Usage`, `EmbedInput` | The types. Asking takes `system`, `turns`, `thinking` (`low` or `medium`) and an abort `signal`. |

- **`AI_PROVIDER=fake`** answers with canned text, typed out like a real answer. It returns a canned search for Write SPL, and hashed word vectors (`hashedEmbedding`) for embeddings, so everything works with no key.
- **Stop** ends the app's reading. Gemini still finishes, and bills for, the answer.
- **Change it when:** you switch providers. Keep the three functions' inputs and outputs ([ai.md](../ai.md#using-another-ai)).

### `config.ts` (pure)

The AI settings from the environment.
- **`aiStatus(syncMode)`** says whether answers are on, which provider and model, or why not. The reasons are `turned-off`, `live-data` and `no-key`.
- **`aiOffMessage(reason)`** is what the page says when they're off. The hosted demo doesn't mention setup.
- **The rest:** `aiModel()`, `embeddingModel()`, `dailyLimit()`, `siteDailyLimit()`, `splunkWebUrl()`, `DEFAULT_MODEL`.
- **Tested:** `config.test.ts`. Every function takes `env`, so tests pass their own.

### `prompts.ts` (pure)

What the model is told, in plain English: `REPORTS_PROMPT` (Ask about reports), `SPL_PROMPT` (Write SPL), `REPORT_SUMMARY_PROMPT` (Explain), `REPORT_AND_SPL_PROMPT` (Explain report and SPL, which asks `EXPLAIN_REPORT_AND_SPL`) and `BRIEFING_PROMPT`.
- **The prompts are fixed text**, followed by the reports, so the start of the prompt is the same for every question and Gemini can reuse its cache.
- **Bump `PROMPT_VERSION`** after changing the summary or briefing prompts. It's part of their cache keys, so the old summaries are never asked for again.

### `context.ts` (pure)

The reports as text for the AI.
- **`reportsContext(reports, sync)`:** for each report, its status and message, highlights, the last 7 runs, its SPL, and up to `MAX_ROWS` (20) result rows.
- **SPL** goes in as it is, angle brackets included (`where count>5`), except that it can't close the tag around it (`safeSpl`).
- **`splContext(reports, examples?)`:** for Write SPL.
  - With examples, the reports become a short catalog of indexes and columns, and only the examples are written out in full, closest first.
  - Without examples, every report's search is written out.
- **Two rules:**
  - only the reports `src/reports/dal.ts` returned for this viewer;
  - the same text for the same data: slug order, fixed field order, no clock times, so Gemini's cache works.
- **Result rows are marked as data**, and angle brackets are removed, so text in the logs can't pose as instructions.
- **Tested:** `context.test.ts`.

## Chat requests

### `turn.ts` (server)

`prepareTurn(request, kind)`: the checks both chat routes run before asking the AI, in order:
1. signed in (401);
2. a question of 1–2,000 characters (400);
3. AI on (503);
4. the chat is the viewer's and of this mode (404), with room (409);
5. today's limit (429).

It loads the reports last, only for requests that pass. It returns the error `Response`, or the ready turn:
- `viewer`;
- `chatId`: the existing chat, or a new id;
- `chat`, `question`, `reports`, `sync`.
- **Also exports:** `conversation(turn)` (the earlier messages plus the new question) and `jsonError(status, message)`.

### `stream.ts` (pure)

How a streamed answer travels: one JSON object per line (NDJSON).

```
{"type":"start","chatId":"…"}
{"type":"text","text":"…"}
{"type":"done","messageId":"…","cutOff":false}
{"type":"error","message":"…"}
```

- **Exports:**
  - `StreamEvent`, `encodeEvent`;
  - `ndjsonResponse(run, onError)`, for the routes;
  - `readEvents(body, onEvent)`, for the browser.
- **Tested:** `stream.test.ts` splits a response at awkward points.

### `usage.ts` (server)

Daily limits, so a shared demo account or a stuck script can't run up the bill. Days are UTC.
- **`countRequest(userId)`** counts one request for the person, then for the site, and returns why it's over the limit, or `null`.
  - Someone over their own limit isn't counted for the site.
  - With no `userId` (the briefing), it counts only for the site.
- **`recordTokens(userId, usage)`** adds an answer's tokens to the day's totals. It's best effort, after the answer is saved.
- **Data:** the `ai_usage` collection, kept 7 days.

### `chat-events.ts` (pure)

The window events between parts of the Ask AI page that don't share a parent:

| Event | Sent by | Heard by | Means |
|---|---|---|---|
| `CHAT_SAVED` (`SavedChat` detail) | `ChatView` | `ChatSidebar` | An answer was saved: put the chat first. |
| `CHAT_DELETED` (chat id) | `HistoryRow` | `ChatSidebar`, `AiTopBar` | Drop it from the list and from the remembered chats. |
| `NEW_CHAT` | `NewChatLink` | `ChatView` | Stop any answer on its way and clear the chat. |
| `STOP_ANSWER` | `HistoryRow` (deleting the open chat) | `ChatView` | Stop the answer, so its save can't bring the chat back; keep the chat on screen. |

### `suggestions.ts` (pure)

Starter questions built from the viewer's own reports, with no AI call:
- **`reportQuestions`:** "Why is X failing?" for reports needing attention, and a summary request.
- **`splRequests`:** searches that fit the reports' indexes.
- **`aboutQuestion`, `explainRequest`:** the questions `?about=` and `?explain=` fill in.

Tested.

### `report-links.ts` (pure)

The model names a report as `[[report-id]]`.
- **`linkReports(text, visible, streaming)`** turns markers for visible reports into links, drops the rest, and holds back a half-written marker while streaming.
- **`replaceReportMarkers`** swaps markers for report titles, for copying.
- **Tested.**

## Write SPL

### `spl.ts` (pure)

The shape of a Write SPL answer, and a safety check.
- **`SplAnswerSchema`** (zod) is the shape Gemini must answer in: a summary, then steps (`code` and `explanation` per pipe command), the time range, fields, assumptions and follow-ups. `StoredSplAnswer` adds the examples it was based on.
- **`queryFromSteps`, `stepLine`, `pipeCommands`** build the one query from the steps. The screen and the copied text come from the same function.
- **`checkSpl(query)`** checks whether the search only reads events.
  - It warns about commands that write or act outside the search: `outputlookup`, `collect`, `mcollect`, `tscollect`, `sendemail` and others.
  - It also warns about searches that name no index.
  - Only double quotes count as quotes.
- **`splunkSearchUrl(base, query)`** builds the Open in Splunk link.
- **Tested.**

### `validate.ts`

`validateSpl(query)` is the built-in SPL checker. It's quick and needs nothing else, and it never runs the search, so the page calls it each time it shows an answer (`src/ai/components/SplAnswer.tsx`). Save as example calls it too.
- It catches unknown commands; quotes, brackets or macros that never close; and a pipe with nothing after it, or with something that can't be a command.
- It doesn't know apps' own commands, macros or field names, so Splunk may still find a problem.
- **Tested.**

### `retrieval.ts` (pure)

Finding the example searches most like a request (RAG).
- **Building examples:** `reportExample` and `savedExample` turn reports and saved answers into `SplExample`s; `exampleText` is the text that gets embedded.
- **Comparing:** `cosine` and `topK` rank them.
- **`hashedEmbedding`** stands in for real vectors with the fake provider and in tests.
- **Tested.**

## Summaries

### `summaries.ts` (server)

`streamSummary({ viewer, key, kind, system, question })`: Explain summaries and briefings.
- **Written once:** a saved summary (`ai_summaries`, under its key) streams back at once.
- **Shared:** a summary already being written is shared, so two people opening the home page at once get one briefing, counted once.
- **Finished even if you leave:** a new one is finished and saved even when the person who asked has left. One cut off at the token cap isn't saved.
- **Counting:** a briefing counts only for the site.

### `keys.ts` (pure)

Names for cached AI text and for things people vote on.
- **`reportSummaryKey(report)`** and **`briefingKey(reports)`** change when what the text was written from changes: a new run, a status, the prompt version.
- **`reportAndSplKey(report)`** names Explain report and SPL's text. It also changes with the search, which someone may edit in Splunk before the report runs again.
- **`summarySlug(key)`** is the report a saved summary is about (either kind), so a vote on it checks the voter can see that report (`src/ai/feedback.ts`).
- **`flagId(slug, runAt, reason)`** names a briefing flag for its vote.
- **Tested.**

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
| `turnsLeft(chat)`, `newChatId()`, `CHAT_ID` | Helpers. `CHAT_ID` is the 24-hex-digit id pattern every input is checked against. |

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
- **Used by:** `voteAction`, `Briefing`, `AiChat`, `src/ai/summaries.ts`.

### `spl-examples.ts` (server-only)

Write SPL's examples, used for retrieval: the viewer's reports' searches, plus searches people saved with **Save as example**.
- **A saved search** is shared with the groups of the person who saved it. Admins see them all.

| Export | What it does |
|---|---|
| `findSimilarExamples(viewer, request)` | The `SIMILAR_EXAMPLES` (5) closest examples to the request. Throws when the AI can't embed right now; the route then writes the prompt without them. |
| `saveExample(viewer, messageId)` / `removeExample(viewer, messageId)` | Saves an answer from the viewer's own chats, if it only reads data and parses, or takes it back. |
| `savedExampleIds(viewer, ids)` | Which of these answers the viewer has saved. |

- **Embeddings:** example vectors are cached in `ai_embeddings`, so each text is embedded once; requests are embedded fresh. At most `MAX_SAVED` (500) saved searches are considered, counted among those the viewer may see.

## `components/`: the briefing, Explain and votes

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
- **At a glance:** the unusual run, the ML score, the status message, and one sentence per results column (`src/reports/insights.ts`);
- **Ask more:** links into Ask AI.

With `withSpl`, it's **Explain report and SPL**, under Copy SPL query in the report page's Delivery card. Its panel shows the AI's longer text from `/api/ai/explain/[slug]?with=spl` (what the report is for, what the latest run found, and the search one pipe command at a time), then the search itself, then Ask more.

The panel's content mounts only when it opens. On a card, the report is fetched from `/api/reports/[slug]`.

### `FeedbackButtons.tsx` (client)

👍 / 👎. The vote shows at once and is saved through `voteAction`; if saving fails, it goes back and says so. Pressing the same thumb again takes it back.
- **Props:**
  - `kind`: `answer`, `summary` or `flag`;
  - `targetId`, and `initial`, the saved vote;
  - `question`, read out with the thumbs;
  - `compact`, icons only;
  - `tips`, the tooltips.

## `components/`: Ask AI

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
- **Exports:** `NewChatLink`, `AiTopBarFallback`, `AiTopBar` (default).

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

The list comes from the server. Chats saved since then arrive as `CHAT_SAVED` events, merged by `mergeChats` (`src/ai/chat-list.ts`). Deleted ones leave on `CHAT_DELETED`. The rows are `HistoryRow` with `compact`.

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
- **Before the query:** the summary, then badges (read-only or not, parses or not, time range), then the SPL checker's line and any warnings. The page runs the checker (`validateSpl`) each time it shows an answer.
- **The query** sits in a code block with Copy.
- **Buttons:** Save as example (`saveExampleAction`, only for read-only searches that parse) and Open in Splunk.
- **The steps:** numbered, and pointing at one highlights its line.
- **After the steps:** the fields, the guesses to check, and follow-ups (including **Fix the error**).

### `ChatHistory.tsx` (client)

The chats page: search, filter by mode, and chats grouped by day.
- **`HistoryRow`** is one chat: open, rename in place, or delete after a confirm. The sidebar reuses it with `compact` and `current`.
- **Deleting the open chat** sends `STOP_ANSWER`, opens a new chat first, and comes back if the delete fails.
- **Exports:** `GROUPS`, `HistoryRow`, `ChatHistory` (default).
