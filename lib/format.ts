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
