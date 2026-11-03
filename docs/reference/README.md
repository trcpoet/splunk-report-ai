# File reference

What every file in SplunkEvents does, in detail, folder by folder. Start with [architecture.md](../architecture.md) for how the pieces fit together, and [configuration.md](../configuration.md) for every setting.

| Page | Covers |
|---|---|
| [app.md](app.md) | `src/app/`: pages, layouts, Server Actions, API routes, the error screens and the global styles |
| [reports.md](reports.md) | `src/reports/`: reading reports (the access check), report settings, statistics, the list, the cards, the report page and the charts |
| [ai.md](ai.md) | `src/ai/`: Ask AI, Write SPL, Explain, the briefing, summaries, limits, retrieval, chats and votes |
| [splunk.md](splunk.md) | `src/splunk/`: the sync, Splunk's REST API, the mapping, `splunk:check` and the dummy data |
| [people.md](people.md) | `src/people/`: sign-in, sessions, the demo accounts, and who may see which report |
| [shared.md](shared.md) | `src/shared/`: the layout, small pieces, formatting and shadcn's `ui/` |
| [database.md](database.md) | `src/database/`: the Mongoose models, one per collection, and the connection |
| [tooling.md](tooling.md) | The worker, the scripts, the ML job, and the root files: config, Docker, CI, Claude Code |

## How each entry reads

- **What it does**, in plain words.
- **Exports**: the names other files import. React components are listed by their default export.
- **Used by**: the files that import it, taken from the code's imports. Tests are listed apart when they matter.
- **Change it when**: what you'd edit here, and what else has to change with it.

Two things hold for almost every file:
- **It starts with a comment saying what it's for.** When this reference and that comment disagree, the comment is newer: fix the reference.
- **`'use client'` at the top marks a client component**, which runs in the browser too. Everything else under `src/app/` and in `components/` folders is a server component, which runs only on the server and can read data through `src/reports/dal.ts`.

## Tests

`npm test` runs every `src/**/*.test.ts` with Node's test runner through `tsx`. Each test file sits next to the file it tests, and tests are named as sentences. `npm run check` runs the type check and ESLint first. The browser tests are in `e2e/` ([tooling.md](tooling.md#browser-tests)).
