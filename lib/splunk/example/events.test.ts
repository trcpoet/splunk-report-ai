import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { reportConfig } from '@/lib/report-config';
import { eventsForMinute, type EventBatch } from '@/lib/splunk/example/events';
import { EXAMPLE_INDEXES, exampleSearches } from '@/lib/splunk/example/searches';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

const NOW = Date.UTC(2026, 9, 29, 15, 0);
const ago = (minutes: number) => new Date(NOW - minutes * 60_000);
const at = (hours: number, minutes: number) => new Date(Date.UTC(2026, 9, 29, hours, minutes));

// The setup's backfill, from `from` minutes ago up to `to` minutes ago.
const backfill = (from: number, to = 0) => {
    const batches: EventBatch[] = [];
    for (let minutes = from; minutes > to; minutes--) batches.push(...eventsForMinute(ago(minutes), { live: false, now: NOW }));
    return batches;
};
const linesOf = (batches: EventBatch[], keep: (batch: EventBatch) => boolean = () => true) => batches.filter(keep).flatMap((batch) => batch.lines);
const hosts = (batches: EventBatch[]) => new Set(batches.map(({ host }) => host));

describe('example events', () => {
    test('use the documentation IP ranges only', () => {
        const ips = linesOf([...backfill(240), ...eventsForMinute(at(15, 30))]).flatMap((line) => line.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []);
        assert.ok(ips.length > 10_000);
        assert.deepEqual(ips.filter((ip) => !/^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)), []);
    });

    test('start each line with its time, in the format its sourcetype uses', () => {
        for (const { sourcetype, lines } of backfill(30)) {
            for (const line of lines) {
                if (sourcetype === 'access_combined') assert.match(line, /^\S+ - - \[\d\d\/[A-Z][a-z]{2}\/\d{4}:\d\d:\d\d:\d\d \+0000\] "/);
                else if (sourcetype === 'linux_secure') assert.match(line, /^[A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d bastion-01 sshd\[\d+\]: Failed password for /);
                else assert.match(line, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z /);
            }
        }
    });

    test('go to the indexes the setup creates', () => {
        assert.deepEqual([...new Set(backfill(30).map(({ index }) => index))].filter((index) => !EXAMPLE_INDEXES.includes(index)), []);
    });

    test('come out the same for the same minute', () => {
        assert.deepEqual(eventsForMinute(ago(5)), eventsForMinute(ago(5)));
    });

    test('put web-03 above the 2% error budget, and the other servers below it', () => {
        const rates = new Map<string, number>();
        for (const batch of backfill(60).filter(({ sourcetype }) => sourcetype === 'access_combined')) {
            const errors = batch.lines.filter((line) => /" 5\d\d /.test(line)).length;
            rates.set(batch.host, (rates.get(batch.host) ?? 0) + errors / batch.lines.length / 60);
        }
        assert.ok(rates.get('web-03')! > 0.02, `web-03: ${rates.get('web-03')}`);
        for (const [host, rate] of rates) if (host !== 'web-03') assert.ok(rate < 0.02, `${host}: ${rate}`);
    });

    test('spray passwords at half past the hour, from the feeder only', () => {
        const spraying = (batches: EventBatch[]) => linesOf(batches).filter((line) => line.includes('src_ip=203.0.113.66')).length;
        assert.equal(spraying(eventsForMinute(at(15, 30))), 40 * 12);
        assert.equal(spraying(eventsForMinute(at(15, 31))), 0);
        assert.equal(spraying(eventsForMinute(at(15, 30), { live: false, now: NOW + 60 * 60_000 })), 0);
    });

    test('stop sending from the silent hosts before the backfill time, and never live', () => {
        assert.ok(hosts(eventsForMinute(ago(200), { live: false, now: NOW })).has('db-03'));
        assert.ok(!hosts(eventsForMinute(ago(120), { live: false, now: NOW })).has('db-03'));
        assert.ok(hosts(eventsForMinute(ago(120), { live: false, now: NOW })).has('app-07'));
        assert.ok(!hosts(eventsForMinute(ago(60), { live: false, now: NOW })).has('app-07'));
        assert.ok(!hosts(eventsForMinute(ago(200))).has('db-03'));
    });

    test('send only the sparse security logs before the last 4 hours', () => {
        assert.deepEqual([...new Set(backfill(600, 300).map(({ index }) => index))].sort(), ['linux_secure', 'wineventlog']);
    });
});

describe('example searches', () => {
    test('are six dummy reports the sync picks up, with their columns named as report-config expects', () => {
        const searches = exampleSearches();
        assert.equal(searches.length, 6);
        for (const search of searches) {
            assert.ok(reportConfig[search.name], `${search.name} is in report-config`);
            const fixture = fixtures.find(({ title }) => title === search.name)!;
            for (const column of fixture.columns) assert.ok(search.search.includes(`"${column}"`), `${search.name} names "${column}"`);
            assert.ok(search.recipients.length > 0);
        }
    });
});
