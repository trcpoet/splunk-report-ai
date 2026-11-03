import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileHighlights, compileStatusRule, fill } from '@/reports/cards/rules';
import type { ReportCard } from '@/reports/cards/schema';

// A small results table, as a run of a "web errors" report would give.
const results = {
    columns: ['Host', 'Requests', 'Errors', 'Rate %', 'Minutes silent'],
    rows: [
        ['web-01', 1200, 6, 0.5, 30],
        ['web-02', 800, 40, 5, 300],
        ['web-03', 1000, 30, 3, 125],
    ],
    resultCount: 3,
};
const highlights = (list: NonNullable<ReportCard['highlights']>, table = results) =>
    compileHighlights(list)({ ...table, durationSec: 2 });
const status = (card: Pick<ReportCard, 'warn' | 'fail'>, table = results) => compileStatusRule(card)?.(table) ?? null;

describe('headline numbers', () => {
    test('sum, max, min, average, first and count read the results', () => {
        const shown = highlights([
            { label: 'Total', value: { sum: 'Requests' } },
            { label: 'Most', value: { max: 'Errors' } },
            { label: 'Least', value: { min: 'Errors' } },
            { label: 'Average', value: { average: 'Rate %' }, format: { decimals: 1 } },
            { label: 'First', value: { first: 'Host' } },
            { label: 'Results', value: { count: 'results' } },
        ]);
        assert.deepEqual(shown.map(({ value }) => value), ['3,000', '40', '6', '2.8', 'web-01', '3']);
    });

    test('a ratio as a percentage, with a meter against a limit in the same units', () => {
        const [rate] = highlights([{ label: 'Error rate', value: { ratio: [{ sum: 'Errors' }, { sum: 'Requests' }] }, format: { percent: true, decimals: 2 }, note: 'Budget: 2%', meter: { of: 2 } }]);
        assert.deepEqual(rate, { label: 'Error rate', value: '2.53%', note: 'Budget: 2%', meter: 1.27 });
    });

    test('a ratio by 0 is 0, not infinity', () => {
        const [share] = highlights([{ label: 'Share', value: { ratio: [{ sum: 'Errors' }, 0] } }]);
        assert.equal(share!.value, '0');
    });

    test("the top row is shown by its name, and its note reads that row's values", () => {
        const [worst] = highlights([{ label: 'Worst host', value: { top: 'Host', by: 'Rate %' }, note: '{Rate %|2}% errors, {Requests|number} requests' }]);
        assert.deepEqual(worst, { label: 'Worst host', value: 'web-02', note: '5.00% errors, 800 requests' });
    });

    test('a suffix follows the number as written', () => {
        const [size] = highlights([{ label: 'Ingested', value: { sum: 'Requests' }, format: { decimals: 1, suffix: ' GB' } }]);
        assert.equal(size!.value, '3000.0 GB');
    });

    test('a top row with no rows to choose from is left out', () => {
        assert.deepEqual(highlights([{ label: 'Worst host', value: { top: 'Host', by: 'Rate %' } }], { ...results, rows: [] }), []);
    });
});

describe('warn and fail rules', () => {
    const over = (above: number): Pick<ReportCard, 'warn'> => ({
        warn: { when: { column: 'Rate %', above }, one: '{Host} is at {Rate %}%.', many: '{count} hosts are over: {list}.', item: '{Host} ({Rate %}%)' },
    });

    test('one matching row reads the one message, with its values', () => {
        assert.deepEqual(status(over(4)), { status: 'warning', message: 'web-02 is at 5%.' });
    });

    test('several read the many message, with every row in the list', () => {
        assert.deepEqual(status(over(1)), { status: 'warning', message: '2 hosts are over: web-02 (5%), web-03 (3%).' });
    });

    test('no matching row, or a column the results lack, is no warning', () => {
        assert.equal(status(over(10)), null);
        assert.equal(status({ warn: { when: { column: 'Nope', above: 0 }, one: 'x' } }), null);
    });

    test('below, at least, at most and equals compare as they say', () => {
        const count = (when: NonNullable<ReportCard['warn']>['when']) => status({ warn: { when, one: '1', many: '{count}' } })?.message;
        assert.equal(count({ column: 'Rate %', below: 1 }), '1');
        assert.equal(count({ column: 'Rate %', atLeast: 3 }), '2');
        assert.equal(count({ column: 'Rate %', atMost: 3 }), '2');
        assert.equal(count({ column: 'Host', equals: 'web-03' }), '1');
    });

    test('fail wins over warn', () => {
        const card = { ...over(1), fail: { when: { column: 'Rate %', above: 4 }, one: '{Host} is failing.' } };
        assert.deepEqual(status(card), { status: 'failed', message: 'web-02 is failing.' });
    });

    test('"any results" counts every result, and `row` picks the largest for the message', () => {
        const silent: Pick<ReportCard, 'warn'> = {
            warn: {
                when: { results: { above: 0 } },
                row: { top: 'Minutes silent' },
                one: '{Host} has been silent for over {Minutes silent|hours}.',
                many: '{count|number} hosts are silent, the longest {Host} ({Minutes silent|hours}).',
            },
        };
        assert.equal(status(silent)?.message, '3 hosts are silent, the longest web-02 (5 hours).');
        assert.equal(status(silent, { ...results, rows: results.rows.slice(2), resultCount: 1 })?.message, 'web-03 has been silent for over 2 hours.');
        assert.equal(status(silent, { ...results, rows: [], resultCount: 0 }), null);
    });
});

describe('fill', () => {
    test("an unknown placeholder is left empty rather than showing a column's name", () => {
        assert.equal(fill('{Nope} and {count}', results, results.rows[0], { count: 2 }), ' and 2');
    });
});
