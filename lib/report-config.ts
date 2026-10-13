import { formatNumber } from '@/lib/format';
import type { Cell, ChartType, ReportCategory, ReportHighlight } from '@/lib/reports';

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
    chart?: 'none' | { type?: ChartType; y?: string };
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

export const reportConfig: Record<string, ReportConfig> = {
    'Failed Login Attempts by User': {
        slug: 'failed-logins-by-user',
        category: 'Security',
        tags: ['security', 'authentication', 'daily'],
    },
    'Web Server 5xx Error Rate': {
        slug: 'web-5xx-error-rate',
        category: 'Operations',
        tags: ['web', 'availability', 'hourly'],
        chart: { y: 'Error rate %' },
        // Warn when any host is above the 2% error budget.
        statusRule: (results) => {
            const host = columnIndex(results, 'Host');
            const rate = columnIndex(results, 'Error rate %');
            const over = results.rows.filter((row) => Number(row[rate]) > 2);

            if (over.length === 0) return null;
            if (over.length === 1) {
                return {
                    status: 'warning',
                    message: `${over[0][host]} is returning ${over[0][rate]}% server errors, above the 2% threshold. The other hosts are within budget.`,
                };
            }

            return {
                status: 'warning',
                message: `${over.length} hosts are above the 2% error budget: ${over.map((row) => `${row[host]} (${row[rate]}%)`).join(', ')}.`,
            };
        },
        highlights: (results) => {
            const host = columnIndex(results, 'Host');
            const rate = columnIndex(results, 'Error rate %');
            const sum = (name: string) => results.rows.reduce((total, row) => total + (Number(row[columnIndex(results, name)]) || 0), 0);
            const requests = sum('Requests');
            const worst = maxRow(results.rows, rate);

            return [
                { label: 'Overall error rate', value: `${requests ? ((sum('5xx errors') / requests) * 100).toFixed(2) : '0.00'}%`, note: 'Budget: 2%' },
                { label: 'Requests (1h)', value: formatNumber(requests) },
                ...(worst ? [{ label: 'Worst host', value: String(worst[host]), note: `${Number(worst[rate]).toFixed(2)}% errors` }] : []),
            ];
        },
    },
    'Firewall Denied Connections: Top Sources': {
        slug: 'firewall-denied-top-sources',
        category: 'Security',
        tags: ['security', 'network', 'firewall'],
    },
    'License Usage by Index': {
        slug: 'license-usage-by-index',
        category: 'Infrastructure',
        tags: ['licensing', 'capacity', 'daily'],
        index: '_internal (license_usage.log)',
    },
    'Daily Payment Volume & Latency': {
        slug: 'payments-volume-latency',
        category: 'Business',
        tags: ['business', 'payments', 'daily'],
    },
    'Disk Space Utilization Above 85%': {
        slug: 'disk-space-over-85',
        category: 'Infrastructure',
        tags: ['infrastructure', 'capacity', 'alerting'],
        // Warn when any mount is above 95%.
        statusRule: (results) => {
            const host = columnIndex(results, 'Host');
            const mount = columnIndex(results, 'Mount');
            const used = columnIndex(results, 'Used %');
            const critical = results.rows.filter((row) => Number(row[used]) > 95);

            if (critical.length === 0) return null;

            return {
                status: 'warning',
                message: `${critical.length === 1 ? 'One mount is' : `${critical.length} mounts are`} above 95%: ${critical.map((row) => `${row[host]} ${row[mount]} (${row[used]}%)`).join(', ')}.`,
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
