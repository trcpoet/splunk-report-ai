# `lib/ai/`: Ask AI, Write SPL and summaries

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
| `Turn`, `AskOptions`, `Usage`, `EmbedInput` | The types. `AskOptions` has `system`, `turns`, `thinking` (`low` or `medium`) and an abort `signal`. |

- **`AI_PROVIDER=fake`** answers with canned text, typed out like a real answer. It returns a canned search for Write SPL, and hashed word vectors (`hashedEmbedding`) for embeddings, so everything works with no key.
- **Stop** ends the app's reading. Gemini still finishes, and bills for, the answer.
- **Change it when:** you switch providers. Keep the three functions' inputs and outputs ([ai.md](../ai.md#using-another-ai)).

### `config.ts` (pure)

The AI settings from the environment.
- **`aiStatus(syncMode)`** says whether answers are on, which provider and model, or why not. The reasons are `turned-off`, `live-data` and `no-key`.
- **`aiOffMessage(reason)`** is what the page says when they're off. The hosted demo doesn't mention setup.
- **The rest:** `aiModel()`, `embeddingModel()`, `dailyLimit()`, `siteDailyLimit()`, `splunkWebUrl()`, `DEFAULT_MODEL`, `DEFAULT_EMBEDDING_MODEL`.
- **Tested:** `config.test.ts`. Every function takes `env`, so tests pass their own.

### `prompts.ts` (pure)

What the model is told, in plain English: `REPORTS_PROMPT` (Ask about reports), `SPL_PROMPT` (Write SPL), `REPORT_SUMMARY_PROMPT` (Explain) and `BRIEFING_PROMPT`.
- **The prompts are fixed text**, followed by the reports, so the start of the prompt is the same for every question and Gemini can reuse its cache.
- **Bump `PROMPT_VERSION`** after changing the summary or briefing prompts. It's part of their cache keys, so the old summaries are never asked for again.

### `context.ts` (pure)

The reports as text for the AI.
- **`reportsContext(reports, sync)`:** for each report, its status and message, highlights, the last 7 runs, its SPL, and up to `MAX_ROWS` (20) result rows.
- **`splContext(reports, examples?)`:** for Write SPL.
  - With examples, the reports become a short catalog of indexes and columns, and only the examples are written out in full, closest first.
  - Without examples, every report's search is written out.
- **Two rules:**
  - only the reports `lib/dal.ts` returned for this viewer;
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

It loads the reports last, only for requests that pass. It returns the error `Response`, or a `ReadyTurn`:
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
- **`mentionedReports`** lists the reports an answer used.
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

`validateSpl(query)` is the built-in SPL checker. It's quick and needs nothing else, and it never runs the search, so the page calls it each time it shows an answer (`components/SplAnswer.tsx`). Save as example calls it too.
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
- **`flagId(slug, runAt, reason)`** names a briefing flag for its vote.
- **Tested.**
