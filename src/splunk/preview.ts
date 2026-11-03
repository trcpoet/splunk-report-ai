import { columnsUsed } from '@/reports/cards/columns';
import { reportCards } from '@/reports/report-config';
import { deriveReportFields, type RunFacts } from './map';
import type { SyncReports } from './settings';
import { fetchRun, listScheduledReports, scheduledRunSids, type ScheduledReport } from './sync';
import type { SplunkTransport } from './transport';

// npm run card:preview: one report's card and page as the app will show them,
// from its newest finished run in Splunk, read the way the sync reads it.
// It only reads, and saves nothing. scripts/card-preview.ts prints it.

// How many of a report's newest runs to look through for a finished one.
const RUNS_TO_TRY = 10;

// The newest run that finished and still has its results, or null.
export async function newestFinishedRun(transport: SplunkTransport, report: ScheduledReport): Promise<RunFacts | null> {
    for (const sid of await scheduledRunSids(transport, report, RUNS_TO_TRY)) {
        const run = await fetchRun(transport, report, sid);
        if (run && run.status !== 'failed' && !run.resultsExpired) return run;
    }
    return null;
}

export type Preview = {
    report: ScheduledReport;
    // Whether config/report-cards.yaml has a card for it; without one, the defaults apply.
    hasCard: boolean;
    run: RunFacts | null;
    derived: ReturnType<typeof deriveReportFields> | null;
    // Columns the card names that the run's results don't have: typos.
    unknownColumns: string[];
};

type PreviewOptions = { timeZone: string; syncReports: SyncReports };

// The report with this Splunk name or slug, among the ones the sync takes.
export async function findReport(transport: SplunkTransport, nameOrSlug: string, { timeZone, syncReports }: PreviewOptions) {
    const reports = await listScheduledReports(transport, timeZone, new Date(), () => {}, syncReports);
    const wanted = nameOrSlug.trim().toLowerCase();
    return { report: reports.find(({ entry, meta }) => entry.name.toLowerCase() === wanted || meta.slug === wanted), names: reports.map(({ entry }) => entry.name) };
}

export async function previewReport(transport: SplunkTransport, report: ScheduledReport): Promise<Preview> {
    const card = reportCards()[report.entry.name];
    const run = await newestFinishedRun(transport, report);
    const derived = run ? deriveReportFields({ recent: [run], resultsRun: run, chartType: report.meta.chartType, config: report.config }) : null;
    const unknownColumns = card && run ? columnsUsed(card).filter((column) => !run.columns.includes(column)) : [];
    return { report, hasCard: Boolean(card), run, derived, unknownColumns };
}
