import { createHash } from 'node:crypto';
import type { Cell } from '@/lib/reports';
import { SplunkHttpError, type QueryParams, type SplunkTransport } from '../transport';
import type { AppContent, HistoryContent, JobContent, JobMessage, ResultsResponse, SavedSearchContent, SplunkEntry, SplunkFeed } from '../types';
import { reports, type FixtureReport } from './reports';

// Answers the REST paths the sync worker calls, in Splunk's JSON shape, from the
// dummy reports. It behaves like a search head where:
// - every report keeps its last 7 scheduled runs in history
// - only the newest run that finished still has results; older runs return 404,
//   like job artifacts deleted after dispatch.ttl
// - result values arrive as strings

const APP_IDS: Record<string, string> = {
    'Search & Reporting': 'search',
    'Splunk Enterprise Security': 'SplunkEnterpriseSecuritySuite',
    'Monitoring Console': 'splunk_monitoring_console',
    'Payments Analytics': 'payments_analytics',
};

const TIME_RANGES: Record<string, [earliest: string, latest: string]> = {
    'Last 24 hours': ['-24h', 'now'],
    'Last 60 minutes': ['-60m', 'now'],
    'Last 4 hours': ['-4h', 'now'],
    'Last 30 minutes': ['-30m', 'now'],
    'Last 7 days': ['-7d', 'now'],
    Yesterday: ['-1d@d', '@d'],
};

// The chart each report's author picked in Splunk. null means a statistics table.
const CHARTS: Record<string, 'bar' | 'column' | null> = {
    'failed-logins-by-user': 'bar',
    'web-5xx-error-rate': 'column',
    'firewall-denied-top-sources': 'bar',
    'license-usage-by-index': 'bar',
    'payments-volume-latency': 'column',
    'disk-space-over-85': 'bar',
    'privileged-group-changes': null,
    'vpn-sessions-by-country': 'bar',
    'forwarder-health-missing-hosts': 'bar',
};

const SKIPPED = 'The search was skipped because the search head reached its limit on concurrent scheduled searches.';
const PARTIAL = 'Search results might be incomplete: 1 of 12 search peers did not respond in time.';

type FixtureRun = {
    sid: string;
    runAt: string;
    failed: boolean;
    durationSec: number;
    resultCount: number;
    message?: JobMessage;
    rows?: Cell[][];
};

const appIdOf = (report: FixtureReport) => APP_IDS[report.app] ?? 'search';

function buildRuns(report: FixtureReport): FixtureRun[] {
    const hash = createHash('md5').update(report.slug).digest('hex').slice(0, 16);
    const resultsIndex = report.history.findLastIndex((run) => run.status !== 'failed');
    const latestIndex = report.history.length - 1;

    return report.history.map((run, index) => {
        const failed = run.status === 'failed';
        const hasResults = index === resultsIndex;
        const epoch = Math.floor(new Date(run.runAt).getTime() / 1000);

        // Warnings on the run that still has results come from the status rules in
        // report-config. Older runs have lost their results, so their warnings are
        // job messages instead.
        let message: JobMessage | undefined;
        if (failed) message = { type: 'FATAL', text: (index === latestIndex && report.statusMessage) || SKIPPED };
        else if (run.status === 'warning' && !hasResults) message = { type: 'WARN', text: PARTIAL };

        // Splunk ends a scheduled sid with a counter. Deriving it from the report
        // and run time keeps each run's sid stable when a fixture's lastRun moves
        // forward, so the sync adds only the new runs.
        const counter = parseInt(createHash('md5').update(`${report.slug}:${epoch}`).digest('hex').slice(0, 4), 16) % 10_000;

        return {
            sid: `scheduler__${report.owner}__${appIdOf(report)}__RMD5${hash}_at_${epoch}_${counter}`,
            runAt: run.runAt,
            failed,
            durationSec: run.durationSec,
            resultCount: hasResults ? report.resultCount : run.resultCount,
            message,
            rows: hasResults ? report.rows : undefined,
        };
    });
}

// Splunk formats next_scheduled_time like "2026-10-03 06:00:00 UTC".
const splunkTime = (iso: string) => new Date(iso).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

