// Dummy Splunk scheduled-report data for the demo. Everything here is fake:
// emails use example.com and IPs come from the documentation ranges
// (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24). The fixture transport
// (./transport.ts) serves it in the Splunk REST API's JSON shape, so the sync
// worker runs end to end without a Splunk instance.

import type { ReportCategory, ReportHighlight, ReportStatus, RunRecord } from '@/lib/reports';

export type FixtureReport = {
    slug: string;
    title: string;
    description: string;
    category: ReportCategory;
    app: string;
    owner: string;
    schedule: string;
    cron: string;
    runsPerWeek: number;
    timeRange: string;
    index: string;
    lastRun: string;
    nextRun: string;
    status: ReportStatus;
    statusMessage?: string;
    resultCount: number;
    recipients: string[];
    tags: string[];
    spl: string;
    highlights: ReportHighlight[];
    columns: string[];
    rows: (string | number)[][];
    history: RunRecord[];
};

const HOUR_MS = 3_600_000;
const STATUS_CODES = { s: 'success', w: 'warning', f: 'failed' } as const;

// Builds a run history ending at `lastRun`, oldest first. `pattern` holds one
// character per run: s = success, w = warning, f = failed.
export function buildHistory(lastRun: string, everyHours: number, pattern: string, baseCount: number, baseDurationSec: number): RunRecord[] {
    const end = new Date(lastRun).getTime();
    const codes = pattern.split('') as (keyof typeof STATUS_CODES)[];

    return codes.map((code, i) => {
        const status = STATUS_CODES[code];
        const wobble = ((i * 7) % 5) - 2;

        return {
            runAt: new Date(end - (codes.length - 1 - i) * everyHours * HOUR_MS).toISOString(),
            status,
            durationSec: status === 'failed' ? 0 : baseDurationSec + wobble * 3,
            resultCount: status === 'failed' ? 0 : Math.max(0, baseCount + wobble * Math.ceil(baseCount * 0.1)),
        };
    });
}

