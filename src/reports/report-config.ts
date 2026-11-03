import { statSync } from 'node:fs';
import { loadReportCards, reportCardsPath } from '@/reports/cards/load';
import type { ReportCard } from '@/reports/cards/schema';
import type { Cell, ChartPanel, ChartScatter, ChartThreshold, ChartType, ReportCategory, ReportHighlight } from '@/reports/reports';

// What Splunk doesn't know about each report, keyed by the saved search name:
// its slug, category and tags, who may see it, and optional chart, status and
// highlight rules. They're written in config/report-cards.yaml, which this
// file loads and checks (src/reports/cards/). The sync worker and the scripts
// use it; it must not import `server-only` or anything from `next/*`.
//
// Scheduled searches missing from the cards are still synced when they email
// their results (SYNC_REPORTS=emailed), but only admins can see them until
// they get a card.

export type ResultSet = {
    columns: string[];
    rows: Cell[][];
    resultCount: number;
};

// Turns a run's results into a warning (or failure) with a short explanation.
export type StatusRule = (results: ResultSet) => { status: 'warning' | 'failed'; message: string } | null;

export type HighlightRule = (results: ResultSet & { previousResultCount?: number; durationSec: number }) => ReportHighlight[];

export type ReportConfig = {
    slug: string;
    category: ReportCategory;
    tags: string[];
    // Groups that may see the report. Defaults to the email lists in
    // action.email.to (secops@example.com → secops). Copy them here before
    // turning off a report's email action, or the defaults disappear with it.
    groups?: string[];
    // 'none' shows only the results table. y picks the measure to plot
    // (default: the first numeric column). type overrides the chart saved in Splunk.
    // threshold draws a limit across the chart and highlights the values past
    // it; max turns the bars into meters that fill up to it (100 for a percentage).
    // panels draws one small chart per measure instead of one chart, and
    // scatter adds a chart of dots placing y against another measure.
    chart?: 'none' | { type?: ChartType; y?: string; threshold?: ChartThreshold; max?: number; panels?: ChartPanel[]; scatter?: ChartScatter };
    // Overrides the index text parsed from the SPL.
    index?: string;
    statusRule?: StatusRule;
    highlights?: HighlightRule;
};

// The cards are read when first needed, and again whenever the file changes,
// so `npm run sync:watch` picks up an edit at its next sync. A mistake in the
// file throws a ReportCardsError that lists every problem.
let loaded: (ReturnType<typeof loadReportCards> & { file: string; changed: number }) | undefined;

function current() {
    const file = reportCardsPath();
    const changed = statSync(file).mtimeMs;
    if (loaded?.file !== file || loaded.changed !== changed) loaded = { ...loadReportCards(file), file, changed };
    return loaded;
}

// The cards as written in config/report-cards.yaml, for checks that read them
// (npm run card:preview, npm run splunk:check).
export const reportCards = (): Record<string, ReportCard> => current().cards;

// The settings the sync uses, keyed by each report's Splunk name.
export const reportConfig = (): Record<string, ReportConfig> => current().configs;
