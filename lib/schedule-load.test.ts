import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { RunRecord } from '@/lib/reports';
import { scheduleLoad } from '@/lib/schedule-load';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

const titleOf = (slug: string) => fixtures.find((fixture) => fixture.slug === slug)!.title;
const at = (hour: number, minute = 0) => hour * 60 + minute;

const ran = (...durations: number[]): RunRecord[] =>
    durations.map((durationSec, i) => ({ runAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(), status: 'success', durationSec, resultCount: 1 }));

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

    test('joins busy slots that follow each other', () => {
        // A 12-minute search every day at 06:00 fills three 5-minute slots.
        const long = scheduleLoad([
            { title: 'Long', cron: '0 6 * * *', history: ran(720) },
            { title: 'Other', cron: '0 6 * * *', history: ran(720) },
        ]);
        assert.deepEqual(long.busiest.map(({ running, times }) => [running, times.map(({ minute, until }) => [minute, until])]), [
            [2, [[at(6), at(6, 15)]]],
        ]);
    });

    test('counts the reports that start on the hour', () => {
        // All but License (00:30) and Forwarders (:15).
        assert.equal(load.onTheHour, 7);
        assert.equal(load.total, 9);
    });

    test('a run lasts its usual time, in whole minutes', () => {
        const weekly = scheduleLoad([{ title: 'Long', cron: '0 8 * * 1', history: ran(126, 132, 138) }], 'UTC', 1);
        const running = (minute: number) => weekly.slots[minute].running;

        // 132 s takes three minutes: 08:00, 08:01 and 08:02.
        assert.deepEqual([at(8) - 1, at(8), at(8, 2), at(8, 3)].map(running), [0, 1, 1, 0]);
        // Without finished runs, a search counts for a minute.
        assert.equal(scheduleLoad([{ title: 'New', cron: '0 8 * * *', history: [] }], 'UTC', 1).slots[at(8, 1)].running, 0);
    });

    test('reads schedules in their own time zone', () => {
        const daily = [{ title: 'Daily', cron: '0 6 * * *', history: [] }];

        for (const timeZone of ['America/Chicago', 'Asia/Kolkata']) {
            const local = scheduleLoad(daily, timeZone);
            assert.equal(local.timeZone, timeZone);
            assert.equal(local.slots[at(6) / 5].running, 1, timeZone);
            assert.equal(local.slots.reduce((sum, { running }) => sum + running, 0), 1, timeZone);
        }

        // An unknown zone falls back to UTC.
        assert.equal(scheduleLoad(daily, 'Not/A_Zone').timeZone, 'UTC');
    });

    test('skips a schedule it cannot read, and handles none at all', () => {
        const broken = scheduleLoad([{ title: 'Broken', cron: 'every day', history: [] }, { title: 'Hourly', cron: '0 * * * *', history: [] }]);
        assert.equal(broken.total, 1);
        assert.equal(broken.slots[0].running, 1);

        const empty = scheduleLoad([]);
        assert.equal(empty.slots.every(({ running }) => running === 0), true);
        assert.deepEqual(empty.busiest, []);
        assert.equal(empty.onTheHour, 0);
        assert.equal(empty.total, 0);
    });
});