export const reports: FixtureReport[] = [
    {
        slug: 'failed-logins-by-user',
        title: 'Failed Login Attempts by User',
        description: 'Accounts with 10 or more failed logins in the last 24 hours across Windows and Linux hosts. Flags brute-force and password-spraying activity.',
        category: 'Security',
        app: 'Splunk Enterprise Security',
        owner: 'secops-team',
        schedule: 'Daily at 06:00 UTC',
        cron: '0 6 * * *',
        runsPerWeek: 7,
        timeRange: 'Last 24 hours',
        index: 'wineventlog, linux_secure',
        lastRun: '2026-10-02T06:00:00Z',
        nextRun: '2026-10-03T06:00:00Z',
        status: 'success',
        resultCount: 42,
        recipients: ['secops@example.com', 'soc-tier1@example.com', 'it-director@example.com'],
        tags: ['security', 'authentication', 'daily'],
        spl: `index=wineventlog EventCode=4625 OR (index=linux_secure "Failed password")
| eval user=coalesce(TargetUserName, user)
| stats count AS failures, dc(src_ip) AS sources, latest(_time) AS last_attempt BY user
| where failures >= 10
| sort - failures
| convert ctime(last_attempt)`,
        highlights: [
            { label: 'Accounts over threshold', value: '42', note: '+9 vs. previous day' },
            { label: 'Failed logins', value: '4,918', note: 'Last 24 hours' },
            { label: 'Top source IP', value: '203.0.113.47', note: '1,204 attempts' },
        ],
        columns: ['User', 'Failures', 'Distinct sources', 'Last attempt (UTC)'],
        rows: [
            ['svc_backup', 312, 4, '2026-10-02 05:41'],
            ['admin', 264, 23, '2026-10-02 05:58'],
            ['jsmith', 87, 1, '2026-10-01 22:13'],
            ['oracle', 71, 6, '2026-10-02 03:27'],
            ['mlopez', 38, 2, '2026-10-01 18:05'],
            ['test', 29, 11, '2026-10-02 04:49'],
        ],
        history: buildHistory('2026-10-02T06:00:00Z', 24, 'ssswsss', 38, 41),
    },
    {
        slug: 'web-5xx-error-rate',
        title: 'Web Server 5xx Error Rate',
        description: 'Hourly server-error rate for each production web host. Warns when any host goes above the 2% error budget.',
        category: 'Operations',
        app: 'Search & Reporting',
        owner: 'web-platform',
        schedule: 'Every hour',
        cron: '0 * * * *',
        runsPerWeek: 168,
        timeRange: 'Last 60 minutes',
        index: 'web (access_combined)',
        lastRun: '2026-10-02T09:00:00Z',
        nextRun: '2026-10-02T10:00:00Z',
        status: 'warning',
        statusMessage: 'web-prod-03 is returning 4.8% server errors, above the 2% threshold. The other hosts are within budget.',
        resultCount: 6,
        recipients: ['web-oncall@example.com', 'sre@example.com', 'eng-managers@example.com'],
        tags: ['web', 'availability', 'hourly'],
        spl: `index=web sourcetype=access_combined
| eval is_error=if(status>=500, 1, 0)
| stats count AS requests, sum(is_error) AS errors BY host
| eval error_rate=round(errors / requests * 100, 2)
| sort - error_rate`,
        highlights: [
            { label: 'Overall error rate', value: '1.21%', note: 'Budget: 2%', meter: 0.6 },
            { label: 'Requests (1h)', value: '296,450' },
            { label: 'Worst host', value: 'web-prod-03', note: '4.80% errors' },
        ],
        columns: ['Host', 'Requests', '5xx errors', 'Error rate %'],
        rows: [
            ['web-prod-03', 48210, 2314, 4.8],
            ['web-prod-05', 47102, 412, 0.87],
            ['web-prod-01', 51877, 402, 0.77],
            ['web-prod-02', 50364, 241, 0.48],
            ['web-prod-04', 49733, 109, 0.22],
            ['web-prod-06', 49164, 98, 0.2],
        ],
        history: buildHistory('2026-10-02T09:00:00Z', 1, 'sssssww', 6, 12),
    },
    {
        slug: 'firewall-denied-top-sources',
        title: 'Firewall Denied Connections: Top Sources',
        description: 'The 25 source IPs with the most denied connections at the perimeter firewall, with how many ports and zones each one probed.',
        category: 'Security',
        app: 'Search & Reporting',
        owner: 'network-security',
        schedule: 'Every 4 hours',
        cron: '0 */4 * * *',
        runsPerWeek: 42,
        timeRange: 'Last 4 hours',
        index: 'firewall (pan:traffic)',
        lastRun: '2026-10-02T08:00:00Z',
        nextRun: '2026-10-02T12:00:00Z',
        status: 'success',
        resultCount: 25,
        recipients: ['netsec@example.com', 'soc-tier1@example.com'],
        tags: ['security', 'network', 'firewall'],
        spl: `index=firewall sourcetype=pan:traffic action=denied
| stats count AS denied, dc(dest_port) AS ports, values(dest_zone) AS zones BY src_ip
| sort - denied
| head 25`,
        highlights: [
            { label: 'Denied connections', value: '128,904', note: 'Last 4 hours' },
            { label: 'Unique sources', value: '3,417' },
            { label: 'Top source', value: '198.51.100.23', note: '18,330 denials' },
        ],
        columns: ['Source IP', 'Denied', 'Distinct ports', 'Zones'],
        rows: [
            ['198.51.100.23', 18330, 1024, 'dmz'],
            ['203.0.113.91', 9876, 3, 'dmz, corp'],
            ['192.0.2.144', 7412, 88, 'dmz'],
            ['198.51.100.7', 5120, 1, 'vpn'],
            ['203.0.113.12', 4407, 12, 'dmz'],
            ['192.0.2.58', 3981, 245, 'dmz, guest'],
        ],
        history: buildHistory('2026-10-02T08:00:00Z', 4, 'sssssss', 25, 64),
    },
    {
        slug: 'license-usage-by-index',
        title: 'License Usage by Index',
        description: "Yesterday's ingest volume per index against the 500 GB/day license. Use it to spot noisy sources before they push us over quota.",
        category: 'Infrastructure',
        app: 'Monitoring Console',
        owner: 'splunk-admins',
        schedule: 'Daily at 00:30 UTC',
        cron: '30 0 * * *',
        runsPerWeek: 7,
        timeRange: 'Yesterday',
        index: '_internal (license_usage.log)',
        lastRun: '2026-10-02T00:30:00Z',
        nextRun: '2026-10-03T00:30:00Z',
        status: 'success',
        resultCount: 8,
        recipients: ['splunk-admins@example.com', 'it-finance@example.com'],
        tags: ['licensing', 'capacity', 'daily'],
        spl: `index=_internal source=*license_usage.log* type=Usage
| eval GB=b/1024/1024/1024
| stats sum(GB) AS GB BY idx
| eval GB=round(GB, 2), pct_of_quota=round(GB / 500 * 100, 1)
| sort - GB`,
        highlights: [
            { label: 'Total ingested', value: '439.3 GB', note: 'Yesterday' },
            { label: 'License used', value: '87.9%', note: 'of 500 GB/day', meter: 0.88 },
            { label: 'Largest index', value: 'firewall', note: '182.4 GB' },
        ],
        columns: ['Index', 'GB ingested', '% of quota'],
        rows: [
            ['firewall', 182.4, 36.5],
            ['web', 96.1, 19.2],
            ['wineventlog', 71.8, 14.4],
            ['os', 38.2, 7.6],
            ['app', 27.5, 5.5],
            ['linux_secure', 12.9, 2.6],
            ['vpn', 6.3, 1.3],
            ['_internal', 4.1, 0.8],
        ],
        history: buildHistory('2026-10-02T00:30:00Z', 24, 'sssssss', 8, 23),
    },
    {
        slug: 'payments-volume-latency',
        title: 'Daily Payment Volume & Latency',
        description: 'Transaction count, dollar volume, p95 API latency and decline rate for the charge API, broken down by region.',
        category: 'Business',
        app: 'Payments Analytics',
        owner: 'payments-eng',
        schedule: 'Daily at 07:00 UTC',
        cron: '0 7 * * *',
        runsPerWeek: 7,
        timeRange: 'Yesterday',
        index: 'app (payments:api)',
        lastRun: '2026-10-02T07:00:00Z',
        nextRun: '2026-10-03T07:00:00Z',
        status: 'success',
        resultCount: 5,
        recipients: ['payments-eng@example.com', 'finance-ops@example.com', 'cfo-office@example.com', 'product-leads@example.com'],
        tags: ['business', 'payments', 'daily'],
        spl: `index=app sourcetype=payments:api endpoint="/v2/charge"
| eval declined=if(status="declined", 1, 0)
| stats count AS transactions, sum(amount) AS volume, perc95(latency_ms) AS p95_ms, avg(declined) AS decline_rate BY region
| eval volume="$".tostring(round(volume, 0), "commas"), decline_rate=round(decline_rate * 100, 2)."%"`,
        highlights: [
            { label: 'Transactions', value: '1,126,415', note: '+3.2% day over day' },
            { label: 'Volume', value: '$49.8M' },
            { label: 'p95 latency', value: '238 ms', note: 'SLO: 400 ms' },
        ],
        columns: ['Region', 'Transactions', 'Volume', 'p95 latency (ms)', 'Decline rate'],
        rows: [
            ['us-east', 412880, '$18,402,117', 212, '1.84%'],
            ['us-west', 301455, '$13,377,904', 226, '1.91%'],
            ['eu-central', 214902, '$9,516,340', 251, '2.37%'],
            ['ap-southeast', 119644, '$5,104,288', 287, '2.62%'],
            ['sa-east', 77534, '$3,401,775', 304, '2.95%'],
        ],
        history: buildHistory('2026-10-02T07:00:00Z', 24, 'sssssss', 5, 88),
    },
    {
        slug: 'disk-space-over-85',
        title: 'Disk Space Utilization Above 85%',
        description: 'Hosts and mount points using more than 85% of their disk, checked every 30 minutes so on-call can act before anything fills up.',
        category: 'Infrastructure',
        app: 'Search & Reporting',
        owner: 'infra-ops',
        schedule: 'Every 30 minutes',
        cron: '*/30 * * * *',
        runsPerWeek: 336,
        timeRange: 'Last 30 minutes',
        index: 'os (df)',
        lastRun: '2026-10-02T09:00:00Z',
        nextRun: '2026-10-02T09:30:00Z',
        status: 'failed',
        statusMessage: 'The 09:00 UTC run was skipped because the search head hit its limit on concurrent scheduled searches. The results below are from the last successful run, at 08:30 UTC.',
        resultCount: 7,
        recipients: ['infra-oncall@example.com', 'dba-team@example.com'],
        tags: ['infrastructure', 'capacity', 'alerting'],
        spl: `index=os sourcetype=df
| stats latest(UsePct) AS used_pct, latest(Avail) AS avail BY host, MountedOn
| where used_pct > 85
| sort - used_pct`,
        highlights: [
            { label: 'Mounts over 85%', value: '7', note: 'As of 08:30 UTC' },
            { label: 'Critical (> 95%)', value: '2' },
            { label: 'Fullest mount', value: '97%', note: 'db-prod-02 /var/lib/mysql' },
        ],
        columns: ['Host', 'Mount', 'Used %', 'Available'],
        rows: [
            ['db-prod-02', '/var/lib/mysql', 97, '12G'],
            ['log-agg-01', '/var/log', 96, '7.8G'],
            ['build-runner-04', '/home/runner', 93, '14G'],
            ['db-prod-01', '/var/lib/mysql', 91, '36G'],
            ['web-prod-03', '/', 89, '5.4G'],
            ['cache-02', '/data', 88, '23G'],
            ['jenkins-01', '/var/lib/jenkins', 86, '41G'],
        ],
        history: buildHistory('2026-10-02T09:00:00Z', 0.5, 'swswswf', 6, 9),
    },
    {
        slug: 'privileged-group-changes',
        title: 'Privileged Group Membership Changes',
        description: 'Every add or remove on Domain Admins, Enterprise Admins and other privileged groups in the last 24 hours. Required for the SOX access review.',
        category: 'Compliance',
        app: 'Splunk Enterprise Security',
        owner: 'iam-governance',
        schedule: 'Daily at 05:00 UTC',
        cron: '0 5 * * *',
        runsPerWeek: 7,
        timeRange: 'Last 24 hours',
        index: 'wineventlog (Security)',
        lastRun: '2026-10-02T05:00:00Z',
        nextRun: '2026-10-03T05:00:00Z',
        status: 'success',
        resultCount: 5,
        recipients: ['iam-governance@example.com', 'internal-audit@example.com', 'secops@example.com'],
        tags: ['compliance', 'security', 'audit'],
        spl: `index=wineventlog EventCode IN (4728, 4732, 4756, 4729, 4733, 4757)
| eval action=if(EventCode IN (4728, 4732, 4756), "added", "removed")
| table _time, SubjectUserName, MemberName, TargetUserName, action
| rename SubjectUserName AS changed_by, MemberName AS member, TargetUserName AS group`,
        highlights: [
            { label: 'Changes', value: '5', note: 'Last 24 hours' },
            { label: 'Added to Domain Admins', value: '1', note: 'Needs a ticket reference' },
            { label: 'Changed outside change window', value: '0' },
        ],
        columns: ['Time (UTC)', 'Changed by', 'Member', 'Group', 'Action'],
        rows: [
            ['2026-10-01 14:22', 'a.chen', 'r.patel', 'Domain Admins', 'added'],
            ['2026-10-01 14:25', 'a.chen', 'svc_deploy', 'Server Operators', 'removed'],
            ['2026-10-01 16:03', 'k.oduya', 'j.martin', 'Backup Operators', 'added'],
            ['2026-10-01 19:47', 'k.oduya', 'temp_contractor7', 'Remote Desktop Users', 'removed'],
            ['2026-10-02 01:12', 'svc_iam_sync', 'l.nguyen', 'Account Operators', 'added'],
        ],
        history: buildHistory('2026-10-02T05:00:00Z', 24, 'sssssss', 4, 17),
    },
    {
        slug: 'vpn-sessions-by-country',
        title: 'VPN Sessions by Country',
        description: 'Weekly count of remote-access VPN sessions and unique users by country. Helps spot impossible travel and logins from unexpected regions.',
        category: 'Security',
        app: 'Search & Reporting',
        owner: 'network-security',
        schedule: 'Weekly on Mondays at 08:00 UTC',
        cron: '0 8 * * 1',
        runsPerWeek: 1,
        timeRange: 'Last 7 days',
        index: 'vpn (cisco:asa)',
        lastRun: '2026-09-28T08:00:00Z',
        nextRun: '2026-10-05T08:00:00Z',
        status: 'success',
        resultCount: 9,
        recipients: ['netsec@example.com', 'it-director@example.com', 'hr-mobility@example.com'],
        tags: ['security', 'remote-access', 'weekly'],
        spl: `index=vpn sourcetype=cisco:asa "SVC connection established"
| iplocation src_ip
| stats count AS sessions, dc(user) AS users BY Country
| sort - sessions`,
        highlights: [
            { label: 'Sessions', value: '18,442', note: 'Last 7 days' },
            { label: 'Unique users', value: '1,318' },
            { label: 'New countries', value: '1', note: 'Brazil: 1 user' },
        ],
        columns: ['Country', 'Sessions', 'Unique users'],
        rows: [
            ['United States', 14207, 1021],
            ['Canada', 1844, 131],
            ['United Kingdom', 1102, 74],
            ['India', 688, 52],
            ['Germany', 341, 23],
            ['Mexico', 139, 9],
            ['Ireland', 88, 5],
            ['Philippines', 32, 2],
            ['Brazil', 1, 1],
        ],
        history: buildHistory('2026-09-28T08:00:00Z', 168, 'sssssss', 9, 132),
    },
    {
        slug: 'forwarder-health-missing-hosts',
        title: 'Forwarder Health: Silent Hosts',
        description: 'Universal forwarders that have not sent data in over 60 minutes. When a host goes quiet, we also lose visibility into it.',
        category: 'Infrastructure',
        app: 'Monitoring Console',
        owner: 'splunk-admins',
        schedule: 'Every hour at :15',
        cron: '15 * * * *',
        runsPerWeek: 168,
        timeRange: 'Last 24 hours',
        index: 'All indexes (metadata)',
        lastRun: '2026-10-02T09:15:00Z',
        nextRun: '2026-10-02T10:15:00Z',
        status: 'warning',
        statusMessage: '3 forwarders have been silent for more than 60 minutes, including pos-store-118, which has been down for over 4 hours.',
        resultCount: 3,
        recipients: ['splunk-admins@example.com', 'infra-oncall@example.com'],
        tags: ['infrastructure', 'forwarders', 'hourly'],
        spl: `| metadata type=hosts index=*
| eval minutes_silent=round((now() - lastTime) / 60, 0)
| where minutes_silent > 60
| convert ctime(lastTime) AS last_seen
| table host, last_seen, minutes_silent
| sort - minutes_silent`,
        highlights: [
            { label: 'Silent forwarders', value: '3', note: 'Of 1,284 reporting' },
            { label: 'Longest silence', value: '4h 18m', note: 'pos-store-118' },
            { label: 'Coverage', value: '99.8%' },
        ],
        columns: ['Host', 'Last seen (UTC)', 'Minutes silent'],
        rows: [
            ['pos-store-118', '2026-10-02 04:57', 258],
            ['kiosk-lobby-02', '2026-10-02 07:41', 94],
            ['dev-vm-331', '2026-10-02 08:02', 73],
        ],
        history: buildHistory('2026-10-02T09:15:00Z', 1, 'ssswwww', 2, 6),
    },
];
