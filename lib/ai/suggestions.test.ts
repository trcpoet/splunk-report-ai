import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { explainRequest, reportQuestions, splRequests } from '@/lib/ai/suggestions';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

describe('reportQuestions', () => {
    test("starts with the reports that need attention, and offers at most four", () => {
        const questions = reportQuestions(fixtures);
        assert.ok(questions.length <= 4);
        assert.equal(questions[0], 'Why is Web Server 5xx Error Rate warning?');
        assert.equal(questions[1], 'Why is Disk Space Utilization Above 85% failing?');
    });

    test('asks something general when every report is healthy, and nothing without reports', () => {
        const healthy = fixtures.filter((report) => report.status === 'success');
        assert.equal(reportQuestions(healthy)[0], 'Is anything in my reports worth a closer look?');
        assert.deepEqual(reportQuestions([]), []);
    });
});

describe('splRequests', () => {
    test('suggests searches for the indexes the reports use, then explains one of theirs', () => {
        const security = fixtures.filter((report) => report.slug === 'failed-logins-by-user');
        assert.deepEqual(splRequests(security), [
            'Failed logins by source IP in the last 24 hours',
            'Count events by sourcetype in the last hour',
            explainRequest(security[0]),
        ]);
        assert.ok(splRequests(fixtures).length <= 4);
    });
});
