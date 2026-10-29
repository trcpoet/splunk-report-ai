import { formatDateTime, formatDuration } from '@/lib/format';
import type { Cell, SplunkReport, SyncInfo } from '@/lib/reports';

// What the model is told about the reports. Two rules:
// - Only reports the person may see. Callers pass what lib/dal.ts returned for
//   them, so an answer can't mention a report they couldn't open.
// - The same text for the same data: reports in slug order, fields in a fixed
//   order, no clock times. Gemini then reuses its cache of this text from one
//   question to the next, which makes follow-ups cheaper.
//
// Result rows come from Splunk logs, so they can contain any text, even text
// that reads like instructions. Everything is inside <report> tags that the
// instructions call data, and angle brackets are taken out of the values.

// Rows per report sent to the model. The rest are summarized by the counts.
export const MAX_ROWS = 20;

const clean = (value: Cell | string) => String(value).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);

function resultsTable(report: SplunkReport): string[] {
    if (report.columns.length === 0) return ['Results: none stored yet'];

    const shown = report.rows.slice(0, MAX_ROWS);
    return [
        `Results (showing ${shown.length} of ${report.resultCount} rows):`,
        report.columns.map(clean).join(' | '),
        ...shown.map((row) => row.map(clean).join(' | ')),
    ];
}

function describeReport(report: SplunkReport): string {
    const lines = [
        `<report id="${report.slug}">`,
        `Title: ${clean(report.title)}`,
        `What it checks: ${clean(report.description)}`,
        `Category: ${report.category}`,
        `Status: ${report.status}${report.statusMessage ? ` (${clean(report.statusMessage)})` : ''}`,
        `Schedule: ${clean(report.schedule)}, time range ${clean(report.timeRange)}`,
        `Index: ${clean(report.index)}`,
        `Last run: ${formatDateTime(report.lastRun)}${report.resultsRunAt && report.resultsRunAt !== report.lastRun ? `; results are from ${formatDateTime(report.resultsRunAt)}` : ''}`,
        ...(report.highlights.length > 0
            ? [`Highlights: ${report.highlights.map(({ label, value, note }) => `${clean(label)} ${clean(value)}${note ? ` (${clean(note)})` : ''}`).join('; ')}`]
            : []),
        `Recent runs, oldest first: ${report.history
            .map((run) => `${formatDateTime(run.runAt)} ${run.status}, ${run.resultCount} results, ${run.status === 'failed' ? 'skipped' : formatDuration(run.durationSec)}`)
            .join('; ')}`,
        'SPL:',
        report.spl,
        ...resultsTable(report),
        '</report>',
    ];
    return lines.join('\n');
}

// The reports, for the Ask about reports tab.
export function reportsContext(reports: SplunkReport[], sync: SyncInfo | null): string {
    const asOf = sync ? `Data as of ${formatDateTime(sync.lastSuccessAt)}${sync.mode === 'fixture' ? ' (demo data)' : ''}.` : 'Data freshness unknown.';
    const body = reports.length > 0
        ? [...reports].sort(bySlug).map(describeReport).join('\n\n')
        : 'This person cannot see any reports yet.';

    return `${asOf} These are the only reports this person can see.\n\n${body}`;
}

// The searches behind the reports, for the Write SPL tab: what's in which
// index, which fields the reports use, and their SPL as examples.
export function splContext(reports: SplunkReport[]): string {
    if (reports.length === 0) return 'This person cannot see any reports, so there are no example searches.';

    return [...reports]
        .sort(bySlug)
        .map((report) => [
            `<report id="${report.slug}">`,
            `Title: ${clean(report.title)}`,
            `Index: ${clean(report.index)}`,
            `Columns: ${report.columns.map(clean).join(', ') || 'none stored yet'}`,
            'SPL:',
            report.spl,
            '</report>',
        ].join('\n'))
        .join('\n\n');
}
