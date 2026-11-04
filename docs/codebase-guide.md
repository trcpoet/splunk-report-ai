# Codebase guide

Where to start as an engineer on SplunkEvents, and what to know before you change things.

## Reading order

1. **Run it first.** `docker compose up --build` needs nothing else installed ([docker.md](docker.md)); or follow "Running locally" in the [README](../README.md#running-locally). Sign in as `admin@example.com`, then as `finance.analyst@example.com`, and compare: that's the access rules at work.
2. **[report-catalog.md](report-catalog.md):** what each report shows and where its numbers come from, without any code.
3. **[architecture.md](architecture.md):** the programs, where data lives and how it moves, how a page is built, who sees what, Ask AI, the ML job, and where it all runs.
4. **This page:** where to change what, the rules that are easy to break, and the words the code uses.
5. **When you need the detail:** [configuration.md](configuration.md) for every setting (each environment variable with the file that reads it, the report cards, access, AI, the sync, caching, the look, build, deploy and CI), and [the file reference](reference/README.md) for what each file does, folder by folder. Each `src/` folder also has a short `README.md`.

The topic guides go deeper on one area each: [all the docs](README.md).

## In short

SplunkEvents shows Splunk scheduled reports, the ones teams used to receive by email, in a web app where each team sees only its own reports.
- **Three programs share one MongoDB database:**
  - a sync worker that copies runs from Splunk (or dummy fixtures);
  - a Next.js 16 web app that reads them through `src/reports/dal.ts`;
  - an optional Python ML job.
- **AI is optional.** Without a `GEMINI_API_KEY`, everything except AI answers works.

## Where to change what

| To | Change | Then |
|---|---|---|
| Add or change a report's card: its category, who sees it, its chart, headline numbers, when it warns | `config/report-cards.yaml` only ([adding-report-cards.md](adding-report-cards.md)) | `npm run card:preview "<report>"`, `npm run check`, `npm run sync` |
| Change who sees a report | the card's `groups`. A person's groups are in the `user_access` collection; the demo accounts' come from `src/people/demo-users.ts` | `npm run seed` for the demo accounts ([report-access.md](report-access.md)) |
| Change the dummy reports | `src/splunk/fixtures/reports.ts` | `npm run sync` |
| Change what the sync copies, or how Splunk's answers become reports | `src/splunk/sync.ts`, `src/splunk/map.ts` | `npm test` ([reference/splunk.md](reference/splunk.md)) |
| Change a page | `src/app/<address>/page.tsx`. The report page's pieces are in `src/reports/components/`, the home page's charts in `src/reports/overview/` | [reference/app.md](reference/app.md) |
| Read report data in a new page or API route | only through `src/reports/dal.ts`, which checks who is asking | signed out gets 401 and a hidden report 404, as `e2e/access.spec.ts` checks |
| Change what the AI sees or says | `src/ai/context.ts` (the report data it gets), `src/ai/prompts.ts` (its instructions: bump `PROMPT_VERSION`) | try it with `AI_PROVIDER=fake`, no key needed ([ai.md](ai.md)) |
| Change which sign-in endpoints exist | the list in `src/app/api/auth/[...all]/route.ts` | `e2e/access.spec.ts` |
| Change how fresh report data is | `src/reports/dal.ts` (`'use cache'`, `cacheTag('reports')`) | [caching-and-loading.md](caching-and-loading.md) |
| Add a setting | read it where it's used | a row in [configuration.md](configuration.md), and in `.env.example` for an environment variable |
| Change colors or the layout | the tokens at the top of `src/app/globals.css`; chart chrome in `src/shared/chart-theme.ts` | [configuration.md](configuration.md#look-and-feel) |

## Before you change things

**This Next.js is version 16, with Cache Components.** Read the guide for what you touch in `node_modules/next/dist/docs/`; much differs from older versions.
- **Cached data:** use `'use cache'` with `cacheTag('reports')`, as in `src/reports/dal.ts`. The sync clears it through `/api/revalidate`.
- **Uncached data:** it must sit inside `<Suspense>` or `<Reveal>`.
- **Uncached MongoDB reads in a page** must start with `await connection()`. Otherwise `next dev` reports "unstable value `Date.now()` while prerendering" ([caching-and-loading.md](caching-and-loading.md)).
- **Per-person data** uses `'use cache: private'`, which is cached in that person's browser only.
- **Middleware** is called `src/proxy.ts`.

**Next keeps the pages you visited, hidden (React Activity).** So:
- give elements unique ids with `useId()`, not fixed ones;
- clean up in effects (a hidden page runs its cleanup), and close dialogs when a page hides (`usePanel` does);
- don't clear a page's state just before leaving it, because returning to its address brings that same instance back;
- select visible elements in browser tests (`:visible`, `checkVisibility()`).

**The error checks are at their strictest.** `npm run check` runs them all: the type check, ESLint and the tests.
- TypeScript treats every `list[i]` and `record[key]` as possibly missing (`noUncheckedIndexedAccess`). Check it, or give a default such as `?? ''`. Live Splunk results can have rows shorter than their columns, so a missing cell reads as empty (`formatCell`, `parseNumber`).
- ESLint adds typescript-eslint's `strictTypeChecked` rules: a promise is awaited, or started on purpose with `void`; a `catch` callback takes `unknown`; a condition that is always true or always false is an error.
- Don't quiet a check with `!` or `as` in app code: check the value instead. Tests may use `!`, because a wrong guess fails the test anyway.
- To read a reply from the app's own API in the browser, use `readJson` and `replyError` (`src/shared/api-reply.ts`).

**The React Compiler's lint rules are on.** No `setState` directly in an effect's body, no `Date.now()` or `Math.random()` while rendering, and no changing props or captured variables.

**Access.**
- Read report data only through `src/reports/dal.ts`, and chats, votes and saved examples only through `src/ai/chats.ts`, `src/ai/feedback.ts` and `src/ai/spl-examples.ts`. All of them check who is asking.
- Never return `allowedGroups` from an API.
- Hidden must look the same as missing.

**Secrets.**
- `.env*` files stay out of git.
- `SPLUNK_TOKEN` lives in the sync worker's environment only. The web app has no Splunk token.
- Use `DEMO_MODE` only with dummy data.
- Never put a real company's Splunk address, token or data in this public repo.

**The sync.**
- It never starts searches.
- After changing `config/report-cards.yaml` or the dummy data, run `npm run sync` (and sync Atlas for the hosted demo).

**AI.**
- Only `src/ai/llm.ts` calls the AI.
- Use `AI_PROVIDER=fake` to work on the pages without a key.
- With live Splunk data, AI stays off until `AI_ALLOW_LIVE_DATA=true`.
- Bump `PROMPT_VERSION` after changing the summary or briefing prompts.

**Statistics.** `src/reports/insights.ts` and `ml/features.py` share their rules (at least 4 earlier runs, 3.5 robust spreads). Change both together.

**Dates and numbers** go through `src/shared/format.ts`, so the server and the browser show the same text.

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
| Fixtures | The dummy reports and the fake Splunk that serves them (`src/splunk/fixtures/`). |
| Sync | Copying reports and new runs from Splunk or the fixtures into MongoDB. |
| Viewer | The signed-in person a page or route is answering. |
| Visible | A report the viewer may see (`canView`). |
| Card | A report's entry in `config/report-cards.yaml`: its category, who sees it, its chart, its headline numbers, and its `warn` and `fail` rules. Also the box for each report on the home page, which shows its first headline number. |
| Status rule | What turns results into a warning, such as "a host above 2% errors": a card's `warn` or `fail` rule, which `src/reports/cards/rules.ts` turns into a function. |
| Highlight | A headline number on a report, such as results with their change since the previous run. |
| Unusual run | A newest run that stands out from its earlier runs (`src/reports/insights.ts`), or that the ML job flags. |
| Flag | An entry in the briefing, either "Needs attention" or "Unusual runs", with a "Worth flagging?" vote. |
| Briefing | The summary box on the home page and in Ask AI's Reports panel. |
| Mode | Ask AI's two kinds of chat: Ask about reports, and Write SPL. |
| Turn | One question and its answer in a chat. |
| Example | A search Write SPL shows the AI as a model answer: a report's search, or one saved with "Save as example". |
| Revalidate | Telling the app to drop its cached report data (`/api/revalidate`). |

## Making the code easier to read

The code already follows most of what helps: a plain-English header on almost every file, one job per file, shared pure functions with tests next to them, and a guide per area in `docs/`. In order of value for the effort, the next steps would be:

1. **Add header comments to the files that lack one.** These are `src/shared/components/Navbar.tsx`, `src/reports/components/StatusBadge.tsx`, `src/shared/components/LightRays.tsx`, `src/app/ai/reports/page.tsx`, `src/app/ai/spl/page.tsx` and `src/shared/utils.ts`. A few minutes of work.
2. **Split `src/app/globals.css`** (about 1,800 lines) into one file per area, imported from `globals.css`: base, reports, charts, briefing, Ask AI.
3. **Split the longest modules by concern:**
   - `src/splunk/map.ts` (about 540 lines) into schedule, status, charts and highlights;
   - `src/ai/components/ChatView.tsx` (about 430 lines) into the message list and the box to type in.
4. **Record the "why" decisions** as short notes in `docs/decisions/`, one per decision:
   - the REST API rather than Splunk's SDKs;
   - Gemini behind one file;
   - `connection()` for uncached reads;
   - the double cache refresh;
   - Vercel deploying `main` only;
   - the ChatGPT-style Ask AI layout.
