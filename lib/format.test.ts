import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatClock, parseNumber } from '@/lib/format';

describe('parseNumber', () => {
    test('reads numbers that Splunk sent as formatted text', () => {
        assert.equal(parseNumber(48210), 48210);
        assert.equal(parseNumber('1,126,415'), 1126415);
        assert.equal(parseNumber('$18,402,117'), 18402117);
        assert.equal(parseNumber('1.84%'), 1.84);
        assert.equal(parseNumber('-0.5%'), -0.5);
        assert.equal(parseNumber('0'), 0);
        assert.equal(parseNumber('12G'), 12 * 2 ** 30);
        assert.equal(parseNumber('10 KiB'), 10 * 2 ** 10);
    });

    test('puts sizes with different units in order', () => {
        const sizes = ['12G', '512M', '7.8G', '1.5T'].sort((a, b) => parseNumber(a)! - parseNumber(b)!);
        assert.deepEqual(sizes, ['512M', '7.8G', '12G', '1.5T']);
    });

    test('leaves identifiers, dates and words alone', () => {
        for (const text of ['007', '192.0.2.1', '2026-10-02 05:41', 'web-prod-03', 'Skipped', '', '1,23', '4h 18m']) {
            assert.equal(parseNumber(text), null, text);
        }
    });
});

describe('formatClock', () => {
    test('shows minutes after midnight as a time of day', () => {
        assert.deepEqual([0, 75, 480, 1435, 1440].map(formatClock), ['00:00', '01:15', '08:00', '23:55', '24:00']);
    });
});
