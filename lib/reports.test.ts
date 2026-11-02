import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { needsAttention, paginate, sortByLastRun, syncProblem, toSummary, type ReportListItem, type SyncInfo } from '@/lib/reports';

describe('needsAttention', () => {
    test('is for warnings and failures, not for a report that has yet to run', () => {
        assert.equal(needsAttention({ status: 'warning' }), true);
        assert.equal(needsAttention({ status: 'failed' }), true);
        assert.equal(needsAttention({ status: 'success' }), false);
        assert.equal(needsAttention({ status: 'none' }), false);
    });
});

describe('syncProblem', () => {
    const now = Date.parse('2026-10-02T12:00:00Z');
    const sync: SyncInfo = { mode: 'live', lastSuccessAt: '2026-10-02T11:45:00.000Z', lastError: null, timeZone: 'UTC' };

    test('says nothing after a recent, clean sync', () => {
        assert.equal(syncProblem(sync, now), null);
    });

    test('reports a sync that failed', () => {
        assert.match(syncProblem({ ...sync, lastError: '2 reports failed to sync' }, now) ?? '', /last sync had problems/);
    });

    test('reports a failure before any sync has finished', () => {
        assert.match(syncProblem({ ...sync, lastSuccessAt: '', lastError: 'Splunk answered 401' }, now) ?? '', /last sync had problems/);
    });

    test('reports live data that has stopped arriving', () => {
        assert.equal(syncProblem({ ...sync, lastSuccessAt: '2026-10-02T06:00:00.000Z' }, now), 'No new data since Oct 2, 06:00 UTC. The sync may have stopped.');
    });

    test('follows a slower schedule', () => {
        const fiveHoursOld = { ...sync, lastSuccessAt: '2026-10-02T07:00:00.000Z' };
        assert.match(syncProblem(fiveHoursOld, now) ?? '', /No new data/);
        assert.equal(syncProblem(fiveHoursOld, now, 6), null);
    });

    test('never calls dummy data stale', () => {
        assert.equal(syncProblem({ ...sync, mode: 'fixture', lastSuccessAt: '2026-01-01T00:00:00.000Z' }, now), null);
    });
});

describe('sortByLastRun', () => {
    const report = (title: string, lastRun: string) => ({ title, lastRun });

    test('puts the newest last run first, reports with no run last, and ties by title', () => {
        const sorted = sortByLastRun([
            report('Old', '2026-10-01T06:00:00.000Z'),
            report('Never', ''),
            report('Newest B', '2026-10-02T06:00:00.000Z'),
            report('Newest A', '2026-10-02T06:00:00.000Z'),
            report('Also never', ''),
        ]);
        assert.deepEqual(sorted.map(({ title }) => title), ['Newest A', 'Newest B', 'Old', 'Also never', 'Never']);
    });

    test('leaves the list it was given as it was', () => {
        const list = [report('B', ''), report('A', '2026-10-02T06:00:00.000Z')];
        sortByLastRun(list);
        assert.deepEqual(list.map(({ title }) => title), ['B', 'A']);
    });
});

describe('paginate', () => {
    const items = Array.from({ length: 45 }, (_, i) => i + 1);

    test('cuts 45 items into pages of 20, 20 and 5', () => {
        assert.deepEqual([0, 1, 2].map((page) => paginate(items, page).items.length), [20, 20, 5]);
        assert.deepEqual(paginate(items, 1), { items: items.slice(20, 40), page: 1, pages: 3, first: 21, last: 40, total: 45 });
    });

    test('a page past either end shows the nearest page there is', () => {
        assert.equal(paginate(items, 9).page, 2);
        assert.equal(paginate(items, -1).page, 0);
        assert.equal(paginate(items.slice(0, 5), 2).page, 0);
    });

    test('an empty list is one empty page', () => {
        assert.deepEqual(paginate([], 0), { items: [], page: 0, pages: 1, first: 1, last: 0, total: 0 });
    });
});

describe('toSummary', () => {
    // Only the fields toSummary reads.
    const listItem = (highlights: ReportListItem['highlights']) => ({
        slug: 'a', title: 'A', description: '', category: 'Operations', status: 'success', schedule: '', lastRun: '',
        recipients: [], history: [], tags: [], owner: '', index: '', highlights,
    }) as unknown as ReportListItem;

    test("the card's headline is the first highlight, without its sparkline", () => {
        const summary = toSummary(listItem([
            { label: 'Results', value: '117', note: '+77 vs. previous run', trend: [40, 38, 117] },
            { label: 'Search time', value: '3s' },
        ]));
        assert.deepEqual(summary.headline, { label: 'Results', value: '117', note: '+77 vs. previous run' });
    });

    test('a report with no results has no headline', () => {
        assert.equal(toSummary(listItem([])).headline, null);
    });

    test("says which run the number is from when it's older than the last run", () => {
        const highlights = [{ label: 'Results', value: '117' }];
        const item = (resultsRunAt: string | null) => ({ ...listItem(highlights), lastRun: '2026-10-02T10:00:00.000Z', resultsRunAt });

        assert.equal(toSummary(item('2026-10-02T09:00:00.000Z')).headline?.from, '2026-10-02T09:00:00.000Z');
        assert.equal(toSummary(item('2026-10-02T10:00:00.000Z')).headline?.from, undefined);
    });
});
