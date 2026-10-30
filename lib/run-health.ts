import type { OutcomeCounts, ReportListItem, ReportStatus, RunHealthRow, RunOutcomeDay } from '@/lib/reports';

// The home page's "Scheduled runs per day" chart and its run health grid read
// the same counts: runs per report, per UTC day, per outcome (lib/dal.ts).
// Pure, so the tests share it.

export type RunCount = { slug: string; day: string; status: ReportStatus; count: number };

const DAY_MS = 86_400_000;

// The `days` UTC days (YYYY-MM-DD) up to the newest day with a run, oldest first.
export function lastDays(counts: Pick<RunCount, 'day'>[], days: number): string[] {
    if (counts.length === 0) return [];

    const newest = Date.parse(`${counts.reduce((max, { day }) => (day > max ? day : max), '')}T00:00:00Z`);
    return Array.from({ length: days }, (_, i) => new Date(newest - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const noRuns = (): OutcomeCounts => ({ success: 0, warning: 0, failed: 0 });

// The runs on these days by outcome, added up under `keyOf`. One pass over the
// counts, which cover the whole retention period, not just the days shown.
function tally(counts: RunCount[], days: string[], keyOf: (count: RunCount) => string) {
    const shown = new Set(days);
    const totals = new Map<string, OutcomeCounts>();

    for (const count of counts) {
        if (!shown.has(count.day)) continue;
        const key = keyOf(count);
        const total = totals.get(key) ?? noRuns();
        total[count.status] += count.count;
        totals.set(key, total);
    }
    return totals;
}

// Each day's runs by outcome, all reports together.
export function totalsByDay(counts: RunCount[], days: string[]): RunOutcomeDay[] {
    const totals = tally(counts, days, ({ day }) => day);
    return days.map((day) => ({ day, ...(totals.get(day) ?? noRuns()) }));
}

// The worst outcome of a day's runs, or null when there were none.
export const worstStatus = ({ success, warning, failed }: OutcomeCounts): ReportStatus | null =>
    failed > 0 ? 'failed' : warning > 0 ? 'warning' : success > 0 ? 'success' : null;

// A row per report, a cell per day (null when it didn't run). Reports with a
// failed day come first, then those with a warning, so trouble is at the top.
export function runHealthRows(reports: Pick<ReportListItem, 'slug' | 'title'>[], counts: RunCount[], days: string[]): RunHealthRow[] {
    const totals = tally(counts, days, ({ slug, day }) => `${slug}|${day}`);
    const rows = reports.map(({ slug, title }) => ({
        slug,
        title,
        cells: days.map((day) => totals.get(`${slug}|${day}`) ?? null),
    }));

    const rank = ({ cells }: RunHealthRow) =>
        cells.some((cell) => cell?.failed) ? 0 : cells.some((cell) => cell?.warning) ? 1 : 2;

    return rows.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}
