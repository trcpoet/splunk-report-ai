import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { describeColumn, findUnusualRun, median, profileResults, robustScore, unusualTrend } from '@/lib/insights';
import type { RunRecord } from '@/lib/reports';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

const run = (resultCount: number, durationSec = 10, status: RunRecord['status'] = 'success', hour = 0): RunRecord => ({
    runAt: new Date(Date.UTC(2026, 9, 1, hour)).toISOString(),
    status,
    durationSec,
    resultCount,
});

const history = (counts: number[], newest: number, durationSec = 10) =>
    [...counts.map((count, i) => run(count, durationSec, 'success', i)), run(newest, durationSec, 'success', counts.length)];

// As the sync stores a fixture: the newest run with results carries the report's resultCount.
const synced = (fixture: (typeof fixtures)[number]) => {
    const withResults = fixture.history.findLastIndex((record) => record.status !== 'failed');
    return fixture.history.map((record, i) => (i === withResults ? { ...record, resultCount: fixture.resultCount } : record));
};

describe('robustScore', () => {
    test('uses the median and the median absolute deviation', () => {
        assert.equal(median([3, 1, 2]), 2);
        assert.equal(median([4, 1, 2, 3]), 2.5);
        // usual 20, MAD 2 → spread max(2.97, 2, 1) = 2.97
        assert.deepEqual(robustScore(32, [18, 20, 22, 20, 24, 16]).usual, 20);
        assert.ok(Math.abs(robustScore(32, [18, 20, 22, 20, 24, 16]).score - 4.05) < 0.01);
    });

    test('a steady history still needs a real change: the spread is at least 10% of usual', () => {
        assert.equal(robustScore(102, [100, 100, 100, 100]).score, 0.2);
    });
});

describe('findUnusualRun', () => {
    test('flags only the failed-logins spike among the demo reports', () => {
        const flagged = fixtures.filter((fixture) => findUnusualRun(synced(fixture)));
        assert.deepEqual(flagged.map(({ slug }) => slug), ['failed-logins-by-user']);
        assert.equal(
            findUnusualRun(synced(flagged[0]))!.message,
            '117 results, about 3.3× the usual 36 (compared with the previous 6 runs).',
        );
    });

    test('says when results drop well below the usual', () => {
        const unusual = findUnusualRun(history([40, 42, 38, 41, 39, 40], 2));
        assert.equal(unusual?.measure, 'results');
        assert.ok(unusual!.score < 0);
        assert.match(unusual!.message, /^2 results, well below the usual 40/);
    });

    test('notices a slow search', () => {
        const runs = [...[60, 62, 58, 61, 59].map((seconds, i) => run(10, seconds, 'success', i)), run(10, 240, 'success', 5)];
        assert.match(findUnusualRun(runs)!.message, /^The search took 4m 0s, about 4× the usual 1m 0s/);
    });

    test('words a first result after runs that had none', () => {
        assert.equal(findUnusualRun(history([0, 0, 0, 0, 0], 5))!.message, '5 results, where the previous 5 runs had none.');
    });

    test('says nothing when the newest run failed, or there are too few runs to compare', () => {
        assert.equal(findUnusualRun([...history([40, 41, 39, 40, 42], 40), run(0, 0, 'failed', 9)]), null);
        assert.equal(findUnusualRun(history([40, 41, 39], 400)), null);
    });

    test('takes a flag from the ML model when the statistics see nothing, with its reason', () => {
        const runs = history([40, 42, 38, 41, 39, 40], 52);
        assert.equal(findUnusualRun(runs), null);

        const modelRun = { score: 0.81, unusual: true, reason: 'Results well above usual: 52 against about 40.', measure: 'results' as const };
        const unusual = findUnusualRun(runs, modelRun)!;
        assert.equal(unusual.flaggedBy, 'model');
        assert.equal(unusual.message, modelRun.reason);
        assert.equal(unusual.measure, 'results');
        assert.equal(unusual.usual, 40);
        assert.equal(unusual.modelScore, 0.81);
    });

    test('keeps its own wording when it flags the run too, and adds the model score', () => {
        const unusual = findUnusualRun(history([40, 41, 39, 40, 42, 41], 120), { score: 0.97, unusual: true, reason: 'Results far above usual.', measure: 'results' })!;
        assert.equal(unusual.flaggedBy, 'statistics');
        assert.equal(unusual.message, '120 results, about 3× the usual 41 (compared with the previous 6 runs).');
        assert.equal(unusual.modelScore, 0.97);
    });

    test("ignores the model's flag on a failed run, or one it can't name a measure for", () => {
        const failed = [...history([40, 41, 39, 40, 42], 41), run(0, 0, 'failed', 9)];
        assert.equal(findUnusualRun(failed, { score: 1, unusual: true, reason: 'The run failed.', measure: null }), null);
        assert.equal(findUnusualRun(history([40, 41, 39, 40, 42], 41), { score: 0.9, unusual: true, reason: 'x', measure: null }), null);
    });

    test('leaves failed runs out of the baseline', () => {
        const runs = [run(40), run(0, 0, 'failed', 1), run(41, 10, 'success', 2), run(39, 10, 'success', 3), run(40, 10, 'success', 4), run(42, 10, 'success', 5), run(41, 10, 'success', 6)];
        assert.equal(findUnusualRun(runs), null);
    });
});

