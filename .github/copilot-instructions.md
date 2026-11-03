# Instructions for AI assistants

SplunkEvents shows Splunk scheduled reports in a Next.js 16 web app. A sync worker copies the reports' runs from Splunk into MongoDB; the app never runs a search.

- **Next.js 16 differs from older versions.** Read the guide for what you change in `node_modules/next/dist/docs/` first (see `AGENTS.md`).
- **Report cards are data, not code.** Each report's card (its category, who sees it, its chart, its headline numbers, and its warn and fail rules) is in `config/report-cards.yaml`. To add or change cards, or to turn a Splunk dashboard's tiles into cards, follow `docs/adding-report-cards.md`, including its "Rules for AI assistants".
- **Use only real column names:** the ones `npm run card:preview "<report>"` lists.
- **Check your work:** run `npm run check` (types, lint and tests) before you finish.
- **This repo is public.** Never add tokens, company Splunk addresses, real hostnames or real results.

Where things are, and the rules that are easy to break: `docs/codebase-guide.md`.
