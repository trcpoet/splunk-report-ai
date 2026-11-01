# Ask AI

A plain-language guide to the **Ask AI** page: what it does, how to turn it on, what it costs, what the AI can see, and how to swap the AI for another one.

## The short version

- **Ask AI** (navbar) is laid out like ChatGPT. Your chats run down the left, and a switch at the top picks one of two modes:
  - **Ask about reports:** questions about your reports, answered from their latest runs.
  - **Write SPL:** describe a search, or paste one, and get the SPL step by step.
- **The AI is Google Gemini** (`gemini-3.8-flash` by default), through Google's `@google/genai` SDK. One file, `lib/ai/llm.ts`, talks to it.
- **It only sees the reports you can see**, the same ones the rest of the app shows you.
- **It never runs a search.** Write SPL gives you a search to copy into Splunk.
- **Without a key, AI answers are off** and the page says so. Everything else in the app works as before.

## Turning it on

1. Get an API key at [Google AI Studio](https://aistudio.google.com/apikey).
   - A key from a Google Cloud project **without billing** uses the free tier: it costs nothing, and requests per minute and per day are limited.
   - Google may use free-tier prompts to improve its products. That's fine for the demo's dummy data, but never for real company data (see "Privacy and safety").
2. Add it to `.env.local`:

   ```bash
   GEMINI_API_KEY=<your key>
   ```

3. Restart `npm run dev`, then open **Ask AI**.

**Trying it without a key:** set `AI_PROVIDER=fake`. Answers are then canned text that says it's canned, typed out like a real answer. It's handy for checking the pages, and for automated tests, at no cost.

| Setting | Default | What it does |
|---|---|---|
| `GEMINI_API_KEY` | none | Turns AI answers on |
| `AI_MODEL` | `gemini-3.8-flash` | Which Gemini model answers. `gemini-3.1-flash-lite` is cheaper. (`gemini-3.5-flash` is deprecated: Google sends it to 3.6.) |
| `AI_EMBEDDING_MODEL` | `gemini-embedding-2` | The model that turns searches into vectors, for Write SPL's examples (below). `gemini-embedding-001` also works. |
| `AI_PROVIDER` | `gemini` | `fake` for canned answers |
| `AI_ENABLED` | on | `false` turns answers off, even with a key |
| `AI_DAILY_LIMIT` | 50 | AI requests per account per day (UTC) |
| `AI_SITE_DAILY_LIMIT` | 1000 | AI requests per day for everyone together |
| `AI_ALLOW_LIVE_DATA` | off | With `SPLUNK_MODE=live`, AI stays off until this is `true` |
| `SPLUNK_WEB_URL` | none | Splunk Web's address (e.g. `https://splunk.example.com/en-US`), for **Open in Splunk** on generated searches |

## What's on the page

**The layout**
- **The sidebar** has **New chat**, **Search chats** and every chat from both modes, newest first and grouped by day. The open chat is marked.
  - Point at a chat, or tab to it, to rename or delete it. Deleting asks once more, so a slip doesn't lose a chat.
  - Deleting the chat that's open starts a new one.
  - On phones there's no sidebar. The bar at the top has **Your chats** (the chats page) and **New chat** instead.
- **The bar at the top** has the switch between the two modes. Each mode remembers its open chat, so switching to Write SPL and back returns to the same chat.
- **A new chat** asks its question in the middle of the page, with the box to type in under it and suggested questions below. Once you ask, the box moves to the bottom of the window.
- **In a chat**, your questions are bubbles on the right and answers are plain text.
  - Under each answer are **Copy** and 👍 / 👎. They always show under the newest answer; under older ones, point at the answer to see them.
  - Scrolled up, a round ↓ button takes you back to the newest message.
- **Search chats** opens the chats page: every chat, with search and a filter by mode, plus rename and delete.

**Ask about reports**
- Answers stream in as they're written.
- Reports an answer uses appear as links with their status, so you can open the report and check.
- **Reports** (top right, with how many reports need attention) opens a panel with the briefing (below) and every report the AI can see. Pick a report there to start a chat about it.
- Suggested questions come from your own reports, such as "Why is Web Server 5xx Error Rate warning?".

**Write SPL**
- The answer is the search as a pipeline: the whole query, then each pipe command with one sentence on what it does.
- Point at a step, or press its number, to highlight it in the query.
- A badge says whether the search only reads events, or changes data or does something outside the search (for example `outputlookup` writes a lookup, `sendemail` sends mail). Searches that name no index get a warning too.
- **Each search is checked as it's shown**, without running it (`lib/ai/validate.ts`). A built-in SPL checker catches unknown commands, quotes, brackets or macros that never close, and a pipe with nothing after it. It runs each time, so older answers get today's checks too.
  - It doesn't know apps' own commands, macros or field names, so Splunk may still find a problem.
  - A search that fails the check says why, and offers **Fix the error**, which asks again with the checker's message.
- **Copy SPL** (above the search, like a code block in ChatGPT) copies the search. **Open in Splunk** (when `SPLUNK_WEB_URL` is set) opens it in Splunk's search page, where it runs only when you press Enter there.
- Follow-up suggestions such as "Only the last 7 days" change the search in the same chat.
- **Searches** (top right) lists the searches behind your reports. Pick one to have it explained.

## The briefing, Explain and unusual runs

**The briefing** sits on the home page, between the headline numbers and the runs-per-day chart, and in the **Reports** panel on Ask about reports. Most of it needs no AI:
- **Headline**, such as "3 reports need attention, 1 run looks unusual".
- **Needs attention:** reports whose latest run warns or failed, with their message and an **Ask about it** link.
- **Unusual runs:** reports whose newest run stands out from their recent runs (below), or that the ML job flags ([ml.md](ml.md)), with a sparkline that marks the odd run.
- **In short:** two or three AI sentences, only when AI is on. They're written once for each set of reports and runs, and shared by everyone who sees the same reports. Since the briefing loads without a question (on the home page, or when the Reports panel opens), writing one counts toward the site's daily limit only, not yours.

**Explain** is on every report card and at the top of each report page. It opens a side panel (a bottom sheet on phones):
- **In plain words:** an AI summary of the latest run and of how the search works, written once per run and then reused.
- **At a glance:** plain statistics. These are the unusual run if there is one, the status message, and one sentence per results column (its range, its highest row, or its most common value).
- **Ask more:** links into Ask about reports and Write SPL, with the question filled in.

Each report page's SPL section also has **Explain it step by step**, which opens Write SPL with that search.

**Unusual runs, in plain statistics** (`lib/insights.ts`):
- The newest run's result count and search time are compared with the earlier successful runs (at least 4).
- The median of those runs is what's usual, and the median absolute deviation is how much they normally vary. Both ignore one odd run in the history, unlike the average.
- A run 3.5 or more of those spreads away from usual is flagged, with a floor so a perfectly steady history doesn't flag small changes.
- The bar is strict on purpose: with about 6 runs to compare and two measures per report, a looser one would flag ordinary noise.
- The demo's failed-logins report has a spike (117 accounts over the threshold against about 38 usually), so there's always one to see.

**👍 / 👎** appear under AI answers, under summaries, and on briefing flags ("Worth flagging?"). Votes go in `ai_feedback`, one per person per item; pressing the same thumb again takes the vote back. The flag votes, with what was flagged, are the training labels for the ML job in `ml/` (see [ml.md](ml.md)).

## How Write SPL learns from your searches

Write SPL shows the AI the searches **most like your request**, instead of every report's search. This is called RAG: retrieval-augmented generation. It works like this:

1. **Examples.** These are your reports' searches, plus searches people saved with **Save as example**.
   - A saved search is shared with the groups of the person who saved it, like a report. Admins see them all.
   - Only searches that only read data, and that parse, can be saved.
2. **Comparing.** Each example and each request becomes a vector (an *embedding*, from `AI_EMBEDDING_MODEL`). The 5 closest examples go into the prompt in full. Every report you can see is listed too, with its index and columns.
   - Example vectors are saved in `ai_embeddings`, so each search is sent once.
   - Embeddings cost a fraction of a cent, and are free on the free tier.
3. **Showing what was used.** The answer says which searches it was **based on**.
4. **Falling back.** If the examples can't be compared (no key, a quota, the network), the AI gets every report's search instead, as before.

`lib/ai/retrieval.ts` holds the comparing, and `lib/spl-examples.ts` the examples. Over time, saved searches teach Write SPL your team's style and field names, with no training.

**Measuring it:** `npm run eval:spl` runs Write SPL on 10 requests over the demo reports (`scripts/spl-eval-set.json`).
- It scores each answer: does it parse, does it only read data, does it use the expected index and fields.
- Run it with a real key before and after changing the prompt, the examples or the model. With `AI_PROVIDER=fake` it only shows that the steps work.

## What the AI can see, and what it can't

- **Only your reports.** For each one: its status and message, highlights, the last 7 runs, its SPL, and up to 20 rows of its latest results, plus the time of the last sync. It gets exactly what `lib/dal.ts` lets you see, so it can't mention a report you can't open.
- **Only your chats.** A chat belongs to the account that started it. Anyone else gets "Chat not found", the same answer as for a deleted chat.
- **No tools.** It can't run searches, open links or change anything. It writes text, and that's all.

## Where the code lives

| File | Job |
|---|---|
| `lib/ai/llm.ts` | The only file that talks to Gemini, plus the canned answers for `AI_PROVIDER=fake` |
| `lib/ai/config.ts` | The settings above, and whether AI is on |
| `lib/ai/prompts.ts` | What the AI is told, in plain English |
| `lib/ai/context.ts` | Your reports as text for the AI |
| `lib/ai/spl.ts` | The shape of a Write SPL answer, and the safety check |
| `lib/ai/validate.ts` | Checking each Write SPL search with the built-in SPL checker |
| `lib/ai/stream.ts` | How streamed answers reach the browser (one JSON event per line) |
| `lib/ai/turn.ts` | The checks before each question: signed in, AI on, your chat, today's limit |
| `lib/ai/usage.ts` | Daily limits |
| `lib/ai/report-links.ts` | Turns `[[report-id]]` in answers into report links |
| `lib/ai/suggestions.ts` | Suggested questions |
| `lib/ai/summaries.ts`, `lib/ai/keys.ts` | Explain summaries and briefings: written once, saved under a key that changes with the data |
| `lib/insights.ts` | Unusual runs and the results profile (plain statistics, no AI) |
| `lib/feedback.ts` | 👍 / 👎 votes |
| `lib/chats.ts` | Saved chats (each function checks the owner) |
| `app/api/ai/chat`, `app/api/ai/spl` | The two chat endpoints |
| `app/api/ai/explain/[slug]`, `app/api/ai/briefing` | The two summary endpoints |
| `app/ai/` | The pages, and the rename and delete actions |
| `components/ChatView.tsx`, `ChatAnswer.tsx`, `SplAnswer.tsx` | The chat, an answer, and a Write SPL answer |
| `components/ChatSidebar.tsx`, `ChatHistory.tsx`, `lib/chat-list.ts` | The sidebar and the chats page; chats saved since the page loaded join the sidebar's list |
| `components/AiTopBar.tsx`, `SidePanel.tsx`, `AiPanels.tsx` | The bar with the mode switch, and the Reports and Searches panels |
| `lib/ai/chat-events.ts` | The events the chat, the sidebar and the bar send each other |
| `components/Briefing.tsx`, `BriefingSummary.tsx`, `ExplainButton.tsx`, `FeedbackButtons.tsx` | The briefing, the Explain panel and the thumbs |

## What it costs

`gemini-3.8-flash` costs **$0.75 per million tokens in and $3.75 per million out** until Dec 31, 2026, then $1.50 and $7.50. A token is about 4 characters of English. Its thinking counts as output.

- **One answer costs about half a cent to a cent.** The AI reads roughly 4,000 tokens about your reports and writes a few hundred. On the free tier it costs nothing.
- **Follow-ups cost less.** Gemini caches the start of a prompt once it's over 4,096 tokens, so the reports go first and stay the same from one question to the next.
- **Each answer is capped** at 8,192 tokens, which also caps what one question can cost. A long answer that hits the cap says so.
- **Daily limits:** 50 requests per account per day, and 1,000 for everyone together (`AI_DAILY_LIMIT`, `AI_SITE_DAILY_LIMIT`). A saved summary or briefing costs nothing; writing a new one counts once, however many people are waiting for it. The `ai_usage` collection keeps a week of requests and tokens per account, for a rough idea of the cost:

  ```js
  // mongosh splunkevents
  db.ai_usage.find({ _id: /^site:/ }).sort({ _id: -1 })
  ```

## What's stored

| Collection | Holds | Kept |
|---|---|---|
| `chats` | One document per chat, with its questions and answers | Until you delete it. In `DEMO_MODE`, 24 hours, because visitors share the demo accounts |
| `ai_usage` | Requests and tokens per account per day | 7 days |
| `ai_summaries` | Explain summaries and briefings, under a key that changes with the data or the prompt (`PROMPT_VERSION`) | 30 days |
| `ai_feedback` | 👍 / 👎, one per person per answer, summary or briefing flag | Kept (the ML job's training labels) |
| `spl_examples` | Write SPL answers saved with **Save as example**, shared with the saver's groups | Until the saver takes them back |
| `ai_embeddings` | The vectors of searches Write SPL compares requests with, per embedding model | 90 days |

- A question and its answer are saved together, once the answer is complete.
- An answer you stop, or one that fails, isn't saved. Ask again with **Try again**.
- A summary is finished and saved even if you close the panel, so the next look is instant. One that was cut off isn't saved, so the next look writes a whole one.
- A 👍 / 👎 is checked on the server: it must be about an answer in your own chats, a saved summary of a report you can see, or a flag the briefing shows you. What a flag was about (its reason, measure and score) is worked out there too, not taken from the page.
- A chat holds 50 questions; after that, start a new one.
- A chat keeps the report data it was answered with, even if your access to those reports changes later. Delete it from the sidebar or the chats page if that matters.

## Privacy and safety

- **Free tier:** Google may use what you send to improve its products. On a key with billing turned on (the paid tier), it doesn't. Use only dummy data with a free-tier key.
- **Live company data:** with `SPLUNK_MODE=live`, AI stays off until `AI_ALLOW_LIVE_DATA=true`. Set it only once your company has approved sending report data to the provider. A company would more likely use Vertex AI or its own LLM; see below.
- **Report data can't give the AI orders.** Result rows come from logs, so they can contain any text, including text that looks like instructions. The rows are wrapped in tags the instructions call data, angle brackets are removed from them, and the AI has no tools to misuse.
- **Answers can't send you elsewhere.** Links in answers show as plain text, except links to your reports, and images aren't shown at all. Answers are Markdown, shown without running any HTML in them.
- **The key stays on the server.** `GEMINI_API_KEY` is read only by `lib/ai/llm.ts`, which can't be imported into browser code. Never put it in a `NEXT_PUBLIC_` variable.

## Using another AI

Everything that talks to the AI is in `lib/ai/llm.ts`, behind two functions: `streamText` (Ask about reports) and `generateJson` (Write SPL). Keep their inputs and outputs, and change what's inside.

- **Gemini through Google Cloud (Vertex AI).** This uses the same SDK, under Google Cloud's terms for company data. Create the client with `new GoogleGenAI({ vertexai: true, project, location })` instead of an API key, and sign in with `gcloud auth application-default login`.
- **A company's own LLM.** Replace the two functions with calls to its API. `streamText` gets the instructions, the conversation and an abort signal, and passes each piece of text to `onText`. `generateJson` gets a JSON Schema (from `z.toJSONSchema`) and must return JSON that matches it. If the LLM can't stream, call `onText` once with the whole answer.

## Option: a company's Splunk with SSO, and its approved LLM

Some companies already sign people in to Splunk with their company login (Active Directory) and connect Splunk to an approved internal LLM. Often that's through **Splunk's MCP Server** app, which runs searches with each person's own Splunk role, and lets admins limit which SPL commands an LLM may use. That is a different job from this app's Splunk → MongoDB copy, and the two fit together:

| | Splunk → MongoDB (this app) | LLM searching Splunk live, as you |
|---|---|---|
| Speed | pages load at once | every question runs a search |
| History | keeps runs after Splunk deletes their results | only what Splunk keeps |
| Who sees what | the app's groups (`user_access`) | Splunk's own roles, per person |
| Copies of data | a second copy, which needs approval | none |
| Freshness | as of the last sync | live |

**Suggested setup at work:**
1. Keep MongoDB for the pages and the run history.
2. Point `lib/ai/llm.ts` at the approved internal LLM instead of Gemini.
3. For questions the stored reports can't answer, the approved LLM can search Splunk live, as you, through its existing connection.

Ask your Splunk admin which integration the company uses before building on it.

The full recommendation is in [splunk-data-and-ai-strategy.md](splunk-data-and-ai-strategy.md). It covers how to collect the data with AD sign-in, RAG over past searches, supervised and unsupervised learning, an agent with guardrails, and anomaly detection.

## Splunk's JavaScript SDK, or Python?

- **The sync uses neither.** `lib/splunk/transport.ts` calls Splunk's REST API directly: five read-only endpoints, with retries, tested against fake Splunk responses (`lib/splunk/fixtures/transport.ts`). The JavaScript SDK (`splunk-sdk` on npm) wouldn't add anything.
- **Keep the sync in TypeScript.** The status rules and highlights in `lib/report-config.ts` are TypeScript, and the sync runs them, so a Python sync would mean writing them twice.
- **Python is the better tool for analysis:** pandas for tables of runs, and scikit-learn for anomaly detection. A Python job can read MongoDB and write its results back, so MongoDB is the hand-off between the two languages. Splunk's Python SDK (`splunklib`) is worth adding only if that analysis needs raw events beyond the scheduled reports.

## Ideas for later

- **Running the ML job on a schedule**, right after each sync (see [ml.md](ml.md)).
- **Showing the AI's reasoning:** Gemini can return a summary of its thinking, which could open under an answer.
- **A summary in the report email's place:** the briefing, sent on a schedule to people who still want email.
- **More of ChatGPT's page:**
  - collapsing the sidebar on wide screens;
  - a sidebar that slides in on phones, instead of the chats page;
  - editing a question you sent, and asking for another answer.
