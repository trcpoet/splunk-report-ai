import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { columnsUsed } from '@/reports/cards/columns';
import { reportCards } from '@/reports/report-config';
import { fixtureTransport } from '@/splunk/fixtures/transport';
import { findReport, previewReport } from '@/splunk/preview';

const options = { timeZone: 'UTC', syncReports: 'emailed' as const };

describe('card:preview', () => {
    test("finds a report by its Splunk name or its slug, whatever the letters' case", async () => {
        const byName = await findReport(fixtureTransport(), 'web server 5XX error rate', options);
        const bySlug = await findReport(fixtureTransport(), 'web-5xx-error-rate', options);
        assert.equal(byName.report?.meta.slug, 'web-5xx-error-rate');
        assert.equal(bySlug.report?.entry.name, 'Web Server 5xx Error Rate');
    });

    test('lists the reports it knows when the name matches none', async () => {
        const { report, names } = await findReport(fixtureTransport(), 'No such report', options);
        assert.equal(report, undefined);
        assert.ok(names.includes('Web Server 5xx Error Rate'));
    });

    test("shows the newest run's status, headline numbers and chart, as the app will", async () => {
        const { report } = await findReport(fixtureTransport(), 'web-5xx-error-rate', options);
        const preview = await previewReport(fixtureTransport(), report!);

        assert.ok(preview.hasCard);
        assert.equal(preview.run?.status, 'warning');
        assert.equal(preview.derived?.highlights[0]?.label, 'Overall error rate');
        assert.equal(preview.derived.chart?.threshold?.value, 2);
        assert.deepEqual(preview.unknownColumns, []);
    });
});

describe('columnsUsed', () => {
    test('lists every column a card names, in its chart, numbers and rules', () => {
        assert.deepEqual(columnsUsed(reportCards()['Web Server 5xx Error Rate']!).sort(), ['5xx errors', 'Error rate %', 'Host', 'Requests']);
    });

    test('a typo is a column the results lack', () => {
        const card = { ...reportCards()['Web Server 5xx Error Rate']!, warn: { when: { column: 'Error rate%', above: 2 }, one: '{Host}' } };
        const columns = ['Host', 'Requests', '5xx errors', 'Error rate %'];
        assert.deepEqual(columnsUsed(card).filter((column) => !columns.includes(column)), ['Error rate%']);
    });
});
