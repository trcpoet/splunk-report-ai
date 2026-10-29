import { createHash } from 'node:crypto';
import { PROMPT_VERSION } from '@/lib/ai/prompts';
import type { ReportListItem } from '@/lib/reports';

// Names for cached AI text and for the things people vote on. A cache key
// changes when what the text was written from changes (a new run, a status,
// the prompt), so a stale summary is simply never asked for again.

type ReportRun = Pick<ReportListItem, 'slug' | 'lastRun' | 'resultsRunAt' | 'modelRun'>;

// Whether the ML job flags the newest run: a summary written before it did
// doesn't mention it, so a flag asks for a new one.
const modelFlag = (modelRun?: ReportListItem['modelRun']) => (modelRun?.unusual ? 'model' : '');

// One report's Explain summary, for its current run.
export const reportSummaryKey = ({ slug, lastRun, resultsRunAt, modelRun }: ReportRun) =>
    `report:${slug}:${lastRun}:${resultsRunAt ?? ''}:${modelFlag(modelRun)}:v${PROMPT_VERSION}`;

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
