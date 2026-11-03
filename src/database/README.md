# `src/database/`: the MongoDB collections

One file per collection, grouped by area:
- `reports/`: the reports, their runs, the sync's state and the ML job's scores;
- `ai/`: chats, AI usage, saved summaries, votes, embeddings and saved examples;
- `people/`: each person's groups.

`index.ts` exports them all, and code imports models from `@/database`, never from a model file. `mongodb.ts` is the connection.

**More:** [docs/reference/database.md](../../docs/reference/database.md) and [docs/mongodb-and-access.md](../../docs/mongodb-and-access.md).
