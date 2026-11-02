import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { needsAttention, syncProblem, type SyncInfo } from '@/lib/reports';

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
