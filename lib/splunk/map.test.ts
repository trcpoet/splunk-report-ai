import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildHistory, reports as fixtures } from '@/lib/splunk/fixtures/reports';
import { fixtureTransport } from '@/lib/splunk/fixtures/transport';
import {
    describeCron,
    describeIndexes,
    describeTimeRange,
    deriveReportFields,
    groupsFromRecipients,
    mapResults,
    parseRecipients,
    parseSplunkTime,
    runStatus,
    runsPerWeek,
    toCell,
} from '@/lib/splunk/map';
import { fetchNewRuns, listScheduledReports } from '@/lib/splunk/sync';

describe('toCell', () => {
    test('converts numeric strings and leaves everything else alone', () => {
        assert.equal(toCell('312'), 312);
        assert.equal(toCell('0.87'), 0.87);
        assert.equal(toCell('-4'), -4);
        assert.equal(toCell('007'), '007');
        assert.equal(toCell('192.0.2.1'), '192.0.2.1');
        assert.equal(toCell('2026-10-02 05:41'), '2026-10-02 05:41');
        assert.equal(toCell(['dmz', 'corp']), 'dmz, corp');
        assert.equal(toCell(null), '');
    });
});

describe('mapResults', () => {
    test('keeps _time, drops other internal fields and accepts both field shapes', () => {
        const table = mapResults({
            fields: [{ name: '_time' }, 'host', { name: '_raw' }, { name: 'count' }],
            results: [{ _time: '2026-10-02T06:00:00.000+00:00', host: 'web-01', _raw: 'GET /', count: '12' }],
        });

        assert.deepEqual(table, { columns: ['_time', 'host', 'count'], rows: [['2026-10-02T06:00:00.000+00:00', 'web-01', 12]] });
    });

    test("uses the first result's keys when fields are missing", () => {
        assert.deepEqual(mapResults({ results: [{ user: 'admin', failures: '264' }] }), {
            columns: ['user', 'failures'],
            rows: [['admin', 264]],
        });
    });
});

describe('schedules, time ranges and indexes', () => {
    test('describes every fixture schedule the way the dummy data does', () => {
        for (const fixture of fixtures) assert.equal(describeCron(fixture.cron), fixture.schedule, fixture.slug);
    });

    test('falls back to cronstrue for other schedules', () => {
        assert.equal(describeCron('0 9 1 * *'), 'At 09:00, on day 1 of the month (UTC)');
        assert.equal(describeCron('0 6 * * *', 'America/Chicago'), 'Daily at 06:00 America/Chicago');
    });

    test('counts runs per week', () => {
        for (const fixture of fixtures) assert.equal(runsPerWeek(fixture.cron), fixture.runsPerWeek, fixture.slug);
        assert.equal(runsPerWeek('not a cron'), 0);
    });

    test('names time ranges', () => {
        assert.equal(describeTimeRange('-24h', 'now'), 'Last 24 hours');
        assert.equal(describeTimeRange('-1h', ''), 'Last 1 hour');
        assert.equal(describeTimeRange('-1d@d', '@d'), 'Yesterday');
        assert.equal(describeTimeRange('-7d@w0', '@w0'), '-7d@w0 to @w0');
    });

    test('reads indexes and sourcetypes from SPL', () => {
        assert.equal(describeIndexes('index=web sourcetype=access_combined | stats count'), 'web (access_combined)');
        assert.equal(describeIndexes('index=wineventlog OR (index="linux_secure" "Failed password")'), 'wineventlog, linux_secure');
        assert.equal(describeIndexes('| metadata type=hosts index=*'), 'All indexes');
        assert.equal(describeIndexes('| inputlookup assets.csv'), '');
    });

    test('parses Splunk timestamps', () => {
        assert.equal(parseSplunkTime('2026-10-03 06:00:00 UTC')?.toISOString(), '2026-10-03T06:00:00.000Z');
        assert.equal(parseSplunkTime('not a time'), null);
    });
});

