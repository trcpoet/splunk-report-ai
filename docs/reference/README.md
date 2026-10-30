# File reference

What every file in SplunkEvents does, in detail, folder by folder. Start with [architecture.md](../architecture.md) for how the pieces fit together, and [configuration.md](../configuration.md) for every setting.

| Page | Covers |
|---|---|
| [app.md](app.md) | `app/`: pages, layouts, Server Actions, API routes, the error screens and the global styles |
| [components.md](components.md) | `components/`: everything you see, grouped by feature |
| [lib.md](lib.md) | `lib/`: data access, access rules, sign-in, chats, votes, statistics, formatting, report settings |
| [lib-ai.md](lib-ai.md) | `lib/ai/`: Ask AI, Write SPL, summaries, limits, retrieval |
| [lib-splunk.md](lib-splunk.md) | `lib/splunk/`: the sync, Splunk's REST API, the mapping and the dummy data |
| [database.md](database.md) | `database/`: the Mongoose models, one per collection |
| [tooling.md](tooling.md) | The worker, the scripts, the ML job, and the root files: config, Docker, CI, Claude Code |

## How each entry reads

- **What it does**, in plain words.
- **Exports**: the names other files import. React components are listed by their default export.
- **Used by**: the files that import it, taken from the code's imports. Tests are listed apart when they matter.
- **Change it when**: what you'd edit here, and what else has to change with it.

Two things hold for almost every file:
- **It starts with a comment saying what it's for.** When this reference and that comment disagree, the comment is newer: fix the reference.
- **`'use client'` at the top marks a client component**, which runs in the browser too. Everything else under `app/` and `components/` is a server component, which runs only on the server and can read data through `lib/dal.ts`.
