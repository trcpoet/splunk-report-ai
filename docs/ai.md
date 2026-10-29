# Ask AI

A plain-language guide to the **Ask AI** page: what it does, how to turn it on, what it costs, what the AI can see, and how to swap the AI for another one.

## The short version

- **Ask AI** (navbar) has three tabs:
  - **Ask about reports:** questions about your reports, answered from their latest runs.
  - **Write SPL:** describe a search, or paste one, and get the SPL step by step.
  - **History:** every chat from both tabs, to reopen, rename or delete.
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
| `AI_PROVIDER` | `gemini` | `fake` for canned answers |
| `AI_ENABLED` | on | `false` turns answers off, even with a key |
| `AI_DAILY_LIMIT` | 50 | AI requests per account per day (UTC) |
| `AI_SITE_DAILY_LIMIT` | 1000 | AI requests per day for everyone together |
| `AI_ALLOW_LIVE_DATA` | off | With `SPLUNK_MODE=live`, AI stays off until this is `true` |
| `SPLUNK_WEB_URL` | none | Splunk Web's address (e.g. `https://splunk.example.com/en-US`), for **Open in Splunk** on generated searches |

## What each tab does

**Ask about reports**
- Answers stream in as they're written.
- Reports an answer uses appear as links with their status, so you can open the report and check.
- The side panel lists what the AI can see. Pick a report there to ask about it.
- Suggested questions come from your own reports, such as "Why is Web Server 5xx Error Rate warning?".

**Write SPL**
- The answer is the search as a pipeline: the whole query, then each pipe command with one sentence on what it does.
- Point at a step, or press its number, to highlight it in the query.
- A badge says whether the search only reads events, or changes data or does something outside the search (for example `outputlookup` writes a lookup, `sendemail` sends mail). Searches that name no index get a warning too.
- **Copy SPL** copies the search. **Open in Splunk** (when `SPLUNK_WEB_URL` is set) opens it in Splunk's search page, where it runs only when you press Enter there.
- Follow-up suggestions such as "Only the last 7 days" change the search in the same chat.
- The side panel lists the searches behind your reports. Pick one to have it explained.

**History**
- Your chats from both tabs, newest first, grouped by day. You can search them and filter by tab.
- Rename a chat or delete it. Deleting asks once more, so a slip doesn't lose a chat.

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
| `lib/ai/stream.ts` | How streamed answers reach the browser (one JSON event per line) |
| `lib/ai/turn.ts` | The checks before each question: signed in, AI on, your chat, today's limit |
| `lib/ai/usage.ts` | Daily limits |
| `lib/ai/report-links.ts` | Turns `[[report-id]]` in answers into report links |
| `lib/ai/suggestions.ts` | Suggested questions |
| `lib/chats.ts` | Saved chats (each function checks the owner) |
| `app/api/ai/chat`, `app/api/ai/spl` | The two endpoints the page calls |
| `app/ai/` | The pages, and the rename and delete actions |
| `components/ChatView.tsx`, `ChatAnswer.tsx`, `SplAnswer.tsx`, `ChatHistory.tsx`, `AiTabs.tsx` | The page's parts |

## What it costs

`gemini-3.8-flash` costs **$0.75 per million tokens in and $3.75 per million out** until Dec 31, 2026, then $1.50 and $7.50. A token is about 4 characters of English. Its thinking counts as output.

- **One answer costs about half a cent to a cent.** The AI reads roughly 4,000 tokens about your reports and writes a few hundred. On the free tier it costs nothing.
- **Follow-ups cost less.** Gemini caches the start of a prompt once it's over 4,096 tokens, so the reports go first and stay the same from one question to the next.
- **Each answer is capped** at 8,192 tokens, which also caps what one question can cost. A long answer that hits the cap says so.
- **Daily limits:** 50 requests per account per day, and 1,000 for everyone together (`AI_DAILY_LIMIT`, `AI_SITE_DAILY_LIMIT`). The `ai_usage` collection keeps a week of requests and tokens per account, for a rough idea of the cost:

  ```js
  // mongosh splunkevents
  db.ai_usage.find({ _id: /^site:/ }).sort({ _id: -1 })
  ```

## What's stored

| Collection | Holds | Kept |
|---|---|---|
| `chats` | One document per chat, with its questions and answers | Until you delete it. In `DEMO_MODE`, 24 hours, because visitors share the demo accounts |
| `ai_usage` | Requests and tokens per account per day | 7 days |

- A question and its answer are saved together, once the answer is complete.
- An answer you stop, or one that fails, isn't saved. Ask again with **Try again**.
- A chat holds 50 questions; after that, start a new one.
- A chat keeps the report data it was answered with, even if your access to those reports changes later. Delete it from History if that matters.

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

## Splunk's JavaScript SDK, or Python?

- **The sync uses neither.** `lib/splunk/transport.ts` calls Splunk's REST API directly: five read-only endpoints, with retries, tested against fake Splunk responses (`lib/splunk/fixtures/transport.ts`). The JavaScript SDK (`splunk-sdk` on npm) wouldn't add anything.
- **Keep the sync in TypeScript.** The status rules and highlights in `lib/report-config.ts` are TypeScript, and the sync runs them, so a Python sync would mean writing them twice.
- **Python is the better tool for analysis:** pandas for tables of runs, and scikit-learn for anomaly detection. A Python job can read MongoDB and write its results back, so MongoDB is the hand-off between the two languages. Splunk's Python SDK (`splunklib`) is worth adding only if that analysis needs raw events beyond the scheduled reports.

## Ideas for later

- **A briefing box** on the home page and here: what needs attention, which runs look unusual, and a two-sentence AI summary, cached per sync.
- **An Explain button** on every report card: a plain-words summary of the report, plus a quick profile of its results.
- **Spotting unusual runs:** simple statistics in TypeScript first, then a Python job (pandas, scikit-learn) that learns from 👍 / 👎 votes which flags are worth showing.
- **Thumbs up and down** on answers, to see which ones help.
- **Showing the AI's reasoning:** Gemini can return a summary of its thinking, which could open under an answer.