describe('recipients', () => {
    test('turns email lists into groups', () => {
        const recipients = parseRecipients('SecOps@example.com, soc-tier1@example.com;secops@example.com');
        assert.deepEqual(recipients, ['secops@example.com', 'soc-tier1@example.com']);
        assert.deepEqual(groupsFromRecipients(recipients), ['secops', 'soc-tier1']);
    });
});

describe('runStatus', () => {
    const rule = () => ({ status: 'warning' as const, message: 'Over budget.' });
    const results = { columns: ['host'], rows: [['web-01']], resultCount: 1 };

    test('a failed job wins, with its error message', () => {
        const job = { dispatchState: 'FAILED', messages: [{ type: 'FATAL', text: 'Search was skipped.' }] };
        assert.deepEqual(runStatus(job, results, rule), { status: 'failed', statusMessage: 'Search was skipped.' });
    });

    test('the status rule runs only when results are available', () => {
        assert.deepEqual(runStatus({ dispatchState: 'DONE' }, results, rule), { status: 'warning', statusMessage: 'Over budget.' });
        assert.deepEqual(runStatus({ dispatchState: 'DONE' }, null, rule), { status: 'success' });
    });

    test('job warnings make a warning, in either message shape', () => {
        assert.deepEqual(runStatus({ dispatchState: 'DONE', messages: { warn: ['Peer timed out.'] } }, null), {
            status: 'warning',
            statusMessage: 'Peer timed out.',
        });
    });
});

