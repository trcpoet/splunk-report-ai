import { formatNumber } from '@/lib/format';
import type { Cell, ChartPanel, ChartScatter, ChartThreshold, ChartType, ReportCategory, ReportHighlight } from '@/lib/reports';

// What Splunk doesn't know about each report, keyed by the saved search name:
// its slug, category and tags, who may see it, and optional chart, status and
// highlight rules. The app and the sync worker both load this file, so it must
// not import `server-only` or anything from `next/*`.
//
// Scheduled searches missing from this list are still synced when they email
// their results, but only admins can see them until they're added here.

export type ResultSet = {
    columns: string[];
    rows: Cell[][];
    resultCount: number;
};

// Turns a run's results into a warning (or failure) with a short explanation.
export type StatusRule = (results: ResultSet) => { status: 'warning' | 'failed'; message: string } | null;

export type HighlightRule = (results: ResultSet & { previousResultCount?: number; durationSec: number }) => ReportHighlight[];

export type ReportConfig = {
    slug: string;
    category: ReportCategory;
    tags: string[];
    // Groups that may see the report. Defaults to the email lists in
    // action.email.to (secops@example.com → secops). Copy them here before
    // turning off a report's email action, or the defaults disappear with it.
    groups?: string[];
    // 'none' shows only the results table. y picks the measure to plot
    // (default: the first numeric column). type overrides the chart saved in Splunk.
    // threshold draws a limit across the chart and highlights the values past
    // it; max turns the bars into meters that fill up to it (100 for a percentage).
    // panels draws one small chart per measure instead of one chart, and
    // scatter adds a chart of dots placing y against another measure.
    chart?: 'none' | { type?: ChartType; y?: string; threshold?: ChartThreshold; max?: number; panels?: ChartPanel[]; scatter?: ChartScatter };
    // Overrides the index text parsed from the SPL.
    index?: string;
    statusRule?: StatusRule;
    highlights?: HighlightRule;
};

const columnIndex = (results: ResultSet, name: string) => results.columns.indexOf(name);

const maxRow = (rows: Cell[][], index: number) =>
    rows.reduce<Cell[] | undefined>((max, row) => (!max || Number(row[index]) > Number(max[index]) ? row : max), undefined);

const hours = (minutes: number) => {
    const count = Math.floor(minutes / 60);
    return `${count} hour${count === 1 ? '' : 's'}`;
};

// Limits used by both a report's status rule and its chart, so the two agree.
const ERROR_BUDGET_PCT = 2;
const DISK_CRITICAL_PCT = 95;
const LICENSE_GB_PER_DAY = 500;
const PAYMENTS_P95_SLO_MS = 400;

// How much of a limit a value uses, for highlight meters: 0.6 is 60%.
const share = (value: number, limit: number) => Math.round((value / limit) * 100) / 100;

