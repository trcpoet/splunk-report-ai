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

    test('changes when the ML job flags a run, or learns a different tenth of attention', () => {
        const before = briefingKey(reports);
        const flagged = { score: 0.9, unusual: true, reason: 'Results far above usual.', measure: 'results' as const };
        assert.notEqual(briefingKey([{ ...reports[0], modelRun: flagged }, reports[1]]), before);
        assert.equal(briefingKey([{ ...reports[0], modelRun: { ...flagged, unusual: false } }, reports[1]]), before);
        assert.equal(briefingKey([{ ...reports[0], attention: 0.71 }, reports[1]]), briefingKey([{ ...reports[0], attention: 0.69 }, reports[1]]));
        assert.notEqual(briefingKey([{ ...reports[0], attention: 0.71 }, reports[1]]), briefingKey([{ ...reports[0], attention: 0.84 }, reports[1]]));
    });
});

describe('reportSummaryKey and flagId', () => {
    test('name the report, its run and the prompt version', () => {
        assert.equal(
            reportSummaryKey({ slug: 'web-5xx-error-rate', lastRun: '2026-10-02T09:00:00.000Z', resultsRunAt: '2026-10-02T09:00:00.000Z' }),
            `report:web-5xx-error-rate:2026-10-02T09:00:00.000Z:2026-10-02T09:00:00.000Z::v${PROMPT_VERSION}`,
        );
        // The ML job flagging the run asks for a new summary that can mention it.
        assert.equal(
            reportSummaryKey({
                slug: 'web-5xx-error-rate', lastRun: '2026-10-02T09:00:00.000Z', resultsRunAt: '2026-10-02T09:00:00.000Z',
                modelRun: { score: 0.9, unusual: true, reason: 'Results far above usual.', measure: 'results' },
            }),
            `report:web-5xx-error-rate:2026-10-02T09:00:00.000Z:2026-10-02T09:00:00.000Z:model:v${PROMPT_VERSION}`,
        );
        assert.equal(flagId('failed-logins-by-user', '2026-10-03T06:00:00.000Z', 'unusual'), 'failed-logins-by-user:2026-10-03T06:00:00.000Z:unusual');
    });
});
