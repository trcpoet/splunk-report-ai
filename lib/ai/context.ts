import { formatDateTime, formatDuration } from '@/lib/format';
import { findUnusualRun } from '@/lib/insights';
import type { SplExample } from '@/lib/ai/retrieval';
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
    const unusual = findUnusualRun(report.history, report.modelRun);
    const { modelRun, attention } = report;
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
        ...(unusual ? [`Unusual newest run: ${clean(unusual.message)}${unusual.flaggedBy === 'model' ? ' (noticed by the ML model, not the per-report statistics)' : ''}`] : []),
        ...(modelRun ? [`ML model score for the newest run: ${modelRun.score.toFixed(2)} of 1, where 1 is the most unusual of all reports' runs${modelRun.unusual ? ' (among the 5% that differ most)' : ''}`] : []),
        ...(attention !== undefined ? [`Learned from people's votes: a flag on this report is worth attention about ${Math.round(attention * 100)}% of the time`] : []),
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
//
// With examples (lib/spl-examples.ts: the searches most like the request), the
// reports become a short catalog of indexes and columns, and only those
// examples are written out in full, closest first. Without them (no examples
// found, or the AI couldn't compare), every report's search is written out.
export function splContext(reports: SplunkReport[], examples?: SplExample[]): string {
    if (reports.length === 0 && !examples?.length) return 'This person cannot see any reports, so there are no example searches.';

    if (!examples) {
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

    const catalog = [...reports]
        .sort(bySlug)
        .map((report) => `- ${clean(report.title)}: index ${clean(report.index)}; columns ${report.columns.map(clean).join(', ') || 'none stored yet'}`)
        .join('\n');
    const similar = examples
        .map((example) => [
            `<search id="${example.id}">`,
            `${example.source === 'report' ? 'Report' : 'Saved request'}: ${clean(example.title)}`,
            `What it does: ${clean(example.description)}`,
            ...(example.index ? [`Index: ${clean(example.index)}`] : []),
            'SPL:',
            // Saved searches come from people, so they mustn't be able to close the tag.
            example.spl.replace(/<\/?search/gi, ''),
            '</search>',
        ].join('\n'))
        .join('\n\n');

    return [
        'Their reports (indexes and columns):',
        catalog || 'none',
        '',
        'The searches most like this request, closest first (their reports, and searches people saved as good examples):',
        '',
        similar || 'none',
    ].join('\n');
}
