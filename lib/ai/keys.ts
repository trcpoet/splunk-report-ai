import { createHash } from 'node:crypto';
import { PROMPT_VERSION } from '@/lib/ai/prompts';
import type { ReportListItem } from '@/lib/reports';

// Names for cached AI text and for the things people vote on. A cache key
// changes when what the text was written from changes (a new run, a status,
// the prompt), so a stale summary is simply never asked for again.

type ReportRun = Pick<ReportListItem, 'slug' | 'lastRun' | 'resultsRunAt' | 'modelRun' | 'spl'>;

// Whether the ML job flags the newest run: a summary written before it did
// doesn't mention it, so a flag asks for a new one.
const modelFlag = (modelRun?: ReportListItem['modelRun']) => (modelRun?.unusual ? 'model' : '');

// Both report summaries explain the search too, and someone may edit it in
// Splunk before the report runs again, so their keys include a hash of it.
const searchHash = (spl: string) => createHash('sha256').update(spl).digest('hex').slice(0, 12);

const reportKey = (kind: 'report' | 'report-spl', { slug, lastRun, resultsRunAt, modelRun, spl }: ReportRun) =>
    `${kind}:${slug}:${lastRun}:${resultsRunAt ?? ''}:${modelFlag(modelRun)}:${searchHash(spl)}:v${PROMPT_VERSION}`;

// One report's Explain summary, for its current run and search.
export const reportSummaryKey = (report: ReportRun) => reportKey('report', report);

// One report's "Explain report and SPL" text, for its current run and search.
export const reportAndSplKey = (report: ReportRun) => reportKey('report-spl', report);

// The report a saved summary is about, from its key ("report:<slug>:…" or
// "report-spl:<slug>:…"), or undefined for a briefing. Votes on a summary
// check that the voter can see that report. Any slug counts, even an empty
// one, so a summary of a report is never taken for a briefing.
export const summarySlug = (key: string) => key.match(/^report(?:-spl)?:([^:]*):/)?.[1];

// The briefing for one set of reports. People who see the same reports share it,
// since it's written only from those reports. The order they come in doesn't
// matter. What the ML job learned from votes counts in tenths, so small
// changes from one run of the job to the next don't ask for a new briefing.
export const briefingKey = (reports: Pick<ReportListItem, 'slug' | 'lastRun' | 'status' | 'modelRun' | 'attention'>[]) => {
    const state = reports
        .map(({ slug, lastRun, status, modelRun, attention }) => `${slug}|${lastRun}|${status}|${modelFlag(modelRun)}|${attention === undefined ? '' : Math.round(attention * 10)}`)
        .sort()
        .join('\n');
    return `briefing:${createHash('sha256').update(state).digest('hex').slice(0, 24)}:v${PROMPT_VERSION}`;
};

// A briefing flag, for its 👍 / 👎: one report's run, flagged for one reason.
export const flagId = (slug: string, runAt: string, reason: 'status' | 'unusual') => `${slug}:${runAt}:${reason}`;