function savedSearch(report: FixtureReport): SplunkEntry<SavedSearchContent> {
    const [earliest, latest] = TIME_RANGES[report.timeRange] ?? ['-24h', 'now'];
    const chart = CHARTS[report.slug] ?? null;

    return {
        name: report.title,
        acl: { app: appIdOf(report), owner: report.owner, sharing: 'app', perms: { read: ['*'], write: ['admin'] } },
        content: {
            search: report.spl,
            description: report.description,
            cron_schedule: report.cron,
            is_scheduled: true,
            disabled: false,
            next_scheduled_time: splunkTime(report.nextRun),
            'dispatch.earliest_time': earliest,
            'dispatch.latest_time': latest,
            'dispatch.ttl': '2p',
            'action.email': true,
            'action.email.to': report.recipients.join(','),
            'display.general.type': chart ? 'visualizations' : 'statistics',
            'display.visualizations.show': chart !== null,
            'display.visualizations.type': 'charting',
            'display.visualizations.charting.chart': chart ?? 'column',
        },
    };
}

const feed = <Content>(entry: SplunkEntry<Content>[]): SplunkFeed<Content> => ({
    entry,
    paging: { total: entry.length, perPage: entry.length, offset: 0 },
});

const notFound = (what: string) => new SplunkHttpError(404, `Unknown ${what}`);

// Serves the dummy reports, or another list (the tests pass edited copies).
export function fixtureTransport(source: FixtureReport[] = reports): SplunkTransport {
    const byName = new Map(source.map((report) => [report.title, report]));
    const runs = new Map(source.map((report) => [report.slug, buildRuns(report)]));
    const jobs = new Map(source.flatMap((report) => runs.get(report.slug)!.map((run) => [run.sid, { report, run }] as const)));

    const apps = () => feed<AppContent>(Object.entries(APP_IDS).map(([label, name]) => ({ name, content: { label } })));

    const history = (name: string, params: QueryParams) => {
        const report = byName.get(name);
        if (!report) throw notFound(`saved search ${name}`);

        // Newest first.
        const entries = [...runs.get(report.slug)!].reverse().map((run): SplunkEntry<HistoryContent> => ({
            name: run.sid,
            published: run.runAt,
            content: { isDone: true, isScheduled: true },
        }));
        return feed(entries.slice(0, Number(params.count) || entries.length));
    };

    const job = (sid: string) => {
        const found = jobs.get(sid);
        if (!found) throw notFound(`search job ${sid}`);

        const { report, run } = found;
        return feed<JobContent>([{
            name: sid,
            published: run.runAt,
            content: {
                sid,
                label: report.title,
                dispatchState: run.failed ? 'FAILED' : 'DONE',
                isDone: true,
                isFailed: run.failed,
                runDuration: run.durationSec,
                resultCount: run.resultCount,
                messages: run.message ? [run.message] : [],
            },
        }]);
    };

    const results = (sid: string, params: QueryParams): ResultsResponse => {
        const found = jobs.get(sid);
        if (!found?.run.rows) throw notFound(`results for ${sid}`);

        const { report, run } = found;
        const rows = Number(params.count) > 0 ? run.rows!.slice(0, Number(params.count)) : run.rows!;
        return {
            fields: report.columns.map((name) => ({ name })),
            results: rows.map((row) => Object.fromEntries(report.columns.map((column, i) => [column, String(row[i])]))),
            messages: [],
        };
    };

    const routes: [RegExp, (match: string[], params: QueryParams) => unknown][] = [
        [/^\/services\/apps\/local$/, () => apps()],
        [/^\/servicesNS\/[^/]+\/[^/]+\/saved\/searches$/, () => feed(source.map(savedSearch))],
        [/^\/servicesNS\/[^/]+\/[^/]+\/saved\/searches\/([^/]+)\/history$/, ([name], params) => history(name, params)],
        [/^\/services\/search\/jobs\/([^/]+)$/, ([sid]) => job(sid)],
        [/^\/services\/search\/v2\/jobs\/([^/]+)\/results$/, ([sid], params) => results(sid, params)],
    ];

    return {
        async get<T>(path: string, params: QueryParams = {}) {
            for (const [pattern, handle] of routes) {
                const match = path.match(pattern);
                if (match) return handle(match.slice(1).map(decodeURIComponent), params) as T;
            }
            throw notFound(`path ${path}`);
        },
    };
}
