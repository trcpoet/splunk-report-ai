import type { OutcomeCounts, ReportListItem, ReportStatus, RunHealthRow } from '@/lib/reports';

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

// A day's runs by outcome.
export function countsOn(counts: RunCount[], day: string, slug?: string): OutcomeCounts {
    const total = (status: ReportStatus) =>
        counts
            .filter((count) => count.day === day && count.status === status && (slug === undefined || count.slug === slug))
            .reduce((sum, count) => sum + count.count, 0);

    return { success: total('success'), warning: total('warning'), failed: total('failed') };
}

// The worst outcome of a day's runs, or null when there were none.
export const worstStatus = ({ success, warning, failed }: OutcomeCounts): ReportStatus | null =>
    failed > 0 ? 'failed' : warning > 0 ? 'warning' : success > 0 ? 'success' : null;

// A row per report, a cell per day (null when it didn't run). Reports with a
// failed day come first, then those with a warning, so trouble is at the top.
export function runHealthRows(reports: Pick<ReportListItem, 'slug' | 'title'>[], counts: RunCount[], days: string[]): RunHealthRow[] {
    const rows = reports.map(({ slug, title }) => ({
        slug,
        title,
        cells: days.map((day) => {
            const cell = countsOn(counts, day, slug);
            return worstStatus(cell) ? cell : null;
        }),
    }));

    const rank = ({ cells }: RunHealthRow) =>
        cells.some((cell) => cell?.failed) ? 0 : cells.some((cell) => cell?.warning) ? 1 : 2;

    return rows.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}
