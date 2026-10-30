import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { countsOn, lastDays, runHealthRows, worstStatus, type RunCount } from '@/lib/run-health';

const counts: RunCount[] = [
    { slug: 'disk', day: '2026-10-02', status: 'success', count: 3 },
    { slug: 'disk', day: '2026-10-02', status: 'warning', count: 3 },
    { slug: 'disk', day: '2026-10-02', status: 'failed', count: 1 },
    { slug: 'logins', day: '2026-09-29', status: 'warning', count: 1 },
    { slug: 'logins', day: '2026-10-03', status: 'success', count: 1 },
    { slug: 'license', day: '2026-10-01', status: 'success', count: 1 },
];

describe('lastDays', () => {
    test('ends on the newest day with a run', () => {
        assert.deepEqual(lastDays(counts, 3), ['2026-10-01', '2026-10-02', '2026-10-03']);
        assert.deepEqual(lastDays([{ day: '2026-03-01' }], 2), ['2026-02-28', '2026-03-01']);
        assert.deepEqual(lastDays([], 7), []);
    });
});

describe('countsOn and worstStatus', () => {
    test('add up a day, for one report or all of them', () => {
        assert.deepEqual(countsOn(counts, '2026-10-02', 'disk'), { success: 3, warning: 3, failed: 1 });
        assert.deepEqual(countsOn(counts, '2026-10-02'), { success: 3, warning: 3, failed: 1 });
        assert.deepEqual(countsOn(counts, '2026-10-02', 'logins'), { success: 0, warning: 0, failed: 0 });
    });

    test('failed beats warning beats healthy; no runs is null', () => {
        assert.equal(worstStatus({ success: 3, warning: 3, failed: 1 }), 'failed');
        assert.equal(worstStatus({ success: 3, warning: 1, failed: 0 }), 'warning');
        assert.equal(worstStatus({ success: 1, warning: 0, failed: 0 }), 'success');
        assert.equal(worstStatus({ success: 0, warning: 0, failed: 0 }), null);
    });
});

describe('runHealthRows', () => {
    const reports = [
        { slug: 'license', title: 'License usage' },
        { slug: 'logins', title: 'Failed logins' },
        { slug: 'disk', title: 'Disk space' },
        { slug: 'vpn', title: 'VPN sessions' },
    ];
    const rows = runHealthRows(reports, counts, lastDays(counts, 7));

    test('puts failures first, then warnings, then the rest by title', () => {
        assert.deepEqual(rows.map(({ slug }) => slug), ['disk', 'logins', 'license', 'vpn']);
    });

    test('has a cell per day, null when the report did not run', () => {
        const logins = rows.find(({ slug }) => slug === 'logins')!;
        assert.equal(logins.cells.length, 7);
        assert.deepEqual(logins.cells.map((cell) => (cell ? worstStatus(cell) : null)), [null, null, 'warning', null, null, null, 'success']);
        assert.equal(rows.find(({ slug }) => slug === 'vpn')!.cells.every((cell) => cell === null), true);
    });
});
