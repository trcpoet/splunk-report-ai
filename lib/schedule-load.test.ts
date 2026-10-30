import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { RunRecord } from '@/lib/reports';
import { scheduleLoad } from '@/lib/schedule-load';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

const titleOf = (slug: string) => fixtures.find((fixture) => fixture.slug === slug)!.title;
const at = (hour: number, minute = 0) => hour * 60 + minute;

const ran = (...durations: number[]): RunRecord[] =>
    durations.map((durationSec, i) => ({ runAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(), status: 'success', durationSec, resultCount: 1 }));

// A report with this schedule, whose searches take `seconds` (a minute without).
const report = (title: string, cron: string, seconds?: number) => ({ title, cron, history: seconds ? ran(seconds) : [] });

describe('scheduleLoad', () => {
    const load = scheduleLoad(fixtures);
    const slot = (minute: number) => load.slots.find((candidate) => candidate.minute === minute)!;

    test('counts the demo searches running at once, on the busiest day', () => {
        assert.equal(load.slots.length, 288);

        // Every hour on the hour: Web 5xx and Disk. Every 4 hours, Firewall
        // too, and the daily reports at 05:00, 06:00 and 07:00.
        for (const hour of [0, 4, 5, 6, 7, 12, 16, 20]) assert.equal(slot(at(hour)).running, 3, `${hour}:00`);
        for (const hour of [1, 2, 3, 9, 10, 23]) assert.equal(slot(at(hour)).running, 2, `${hour}:00`);

        assert.equal(slot(at(0, 30)).running, 2); // Disk and License
        assert.equal(slot(at(1, 30)).running, 1); // Disk
        assert.equal(slot(at(1, 15)).running, 1); // Forwarders
        assert.equal(slot(at(1, 45)).running, 0);
    });

    test('names the busiest times and when they happen', () => {
        assert.deepEqual(load.busiest[0], {
            running: 4,
            times: [{
                minute: at(8),
                until: at(8, 5),
                on: 'Mondays',
                reports: ['web-5xx-error-rate', 'firewall-denied-top-sources', 'disk-space-over-85', 'vpn-sessions-by-country'].map(titleOf),
            }],
        });

        // Every time with 3 at once, not just the first few.
        assert.equal(load.busiest[1].running, 3);
        assert.deepEqual(load.busiest[1].times.map(({ minute, on }) => [minute, on]), [0, 4, 5, 6, 7, 12, 16, 20].map((hour) => [at(hour), null]));
        assert.equal(load.busiest.length, 2);
    });

    test('counts only the reports that always start on the hour', () => {
        // Not License (00:30), Forwarders (:15) or Disk (every 30 minutes).
        assert.equal(load.onTheHour, 6);
        assert.equal(load.total, 9);

        // A search every 5 or 15 minutes reaches :00 wherever it starts.
        const often = scheduleLoad([report('Five', '*/5 * * * *'), report('Fifteen', '*/15 * * * *'), report('Nightly', '0 3 * * *')]);
        assert.equal(often.onTheHour, 1);
    });

    test('a run lasts its usual time, in whole minutes', () => {
        const weekly = scheduleLoad([{ title: 'Long', cron: '0 8 * * 1', history: ran(126, 132, 138) }], 'UTC', 1);
        const running = (minute: number) => weekly.slots[minute].running;

        // 132 s takes three minutes: 08:00, 08:01 and 08:02.
        assert.deepEqual([at(8) - 1, at(8), at(8, 2), at(8, 3)].map(running), [0, 1, 1, 0]);
        // Without finished runs, a search counts for a minute.
        assert.equal(scheduleLoad([report('New', '0 8 * * *')], 'UTC', 1).slots[at(8, 1)].running, 0);
    });

    test('carries runs past midnight', () => {
        // 15 minutes from 23:55, every night: busy until 00:10, every day,
        // including the 1st, whose 00:00 comes from the night before.
        const late = scheduleLoad([report('A', '55 23 * * *', 900), report('B', '55 23 * * *', 900)]);
        assert.deepEqual(late.busiest, [{
            running: 2,
            times: [
                { minute: at(0), until: at(0, 10), on: null, reports: ['A', 'B'] },
                { minute: at(23, 55), until: at(24), on: null, reports: ['A', 'B'] },
            ],
        }]);
    });

    test('joins neighboring slots only for the same searches on the same days', () => {
        const mixed = scheduleLoad([
            report('A', '0 8 * * 1', 300),
            report('B', '0 8 * * 1', 300),
            report('C', '5 8 * * *'),
            report('D', '5 8 * * *'),
        ]);
        assert.deepEqual(mixed.busiest[0].times, [
            { minute: at(8), until: at(8, 5), on: 'Mondays', reports: ['A', 'B'] },
            { minute: at(8, 5), until: at(8, 10), on: null, reports: ['C', 'D'] },
        ]);
    });

    test('says which days, in words', () => {
        const on = (cron: string) => scheduleLoad([report('A', cron), report('B', cron)]).busiest[0].times[0].on;

        assert.equal(on('0 8 1 * *'), 'once a month');
        assert.equal(on('0 8 1,15 * *'), '2 days a month');
        assert.equal(on('0 8 * * 1-5'), 'weekdays');
        assert.equal(on('0 8 * * 0,6'), 'weekends');
        assert.equal(on('0 8 * * 3'), 'Wednesdays');
    });

    test('shows every time zone in its own clock time', () => {
        const daily = [report('Daily', '0 6 * * *')];

        for (const timeZone of ['America/Chicago', 'Asia/Kolkata']) {
            const local = scheduleLoad(daily, timeZone);
            assert.equal(local.timeZone, timeZone);
            assert.equal(local.slots[at(6) / 5].running, 1, timeZone);
            assert.equal(local.slots.reduce((sum, { running }) => sum + running, 0), 1, timeZone);
        }

        // An unknown zone is labeled UTC.
        assert.equal(scheduleLoad(daily, 'Not/A_Zone').timeZone, 'UTC');
    });

    test('leaves out schedules it cannot read or place, and handles none at all', () => {
        const broken = scheduleLoad([report('Broken', 'every day'), report('June', '0 8 15 6 *'), report('Hourly', '0 * * * *')]);
        assert.equal(broken.total, 1);
        assert.equal(broken.slots[0].running, 1);

        const empty = scheduleLoad([]);
        assert.equal(empty.slots.every(({ running }) => running === 0), true);
        assert.deepEqual(empty.busiest, []);
        assert.equal(empty.onTheHour, 0);
        assert.equal(empty.total, 0);
    });
});
