// Formatting is done by hand (always UTC, fixed English month names) so the
// server and the browser render exactly the same text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => value.toString().padStart(2, '0');

export const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    // Reports have no run time until their first run is synced.
    if (!iso || Number.isNaN(date.getTime())) return '—';
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
};

export const formatNumber = (value: number) => {
    const [whole, fraction] = value.toString().split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction ? `${grouped}.${fraction}` : grouped;
};

const SIZE_UNITS: Record<string, number> = { K: 2 ** 10, M: 2 ** 20, G: 2 ** 30, T: 2 ** 40, P: 2 ** 50 };

// A number Splunk sent as formatted text: "1,234", "$18,402,117", "1.84%" or a
// df size like "12G". Leading zeros and dotted values ("007", "192.0.2.1") are
// identifiers, not numbers.
const FORMATTED_NUMBER = /^(-)?\$?((?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?)\s?(%|[KMGTP](?:i?B)?)?$/;

// The number in a results cell, so formatted text can be sorted and charted
// like the numbers next to it. null when the cell isn't a number.
export const parseNumber = (cell: string | number): number | null => {
    if (typeof cell === 'number') return cell;

    const match = cell.trim().match(FORMATTED_NUMBER);
    if (!match) return null;

    const [, minus, digits, unit] = match;
    const value = Number(digits.replace(/,/g, '')) * (unit && unit !== '%' ? SIZE_UNITS[unit[0]] : 1);
    return minus ? -value : value;
};

// Splunk's _time, such as "2026-10-02T06:00:00.000+00:00".
const SPLUNK_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// In UTC, the way Splunk's own tables write it. Events seconds apart stay apart,
// and results from another year say so.
const formatSplunkTime = (time: string) => {
    const iso = new Date(time).toISOString();
    const fraction = iso.slice(19, 23);
    return `${iso.slice(0, 19).replace('T', ' ')}${fraction === '.000' ? '' : fraction} UTC`;
};

// A results cell as it's shown.
export const formatCell = (cell: string | number) => {
    if (typeof cell === 'number') return formatNumber(cell);
    return SPLUNK_TIME.test(cell) && !Number.isNaN(Date.parse(cell)) ? formatSplunkTime(cell) : cell;
};

// A results column's name as it's shown.
export const columnLabel = (name: string) => (name === '_time' ? 'Time' : name);

// For axis ticks: 1,284 → 1.3K, 2,500,000 → 2.5M.
export const formatCompact = (value: number) => {
    const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

    for (const [size, suffix] of units) {
        if (Math.abs(value) >= size) return `${Number((value / size).toFixed(1))}${suffix}`;
    }
    return formatNumber(value);
};

export const formatDay = (iso: string) => {
    const date = new Date(iso);
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

export const formatTime = (iso: string) => {
    const date = new Date(iso);
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

const DAY_MS = 86_400_000;

// Axis labels for a run of times, as short as their span allows. Times between
// minutes keep their seconds, or the ticks would repeat. A cell that isn't a
// time, such as a totals row's, stays as it is and doesn't count toward the span.
export function timeAxisLabels(times: string[]) {
    const stamps = times.map((time) => Date.parse(time)).filter(Number.isFinite);
    const span = Math.max(...stamps) - Math.min(...stamps);
    const seconds = stamps.some((stamp) => stamp % 60_000 !== 0);
    const clock = (time: string) => (seconds ? new Date(time).toISOString().slice(11, 19) : formatTime(time));

    return times.map((time) => {
        if (Number.isNaN(Date.parse(time))) return time;
        if (span <= DAY_MS) return clock(time);
        return span <= 4 * DAY_MS ? `${formatDay(time)} ${clock(time)}` : formatDay(time);
    });
}

// Minutes after midnight as a time of day: 480 → "08:00", 1440 → "24:00".
export const formatClock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export const formatDuration = (seconds: number) =>
    seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;

// "1 report", "3 reports".
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const LIST = new Intl.ListFormat('en', { type: 'conjunction' });

// "a, b, and c".
export const formatList = (items: string[]) => LIST.format(items);

// The first line of some text, shortened to `max` characters, for titles.
export const firstLine = (text: string, max = 80) => {
    const line = text.trim().split('\n')[0].replace(/\s+/g, ' ');
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
