import { createHash } from 'node:crypto';
import { PROMPT_VERSION } from '@/ai/prompts';
import { hasProblemStatus, type ReportListItem } from '@/reports/reports';

// Names for cached AI text and for the things people vote on. A cache key
// changes when what the text was written from changes (a new run, a status,
// the prompt), so a stale summary is simply never asked for again.

type ReportRun = Pick<ReportListItem, 'slug' | 'lastRun' | 'resultsRunAt' | 'modelRun' | 'spl' | 'lateSince'>;

// Whether the ML job flags the newest run: a summary written before it did
// doesn't mention it, so a flag asks for a new one.
const modelFlag = (modelRun?: ReportListItem['modelRun']) => (modelRun?.unusual ? 'model' : '');

// Both report summaries explain the search too, and someone may edit it in
// Splunk before the report runs again, so their keys include a hash of it.
const searchHash = (spl: string) => createHash('sha256').update(spl).digest('hex').slice(0, 12);

// A report turning late has no new run, so its lateSince is in the key: a
// summary written while it was on time doesn't say a run is missing.
const reportKey = (kind: 'report' | 'report-spl', { slug, lastRun, resultsRunAt, modelRun, spl, lateSince }: ReportRun) =>
    `${kind}:${slug}:${lastRun}:${resultsRunAt ?? ''}:${modelFlag(modelRun)}:${lateSince ?? ''}:${searchHash(spl)}:v${PROMPT_VERSION}`;

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
export const briefingKey = (reports: Pick<ReportListItem, 'slug' | 'lastRun' | 'status' | 'lateSince' | 'modelRun' | 'attention'>[]) => {
    const state = reports
        .map(({ slug, lastRun, status, lateSince, modelRun, attention }) => `${slug}|${lastRun}|${status}|${lateSince ?? ''}|${modelFlag(modelRun)}|${attention === undefined ? '' : Math.round(attention * 10)}`)
        .sort()
        .join('\n');
    return `briefing:${createHash('sha256').update(state).digest('hex').slice(0, 24)}:v${PROMPT_VERSION}`;
};

// A briefing flag, for its 👍 / 👎: one report's run, flagged for one reason.
// For 'late', the time is when the missing run was due.
export const flagId = (slug: string, runAt: string, reason: 'status' | 'unusual' | 'late') => `${slug}:${runAt}:${reason}`;

// The flag a report in the briefing's "Needs attention" list is voted on: its
// status when that warns or fails, otherwise its lateness. Late gets its own
// reason, so votes on it don't teach the ML job about a healthy run.
export const attentionFlagId = (report: Pick<ReportListItem, 'slug' | 'lastRun' | 'status' | 'lateSince'>) =>
    hasProblemStatus(report.status) || !report.lateSince ? flagId(report.slug, report.lastRun, 'status') : flagId(report.slug, report.lateSince, 'late');