export const reportConfig: Record<string, ReportConfig> = {
    'Failed Login Attempts by User': {
        slug: 'failed-logins-by-user',
        category: 'Security',
        tags: ['security', 'authentication', 'daily'],
        chart: {
            scatter: {
                x: 'Distinct sources',
                caption: 'Each dot is an account. High and to the left: many failures from one source, which suggests password guessing. Further right: failures from many sources, which suggests password spraying.',
            },
        },
    },
    'Web Server 5xx Error Rate': {
        slug: 'web-5xx-error-rate',
        category: 'Operations',
        tags: ['web', 'availability', 'hourly'],
        chart: { y: 'Error rate %', threshold: { value: ERROR_BUDGET_PCT, label: `${ERROR_BUDGET_PCT}% error budget` } },
        // Warn when any host is above the error budget.
        statusRule: (results) => {
            const host = columnIndex(results, 'Host');
            const rate = columnIndex(results, 'Error rate %');
            const over = results.rows.filter((row) => Number(row[rate]) > ERROR_BUDGET_PCT);

            if (over.length === 0) return null;
            if (over.length === 1) {
                return {
                    status: 'warning',
                    message: `${over[0][host]} is returning ${over[0][rate]}% server errors, above the ${ERROR_BUDGET_PCT}% threshold. The other hosts are within budget.`,
                };
            }

            return {
                status: 'warning',
                message: `${over.length} hosts are above the ${ERROR_BUDGET_PCT}% error budget: ${over.map((row) => `${row[host]} (${row[rate]}%)`).join(', ')}.`,
            };
        },
        highlights: (results) => {
            const host = columnIndex(results, 'Host');
            const rate = columnIndex(results, 'Error rate %');
            const sum = (name: string) => results.rows.reduce((total, row) => total + (Number(row[columnIndex(results, name)]) || 0), 0);
            const requests = sum('Requests');
            const overall = requests ? (sum('5xx errors') / requests) * 100 : 0;
            const worst = maxRow(results.rows, rate);

            return [
                { label: 'Overall error rate', value: `${overall.toFixed(2)}%`, note: `Budget: ${ERROR_BUDGET_PCT}%`, meter: share(overall, ERROR_BUDGET_PCT) },
                { label: 'Requests (1h)', value: formatNumber(requests) },
                ...(worst ? [{ label: 'Worst host', value: String(worst[host]), note: `${Number(worst[rate]).toFixed(2)}% errors` }] : []),
            ];
        },
    },
    'Firewall Denied Connections: Top Sources': {
        slug: 'firewall-denied-top-sources',
        category: 'Security',
        tags: ['security', 'network', 'firewall'],
        chart: {
            scatter: {
                x: 'Distinct ports',
                log: true,
                caption: 'Each dot is a source IP. Far right: hundreds of ports, which suggests a port scan. Far left: one port hit again and again, which suggests a flood. Ports use a log scale.',
            },
        },
    },
    'License Usage by Index': {
        slug: 'license-usage-by-index',
        category: 'Infrastructure',
        tags: ['licensing', 'capacity', 'daily'],
        index: '_internal (license_usage.log)',
        highlights: (results) => {
            const index = columnIndex(results, 'Index');
            const gb = columnIndex(results, 'GB ingested');
            const total = results.rows.reduce((sum, row) => sum + (Number(row[gb]) || 0), 0);
            const largest = maxRow(results.rows, gb);

            return [
                { label: 'Total ingested', value: `${total.toFixed(1)} GB`, note: 'Yesterday' },
                {
                    label: 'License used',
                    value: `${((total / LICENSE_GB_PER_DAY) * 100).toFixed(1)}%`,
                    note: `of ${LICENSE_GB_PER_DAY} GB/day`,
                    meter: share(total, LICENSE_GB_PER_DAY),
                },
                ...(largest ? [{ label: 'Largest index', value: String(largest[index]), note: `${formatNumber(Number(largest[gb]))} GB` }] : []),
            ];
        },
    },
    'Daily Payment Volume & Latency': {
        slug: 'payments-volume-latency',
        category: 'Business',
        tags: ['business', 'payments', 'daily'],
        // Four measures with different units, so four small charts.
        chart: {
            type: 'bar',
            panels: [
                { y: 'Transactions' },
                { y: 'Volume' },
                { y: 'p95 latency (ms)', threshold: { value: PAYMENTS_P95_SLO_MS, label: `${PAYMENTS_P95_SLO_MS} ms SLO` } },
                { y: 'Decline rate' },
            ],
        },
    },
    'Disk Space Utilization Above 85%': {
        slug: 'disk-space-over-85',
        category: 'Infrastructure',
        tags: ['infrastructure', 'capacity', 'alerting'],
        chart: { threshold: { value: DISK_CRITICAL_PCT, label: `${DISK_CRITICAL_PCT}% critical` }, max: 100 },
        // Warn when any mount is above the critical level.
        statusRule: (results) => {
            const host = columnIndex(results, 'Host');
            const mount = columnIndex(results, 'Mount');
            const used = columnIndex(results, 'Used %');
            const critical = results.rows.filter((row) => Number(row[used]) > DISK_CRITICAL_PCT);

            if (critical.length === 0) return null;

            return {
                status: 'warning',
                message: `${critical.length === 1 ? 'One mount is' : `${critical.length} mounts are`} above ${DISK_CRITICAL_PCT}%: ${critical.map((row) => `${row[host]} ${row[mount]} (${row[used]}%)`).join(', ')}.`,
            };
        },
    },
    'Privileged Group Membership Changes': {
        slug: 'privileged-group-changes',
        category: 'Compliance',
        tags: ['compliance', 'security', 'audit'],
        index: 'wineventlog (Security)',
    },
    'VPN Sessions by Country': {
        slug: 'vpn-sessions-by-country',
        category: 'Security',
        tags: ['security', 'remote-access', 'weekly'],
    },
    'Forwarder Health: Silent Hosts': {
        slug: 'forwarder-health-missing-hosts',
        category: 'Infrastructure',
        tags: ['infrastructure', 'forwarders', 'hourly'],
        index: 'All indexes (metadata)',
        // Any result is a forwarder that went quiet.
        statusRule: (results) => {
            const silent = results.resultCount || results.rows.length;
            if (silent === 0) return null;

            const host = columnIndex(results, 'Host');
            const longest = maxRow(results.rows, columnIndex(results, 'Minutes silent'));
            const minutes = longest ? Number(longest[columnIndex(results, 'Minutes silent')]) : 0;

            if (silent === 1 && longest) {
                return { status: 'warning', message: `${longest[host]} has been silent for over ${hours(minutes)}.` };
            }

            const detail = longest ? `, including ${longest[host]}, which has been down for over ${hours(minutes)}` : '';
            return { status: 'warning', message: `${formatNumber(silent)} forwarders have been silent for more than 60 minutes${detail}.` };
        },
    },
};
