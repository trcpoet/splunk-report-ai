import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { linkReports, mentionedReports, replaceReportMarkers } from '@/lib/ai/report-links';

const visible = new Set(['web-5xx-error-rate', 'disk-space-over-85']);

describe('linkReports', () => {
    test('turns markers for visible reports into links, and drops the others', () => {
        assert.equal(
            linkReports('[[web-5xx-error-rate]] is warning; [[failed-logins-by-user]] is fine.', visible),
            '[](/reports/web-5xx-error-rate) is warning;  is fine.',
        );
    });

    test('holds back half a marker while the answer is still streaming', () => {
        assert.equal(linkReports('See [[web-5', visible, true), 'See ');
        assert.equal(linkReports('See [[web-5xx-error-rate]', visible, true), 'See ');
        assert.equal(linkReports('See [', visible, true), 'See ');
        assert.equal(linkReports('Done.', visible, true), 'Done.');
    });
});

describe('replaceReportMarkers', () => {
    test('replaces every marker with what the function returns', () => {
        assert.equal(replaceReportMarkers('[[a-b]] and [[c]]', (slug) => slug.toUpperCase()), 'A-B and C');
    });
});

describe('mentionedReports', () => {
    test('lists each visible report once, in order', () => {
        assert.deepEqual(
            mentionedReports('[[disk-space-over-85]], [[web-5xx-error-rate]], [[disk-space-over-85]], [[hidden-report]]', visible),
            ['disk-space-over-85', 'web-5xx-error-rate'],
        );
    });
});
