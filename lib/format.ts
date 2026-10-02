// Formatting is done by hand (always UTC, fixed English month names) so the
// server and the browser render exactly the same text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => value.toString().padStart(2, '0');

export const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
};

export const formatNumber = (value: number) => {
    const [whole, fraction] = value.toString().split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction ? `${grouped}.${fraction}` : grouped;
};

export const formatDuration = (seconds: number) =>
    seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
