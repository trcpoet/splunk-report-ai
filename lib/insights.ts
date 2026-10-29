import { formatDuration, formatNumber, parseNumber } from '@/lib/format';
import type { Cell, RunRecord } from '@/lib/reports';

// Plain statistics about a report, with no AI and no ML library. Pure, so the
// pages, the AI's context and the tests share it.

// ---------------------------------------------------------------------------
// Unusual runs
//
// Compares a report's newest run with its earlier successful runs, for the
// number of results and for how long the search took. The median of the
// earlier runs is what's usual. The median absolute deviation (MAD) is how
// much they normally vary. Both shrug off one odd run in the history, unlike
// the mean and the standard deviation, which matters with only a few runs.
//
// A run counts as unusual 3.5 or more "robust z-scores" from the usual value
// (the Iglewicz–Hoaglin rule of thumb). It's a strict bar on purpose: with
// about 6 earlier runs and two measures per report, a looser one would flag
// ordinary noise.

export type UnusualRun = {
    measure: 'results' | 'duration';
    value: number;
    usual: number;
    // Robust z-score: how far from the usual value, in typical spreads. Negative is lower.
    score: number;
    runAt: string;
    // The earlier runs it was compared with.
    baseline: number;
    message: string;
};

export const MIN_BASELINE = 4;
export const UNUSUAL_SCORE = 3.5;

export const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// How far `value` is from the baseline's median, in robust standard deviations
// (1.4826 × MAD). The spread is at least 10% of the usual value, and at least
// 1, so a perfectly steady history doesn't call every small change unusual.
export function robustScore(value: number, baseline: number[]) {
    const usual = median(baseline);
    const mad = median(baseline.map((earlier) => Math.abs(earlier - usual)));
    const spread = Math.max(1.4826 * mad, 0.1 * Math.abs(usual), 1);
    return { usual, score: (value - usual) / spread };
}

const round = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10);

function describe(measure: UnusualRun['measure'], value: number, usual: number, baseline: number): string {
    const show = (amount: number) => (measure === 'results' ? formatNumber(round(amount)) : formatDuration(Math.round(amount)));
    const what = measure === 'results' ? `${formatNumber(value)} result${value === 1 ? '' : 's'}` : `The search took ${show(value)}`;
    const compared = `compared with the previous ${baseline} runs`;

    if (usual === 0) return `${what}, where the previous ${baseline} runs had none.`;
    const ratio = value / usual;
    if (ratio >= 1.5) return `${what}, about ${round(ratio)}× the usual ${show(usual)} (${compared}).`;
    if (ratio <= 0.67) return `${what}, well below the usual ${show(usual)} (${compared}).`;
    return `${what}, ${value > usual ? 'above' : 'below'} the usual ${show(usual)} (${compared}).`;
}

// The newest run, if it stands out. Null when it doesn't, when it failed, or
// when there are fewer than MIN_BASELINE earlier runs to compare with.
export function findUnusualRun(history: RunRecord[]): UnusualRun | null {
    const newest = history.at(-1);
    if (!newest || newest.status === 'failed') return null;

    const earlier = history.slice(0, -1).filter((run) => run.status !== 'failed');
    if (earlier.length < MIN_BASELINE) return null;

    const checks = [
        { measure: 'results' as const, value: newest.resultCount, ...robustScore(newest.resultCount, earlier.map((run) => run.resultCount)) },
        { measure: 'duration' as const, value: newest.durationSec, ...robustScore(newest.durationSec, earlier.map((run) => run.durationSec)) },
    ];
    const strongest = checks
        .filter(({ score }) => Math.abs(score) >= UNUSUAL_SCORE)
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];
    if (!strongest) return null;

    return {
        ...strongest,
        score: Math.round(strongest.score * 10) / 10,
        runAt: newest.runAt,
        baseline: earlier.length,
        message: describe(strongest.measure, strongest.value, strongest.usual, earlier.length),
    };
}

