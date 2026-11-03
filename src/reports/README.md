# `src/reports/`: reports, from the database to the screen

- `dal.ts` reads reports from MongoDB and checks who may see each one. Every page gets report data from here.
- `reports.ts` has the report types and small helpers: the list's order, paging, the card's headline.
- `report-config.ts` loads each report's card from `config/report-cards.yaml`: who sees it, its chart, when it warns, its headline numbers. `cards/` checks the file and turns each card into rules. Adding a card: [docs/adding-report-cards.md](../../docs/adding-report-cards.md). What each report shows is in the [report catalog](../../docs/report-catalog.md).
- `insights.ts`, `run-health.ts` and `schedule-load.ts` work out the statistics: unusual runs, the run health grid, when searches run.
- `components/` has what you see: the report list (`ReportBrowser.tsx`), a card (`ReportCard.tsx`), the charts and the results table.
- `overview/` has the home page's charts and notices.

**Open first:** `components/ReportCard.tsx` and `config/report-cards.yaml` (at the repo's root).

**Tests:** the `*.test.ts` next to each file (`npm test`). **More:** [docs/reference/reports.md](../../docs/reference/reports.md).
