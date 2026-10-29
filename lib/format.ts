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

export const formatDuration = (seconds: number) =>
    seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;

// The first line of some text, shortened to `max` characters, for titles.
export const firstLine = (text: string, max = 80) => {
    const line = text.trim().split('\n')[0].replace(/\s+/g, ' ');
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