// What the sparkline next to an unusual run draws: the measure that stood out,
// for every run that didn't fail, oldest first. The label says the same in
// words, for screen readers.
export function unusualTrend(history: RunRecord[], unusual: UnusualRun) {
    const results = unusual.measure === 'results';
    const values = history.filter((run) => run.status !== 'failed').map((run) => (results ? run.resultCount : run.durationSec));
    const usual = results ? formatNumber(round(unusual.usual)) : formatDuration(Math.round(unusual.usual));
    return { values, label: `${results ? 'Results' : 'Search time'} in the last ${values.length} runs; the newest stands out against the usual ${usual}.` };
}

// ---------------------------------------------------------------------------
// A quick profile of a results table, for the Explain panel's "At a glance".

export type ColumnProfile =
    | { name: string; kind: 'number'; min: number; max: number; median: number; highest: string | null; empty: number }
    | { name: string; kind: 'time'; first: string; last: string; empty: number }
    | { name: string; kind: 'text'; distinct: number; top: string; topCount: number; empty: number };

export type ResultsProfile = {
    // Rows stored, and how many results the run had (it can be more).
    rows: number;
    total: number;
    columns: ColumnProfile[];
};

const TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const isEmpty = (cell: Cell) => cell === '' || cell === null || cell === undefined;

// Null when there are no rows to profile.
export function profileResults(columns: string[], rows: Cell[][], total = rows.length): ResultsProfile | null {
    if (rows.length === 0 || columns.length === 0) return null;

    const profiles = columns.map((name, index): ColumnProfile => {
        const cells = rows.map((row) => row[index]);
        const filled = cells.filter((cell) => !isEmpty(cell));
        const empty = cells.length - filled.length;

        if (filled.length > 0 && filled.every((cell) => typeof cell === 'string' && TIME.test(cell))) {
            const sorted = [...(filled as string[])].sort();
            return { name, kind: 'time', first: sorted[0], last: sorted.at(-1)!, empty };
        }

        // A number column: at least 80% of its cells read as numbers ("$1,234" and "1.84%" included).
        const numbers = filled.map(parseNumber).filter((value): value is number => value !== null);
        if (index > 0 && filled.length > 0 && numbers.length / filled.length >= 0.8) {
            const highestRow = rows.reduce<Cell[] | null>((best, row) => {
                const value = parseNumber(row[index]);
                return value !== null && (best === null || value > (parseNumber(best[index]) ?? -Infinity)) ? row : best;
            }, null);
            return {
                name,
                kind: 'number',
                min: Math.min(...numbers),
                max: Math.max(...numbers),
                median: median(numbers),
                highest: highestRow ? String(highestRow[0]) : null,
                empty,
            };
        }

        const counts = new Map<string, number>();
        for (const cell of filled) counts.set(String(cell), (counts.get(String(cell)) ?? 0) + 1);
        const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
        return { name, kind: 'text', distinct: counts.size, top, topCount, empty };
    });

    return { rows: rows.length, total: Math.max(total, rows.length), columns: profiles };
}

// One plain sentence per column, for people who don't read tables for fun.
export function describeColumn(column: ColumnProfile, rows: number): string {
    if (column.empty >= rows) return 'Empty in every row.';
    const empty = column.empty > 0 ? ` ${column.empty} empty.` : '';

    if (column.kind === 'number') {
        const range = column.min === column.max ? `all ${formatNumber(column.min)}` : `${formatNumber(column.min)} to ${formatNumber(column.max)}, median ${formatNumber(round(column.median))}`;
        const highest = column.highest && column.min !== column.max ? ` Highest: ${column.highest}.` : '';
        return `${range}.${highest}${empty}`;
    }
    if (column.kind === 'time') return `${column.first} to ${column.last}.${empty}`;
    if (column.distinct === rows - column.empty) return `A different value in every row.${empty}`;
    if (column.topCount > 1) return `${column.distinct} different values, mostly ${column.top} (${column.topCount} of ${rows}).${empty}`;
    return `${column.distinct} different values.${empty}`;
}
