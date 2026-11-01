# Codebase guide

Where to start as an engineer on SplunkEvents, and what to know before you change things.

## Reading order

1. **[architecture.md](architecture.md):** the programs, where data lives and how it moves, how a page is built, who sees what, Ask AI, the ML job, and where it all runs.
2. **[configuration.md](configuration.md):** every setting. That's each environment variable (with the file that reads it), `lib/report-config.ts`, access, AI, the sync, statistics, caching, the look, build, deploy and CI.
3. **[The file reference](reference/README.md):** what each file does, in detail, folder by folder: [app/](reference/app.md), [components/](reference/components.md), [lib/](reference/lib.md), [lib/ai/](reference/lib-ai.md), [lib/splunk/](reference/lib-splunk.md), [database/](reference/database.md), and [the rest](reference/tooling.md).
4. **This page:** the rules that are easy to break, and the words the code uses.

The topic guides go deeper on one area each: [all the docs](README.md).

## In short

SplunkEvents shows Splunk scheduled reports, the ones teams used to receive by email, in a web app where each team sees only its own reports.
- **Three programs share one MongoDB database:**
  - a sync worker that copies runs from Splunk (or dummy fixtures);
  - a Next.js 16 web app that reads them through `lib/dal.ts`;
  - an optional Python ML job.
- **AI is optional.** Without a `GEMINI_API_KEY`, everything except AI answers works.

## Before you change things

**This Next.js is version 16, with Cache Components.** Read the guide for what you touch in `node_modules/next/dist/docs/`; much differs from older versions.
- **Cached data:** use `'use cache'` with `cacheTag('reports')`, as in `lib/dal.ts`. The sync clears it through `/api/revalidate`.
- **Uncached data:** it must sit inside `<Suspense>` or `<Reveal>`.
- **Uncached MongoDB reads in a page** must start with `await connection()`. Otherwise `next dev` reports "unstable value `Date.now()` while prerendering" ([caching-and-loading.md](caching-and-loading.md)).
- **Per-person data** uses `'use cache: private'`, which is cached in that person's browser only.
- **Middleware** is called `proxy.ts`.

**Next keeps the pages you visited, hidden (React Activity).** So:
- give elements unique ids with `useId()`, not fixed ones;
- clean up in effects (a hidden page runs its cleanup), and close dialogs when a page hides (`usePanel` does);
- don't clear a page's state just before leaving it, because returning to its address brings that same instance back;
- select visible elements in browser tests (`:visible`, `checkVisibility()`).

**The React Compiler's lint rules are on.** No `setState` directly in an effect's body, no `Date.now()` or `Math.random()` while rendering, and no changing props or captured variables.

**Access.**
- Read report data only through `lib/dal.ts`, and chats, votes and saved examples only through `lib/chats.ts`, `lib/feedback.ts` and `lib/spl-examples.ts`. All of them check who is asking.
- Never return `allowedGroups` from an API.
- Hidden must look the same as missing.

**Secrets.**
- `.env*` files stay out of git.
- `SPLUNK_TOKEN` lives in the sync worker's environment only. The web app has no Splunk token.
- Use `DEMO_MODE` only with dummy data.
- Never put a real company's Splunk address, token or data in this public repo.

**The sync.**
- It never starts searches.
- After changing `lib/report-config.ts` or the dummy data, run `npm run sync` (and sync Atlas for the hosted demo).

**AI.**
- Only `lib/ai/llm.ts` calls the AI.
- Use `AI_PROVIDER=fake` to work on the pages without a key.
- With live Splunk data, AI stays off until `AI_ALLOW_LIVE_DATA=true`.
- Bump `PROMPT_VERSION` after changing the summary or briefing prompts.

**Statistics.** `lib/insights.ts` and `ml/features.py` share their rules (at least 4 earlier runs, 3.5 robust spreads). Change both together.

**Dates and numbers** go through `lib/format.ts`, so the server and the browser show the same text.

**Shipping.**
- Branch off the latest `main` with `--no-track`.
- Push with `git push -u <remote> <branch>:refs/heads/<branch>`. This repo's git settings push to the tracked branch, so a branch that tracks `main` would push there.
- Open a PR against `main` and wait for CI ("Lint, test and build" is required). Vercel deploys `main` only.

**Code style.**
- Each file starts with a plain-English comment saying what it's for.
- One job per file.
- Comments say *why*.
- Tests are named as sentences.
- Guides go in `docs/`, and new files get an entry in the [file reference](reference/README.md).

## Glossary

| Word | Meaning |
|---|---|
| Report | A Splunk scheduled saved search that the app shows. Its `slug` is its id in URLs. |
| Run | One execution of a report by Splunk's scheduler, identified by its `sid`. |
| Fixtures | The dummy reports and the fake Splunk that serves them (`lib/splunk/fixtures/`). |
| Sync | Copying reports and new runs from Splunk or the fixtures into MongoDB. |
| Viewer | The signed-in person a page or route is answering. |
| Visible | A report the viewer may see (`canView`). |
| Status rule | A function in `report-config` that turns results into a warning, such as "a host above 2% errors". |
| Highlight | A headline number on a report, such as results with their change since the previous run. |
| Unusual run | A newest run that stands out from its earlier runs (`lib/insights.ts`), or that the ML job flags. |
| Flag | An entry in the briefing, either "Needs attention" or "Unusual runs", with a "Worth flagging?" vote. |
| Briefing | The summary box on the home page and in Ask AI's Reports panel. |
| Mode | Ask AI's two kinds of chat: Ask about reports, and Write SPL. |
| Turn | One question and its answer in a chat. |
| Example | A search Write SPL shows the AI as a model answer: a report's search, or one saved with "Save as example". |
| Revalidate | Telling the app to drop its cached report data (`/api/revalidate`). |

## Making the code easier to read

The code already follows most of what helps: a plain-English header on almost every file, one job per file, shared pure functions with tests next to them, and a guide per area in `docs/`. In order of value for the effort, the next steps would be:

1. **Add header comments to the files that lack one.** These are `components/Navbar.tsx`, `components/StatusBadge.tsx`, `components/RunHistory.tsx`, `components/LightRays.tsx`, `app/ai/reports/page.tsx`, `app/ai/spl/page.tsx` and `lib/utils.ts`. A few minutes of work.
2. **Move the browser click-through checks into the repo.** They live outside it today. As Playwright tests in an `e2e/` folder, run by CI against `docker compose up`, they would document how each page behaves, and catch changes that break it.
3. **Split `app/globals.css`** (about 1,600 lines) into one file per area, imported from `globals.css`: base, reports, charts, briefing, Ask AI.
4. **Group `components/` into feature folders:** `reports/`, `charts/`, `ai/`, `briefing/`, `layout/`. 38 files sit side by side today. Moving them changes many imports, so do it in a PR of its own. The [components reference](reference/components.md) already uses these groups.
5. **Split the longest modules by concern:**
   - `lib/splunk/map.ts` (about 450 lines) into schedule, status, charts and highlights;
   - `components/ChatView.tsx` (about 420 lines) into the message list and the box to type in.
6. **Record the "why" decisions** as short notes in `docs/decisions/`, one per decision:
   - the REST API rather than Splunk's SDKs;
   - Gemini behind one file;
   - `connection()` for uncached reads;
   - the double cache refresh;
   - Vercel deploying `main` only;
   - the ChatGPT-style Ask AI layout.