describe('profileResults', () => {
    const failedLogins = fixtures.find(({ slug }) => slug === 'failed-logins-by-user')!;
    const profile = profileResults(failedLogins.columns, failedLogins.rows, failedLogins.resultCount)!;

    test('counts the rows shown against all results', () => {
        assert.equal(profile.rows, 6);
        assert.equal(profile.total, 117);
    });

    test('tells numbers, times and text apart', () => {
        assert.deepEqual(profile.columns.map(({ kind }) => kind), ['text', 'number', 'number', 'time']);
    });

    test('describes each column in a sentence', () => {
        const [user, failures, , last] = profile.columns;
        assert.equal(describeColumn(user, profile.rows), 'A different value in every row.');
        assert.equal(describeColumn(failures, profile.rows), '29 to 312, median 79. Highest: svc_backup.');
        assert.equal(describeColumn(last, profile.rows), '2026-10-02 18:05 to 2026-10-03 05:58.');
    });

    test('reads formatted numbers such as "$1,234" and "1.84%"', () => {
        const formatted = profileResults(['Day', 'Volume', 'Decline rate'], [['Mon', '$1,200', '1.5%'], ['Tue', '$3,400', '2.25%']])!;
        assert.deepEqual(formatted.columns.slice(1).map((column) => column.kind === 'number' && [column.min, column.max]), [[1200, 3400], [1.5, 2.25]]);
    });

    test('names the most common value of a repeating text column, and counts empty cells', () => {
        const repeated = profileResults(['Host', 'Mount'], [['a', '/var'], ['b', '/var'], ['c', '/'], ['d', '']])!;
        assert.equal(describeColumn(repeated.columns[1], 4), '2 different values, mostly /var (2 of 4). 1 empty.');
    });

    test('has nothing to say about a run with no rows, or a column with no values', () => {
        assert.equal(profileResults(['Host', 'Mount'], []), null);
        const blank = profileResults(['Host', 'Mount'], [['a', ''], ['b', '']])!;
        assert.equal(describeColumn(blank.columns[1], 2), 'Empty in every row.');
    });
});

describe('unusualTrend', () => {
    test('draws the measure that stood out, leaving failed runs out', () => {
        const runs = [run(40), run(0, 0, 'failed', 1), run(41, 10, 'success', 2), run(39, 10, 'success', 3), run(40, 10, 'success', 4), run(120, 10, 'success', 5)];
        const trend = unusualTrend(runs, findUnusualRun(runs)!);
        assert.deepEqual(trend.values, [40, 41, 39, 40, 120]);
        assert.equal(trend.label, 'Results in the last 5 runs; the newest stands out against the usual 40.');
    });
});
