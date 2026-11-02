import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { columnLabel, formatCell, formatClock, formatList, parseNumber, timeAxisLabels } from '@/lib/format';

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

describe('formatList', () => {
    test('joins names the way the report page does', () => {
        assert.equal(formatList(['Disk']), 'Disk');
        assert.equal(formatList(['Disk', 'Web']), 'Disk and Web');
        assert.equal(formatList(['Disk', 'Web', 'VPN']), 'Disk, Web, and VPN');
    });
});

describe('formatCell', () => {
    test('shows numbers with separators and leaves text alone', () => {
        assert.equal(formatCell(48210), '48,210');
        assert.equal(formatCell('web-prod-01'), 'web-prod-01');
    });

    test('shows Splunk times in UTC, whatever offset they came with', () => {
        assert.equal(formatCell('2026-10-02T06:00:00.000+00:00'), 'Oct 2, 06:00 UTC');
        assert.equal(formatCell('2026-10-02T02:00:00.000-04:00'), 'Oct 2, 06:00 UTC');
        assert.equal(formatCell('2026-10-02T06:00:00Z'), 'Oct 2, 06:00 UTC');
    });

    test('leaves other dates as written', () => {
        assert.equal(formatCell('2026-10-02 06:14'), '2026-10-02 06:14');
    });
});

describe('columnLabel', () => {
    test('names _time, and leaves the others alone', () => {
        assert.equal(columnLabel('_time'), 'Time');
        assert.equal(columnLabel('Error rate %'), 'Error rate %');
    });
});

describe('timeAxisLabels', () => {
    test('uses the time of day within a day', () => {
        assert.deepEqual(timeAxisLabels(['2026-10-02T05:15:00.000+00:00', '2026-10-02T09:00:00.000+00:00']), ['05:15', '09:00']);
    });

    test('adds the date over a few days, and only the date past that', () => {
        assert.deepEqual(timeAxisLabels(['2026-10-01T06:00:00Z', '2026-10-03T18:00:00Z']), ['Oct 1 06:00', 'Oct 3 18:00']);
        assert.deepEqual(timeAxisLabels(['2026-10-01T06:00:00Z', '2026-10-20T06:00:00Z']), ['Oct 1', 'Oct 20']);
    });
});
