import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { briefingKey, flagId, reportSummaryKey } from '@/lib/ai/keys';
import { PROMPT_VERSION } from '@/lib/ai/prompts';

const reports = [
    { slug: 'web-5xx-error-rate', lastRun: '2026-10-02T09:00:00.000Z', status: 'warning' as const },
    { slug: 'disk-space-over-85', lastRun: '2026-10-02T09:00:00.000Z', status: 'failed' as const },
];

describe('briefingKey', () => {
    test("doesn't depend on the order the reports come in", () => {
        assert.equal(briefingKey([...reports].reverse()), briefingKey(reports));
    });

    test('changes when a report gets a new run or a new status', () => {
        const before = briefingKey(reports);
        assert.notEqual(briefingKey([{ ...reports[0], lastRun: '2026-10-02T10:00:00.000Z' }, reports[1]]), before);
        assert.notEqual(briefingKey([{ ...reports[0], status: 'success' }, reports[1]]), before);
        assert.match(before, new RegExp(`^briefing:[0-9a-f]{24}:v${PROMPT_VERSION}$`));
    });
});

describe('reportSummaryKey and flagId', () => {
    test('name the report, its run and the prompt version', () => {
        assert.equal(
            reportSummaryKey({ slug: 'web-5xx-error-rate', lastRun: '2026-10-02T09:00:00.000Z', resultsRunAt: '2026-10-02T09:00:00.000Z' }),
            `report:web-5xx-error-rate:2026-10-02T09:00:00.000Z:2026-10-02T09:00:00.000Z:v${PROMPT_VERSION}`,
        );
        assert.equal(flagId('firewall-denied-top-sources', '2026-10-02T12:00:00.000Z', 'unusual'), 'firewall-denied-top-sources:2026-10-02T12:00:00.000Z:unusual');
    });
});
