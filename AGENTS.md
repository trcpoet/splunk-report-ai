<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Report cards

Each Splunk report's card (its category, who sees it, its chart, its headline numbers, and when it warns) is data in `config/report-cards.yaml`, not code. To add or change cards, or to turn a Splunk dashboard's tiles into cards, follow `docs/adding-report-cards.md`, and its "Rules for AI assistants" in particular:
- Edit only `config/report-cards.yaml` (and the company copy of `docs/report-catalog.md`).
- Use only column names that `npm run card:preview "<report>"` lists. Never guess one.
- Check with `npm run card:preview` and `npm run check`, and fix every ✗.
- Never put tokens, company Splunk addresses or real results in this public repo.