// Runs the Splunk side of the sync against the fixture transport, without
// MongoDB, and checks that it reproduces the dummy reports.
describe('fixture pipeline', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    let pipeline: ReturnType<typeof runPipeline> | undefined;

    async function runPipeline() {
        const transport = fixtureTransport();
        const scheduled = await listScheduledReports(transport, 'UTC', now);

        return Promise.all(scheduled.map(async (report) => {
            const runs = await fetchNewRuns(transport, report, new Set());
            const newestFirst = [...runs].sort((a, b) => b.runAt.getTime() - a.runAt.getTime());
            const resultsRun = newestFirst.find((run) => run.hasResults) ?? null;
            const derived = deriveReportFields({ recent: newestFirst.slice(0, 7), resultsRun, chartType: report.meta.chartType, config: report.config });
            const fixture = fixtures.find((candidate) => candidate.slug === report.meta.slug);
            assert.ok(fixture, `no fixture for ${report.meta.slug}`);

            return { report, runs, resultsRun, derived, fixture, transport };
        }));
    }

    const synced = () => (pipeline ??= runPipeline());

    test('finds every report with its details', async () => {
        const results = await synced();
        assert.equal(results.length, fixtures.length);

        for (const { report: { meta }, fixture } of results) {
            assert.deepEqual(
                {
                    title: meta.title,
                    description: meta.description,
                    spl: meta.spl,
                    cron: meta.cron,
                    schedule: meta.schedule,
                    runsPerWeek: meta.runsPerWeek,
                    timeRange: meta.timeRange,
                    index: meta.index,
                    recipients: meta.recipients,
                    category: meta.category,
                    tags: meta.tags,
                    owner: meta.splunk.owner,
                    app: meta.splunk.appLabel,
                    nextRun: meta.nextRun?.toISOString(),
                },
                {
                    title: fixture.title,
                    description: fixture.description,
                    spl: fixture.spl,
                    cron: fixture.cron,
                    schedule: fixture.schedule,
                    runsPerWeek: fixture.runsPerWeek,
                    timeRange: fixture.timeRange,
                    index: fixture.index,
                    recipients: fixture.recipients,
                    category: fixture.category,
                    tags: fixture.tags,
                    owner: fixture.owner,
                    app: fixture.app,
                    nextRun: new Date(fixture.nextRun).toISOString(),
                },
                fixture.slug,
            );
            assert.deepEqual(meta.allowedGroups, groupsFromRecipients(fixture.recipients), fixture.slug);
        }
    });

    test('reproduces each report status, message and run history', async () => {
        for (const { derived, fixture } of await synced()) {
            assert.equal(derived.latest?.status, fixture.status, fixture.slug);
            assert.equal(derived.latest?.statusMessage, fixture.statusMessage, fixture.slug);
            assert.deepEqual(
                derived.history.map((run) => [run.runAt.toISOString(), run.status]),
                fixture.history.map((run) => [new Date(run.runAt).toISOString(), run.status]),
                fixture.slug,
            );
        }
    });

    test('keeps the newest results and marks older ones expired', async () => {
        for (const { runs, resultsRun, fixture } of await synced()) {
            assert.deepEqual(resultsRun?.columns, fixture.columns, fixture.slug);
            assert.deepEqual(resultsRun?.rows, fixture.rows, fixture.slug);
            assert.equal(resultsRun?.resultCount, fixture.resultCount, fixture.slug);

            const failed = fixture.history.filter((run) => run.status === 'failed').length;
            assert.equal(runs.filter((run) => run.resultsExpired).length, fixture.history.length - 1 - failed, fixture.slug);
        }
    });

    test('picks charts from the Splunk display settings and report-config', async () => {
        const charts = Object.fromEntries((await synced()).map(({ fixture, derived }) => [fixture.slug, derived.chart]));

        assert.equal(charts['privileged-group-changes'], null);
        assert.deepEqual(charts['web-5xx-error-rate'], { type: 'column', x: 'Host', y: 'Error rate %', threshold: { value: 2, label: '2% error budget' } });
        assert.deepEqual(charts['disk-space-over-85'], { type: 'bar', x: 'Host', y: 'Used %', threshold: { value: 95, label: '95% critical' }, max: 100 });
        assert.deepEqual(charts['failed-logins-by-user'], { type: 'bar', x: 'User', y: 'Failures' });
        assert.deepEqual(charts['forwarder-health-missing-hosts'], { type: 'bar', x: 'Host', y: 'Minutes silent' });
    });

    test('builds highlights, with the custom ones for web 5xx and license usage', async () => {
        const results = await synced();
        const bySlug = (slug: string) => results.find(({ fixture }) => fixture.slug === slug)!;

        const web = bySlug('web-5xx-error-rate');
        assert.deepEqual(web.derived.highlights, web.fixture.highlights);

        const license = bySlug('license-usage-by-index');
        assert.deepEqual(license.derived.highlights, license.fixture.highlights);

        const logins = bySlug('failed-logins-by-user');
        assert.deepEqual(logins.derived.highlights, [
            { label: 'Results', value: '42', note: '+12 vs. previous run', trend: [30, 38, 46, 34, 42, 30, 42] },
            { label: 'Top user', value: 'svc_backup', note: 'Failures: 312' },
            { label: 'Search time', value: '41s' },
        ]);
    });

    test('the results sparkline skips runs that failed', async () => {
        const disk = (await synced()).find(({ fixture }) => fixture.slug === 'disk-space-over-85')!;
        const oldestFirst = [...disk.runs].sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
        const finished = oldestFirst.filter((run) => run.status !== 'failed').map((run) => run.resultCount);

        assert.ok(finished.length < oldestFirst.length);
        assert.deepEqual(disk.derived.highlights[0].trend, finished);
    });

    test('a second pass finds no new runs', async () => {
        for (const { report, runs, transport } of await synced()) {
            const again = await fetchNewRuns(transport, report, new Set(runs.map((run) => run.sid)));
            assert.equal(again.length, 0, report.meta.slug);
        }
    });

    test('moving a fixture forward by one run adds exactly that run', async () => {
        const web = fixtures.find((fixture) => fixture.slug === 'web-5xx-error-rate')!;
        const nextHour = {
            ...web,
            lastRun: '2026-10-02T10:00:00Z',
            nextRun: '2026-10-02T11:00:00Z',
            history: buildHistory('2026-10-02T10:00:00Z', 1, 'sssswww', 6, 12),
        };

        const runsOf = async (source: typeof fixtures, known: Set<string>) => {
            const transport = fixtureTransport(source);
            const [report] = await listScheduledReports(transport, 'UTC', now);
            return fetchNewRuns(transport, report, known);
        };

        const before = await runsOf([web], new Set());
        const added = await runsOf([nextHour], new Set(before.map((run) => run.sid)));

        assert.deepEqual(added.map((run) => run.runAt.toISOString()), ['2026-10-02T10:00:00.000Z']);
    });
});
