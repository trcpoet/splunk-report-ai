// The example Splunk's scheduled reports (docs/splunk-example.md): six of the
// dummy reports, which Splunk really runs against the logs in ./events.ts.
// Each one is the dummy report's SPL plus a last step that names the columns
// the way lib/report-config.ts expects, as a real report's search would.

import { reports } from '@/lib/splunk/fixtures/reports';
import { CHARTS, TIME_RANGES } from '@/lib/splunk/fixtures/transport';

// Report title → the step that names its columns.
const LAST_STEPS: Record<string, string> = {
    'Failed Login Attempts by User':
        '| rename user AS "User", failures AS "Failures", sources AS "Distinct sources", last_attempt AS "Last attempt (UTC)"',
    'Web Server 5xx Error Rate':
        '| rename host AS "Host", requests AS "Requests", errors AS "5xx errors", error_rate AS "Error rate %"',
    'Firewall Denied Connections: Top Sources':
        '| rename src_ip AS "Source IP", denied AS "Denied", ports AS "Distinct ports", zones AS "Zones"',
    'Disk Space Utilization Above 85%':
        '| rename host AS "Host", MountedOn AS "Mount", used_pct AS "Used %", avail AS "Available"',
    'Privileged Group Membership Changes': [
        '| eval "Time (UTC)"=strftime(_time, "%Y-%m-%d %H:%M:%S")',
        '| table "Time (UTC)", changed_by, member, group, action',
        '| rename changed_by AS "Changed by", member AS "Member", group AS "Group", action AS "Action"',
    ].join('\n'),
    'Forwarder Health: Silent Hosts':
        '| rename host AS "Host", last_seen AS "Last seen (UTC)", minutes_silent AS "Minutes silent"',
};

export type ExampleSearch = {
    name: string;
    search: string;
    description: string;
    earliest: string;
    latest: string;
    // Who the report goes to. The app's groups come from these.
    recipients: string[];
    chart: 'bar' | 'column' | null;
};

export const exampleSearches = (): ExampleSearch[] =>
    reports
        .filter((report) => LAST_STEPS[report.title])
        .map((report) => {
            const [earliest, latest] = TIME_RANGES[report.timeRange] ?? ['-24h', 'now'];
            return {
                name: report.title,
                search: `${report.spl}\n${LAST_STEPS[report.title]}`,
                description: report.description,
                earliest,
                latest,
                recipients: report.recipients,
                chart: CHARTS[report.slug] ?? null,
            };
        });

// The indexes the example's logs go to.
export const EXAMPLE_INDEXES = ['wineventlog', 'linux_secure', 'web', 'firewall', 'os'];
