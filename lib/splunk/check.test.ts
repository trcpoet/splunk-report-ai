import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { allPassed, checkSplunk, type CheckResult } from '@/lib/splunk/check';
import { reports } from '@/lib/splunk/fixtures/reports';
import { fixtureTransport } from '@/lib/splunk/fixtures/transport';
import { SplunkHttpError, type SplunkTransport } from '@/lib/splunk/transport';

const options = { where: 'http://localhost:8089', syncReports: 'emailed' as const };
const outcomes = (results: CheckResult[]) => results.map(({ outcome }) => outcome);

// A transport that fails every request the same way.
const failing = (error: Error): SplunkTransport => ({ get: () => Promise.reject(error) });

describe('checkSplunk', () => {
    test('passes every check against the dummy reports', async () => {
        const results = await checkSplunk(fixtureTransport(), options);

        assert.deepEqual(outcomes(results), ['pass', 'pass', 'pass', 'pass', 'pass']);
        assert.match(results[1]!.text, /signed in as splunk-events-sync, with roles splunk_events_reader/);
        assert.match(results[2]!.text, new RegExp(`can see ${reports.length} scheduled searches\\. The sync takes ${reports.length}`));
        assert.match(results[4]!.text, /Read the results of "[^"]+"'s newest run: \d+ rows/);
        assert.ok(allPassed(results));
    });

    test('a token Splunk turns down: Splunk answers, the token fails, with what to do', async () => {
        const results = await checkSplunk(failing(new SplunkHttpError(401, 'GET /x returned 401')), options);

        assert.deepEqual(outcomes(results), ['pass', 'fail']);
        assert.match(results[1]!.hint!, /Make a new token/);
        assert.equal(allPassed(results), false);
    });

    test('nothing answering: one failure, pointing at the address and port', async () => {
        const refused = new TypeError('fetch failed', { cause: Object.assign(new Error(''), { code: 'ECONNREFUSED' }) });
        const results = await checkSplunk(failing(refused), options);

        assert.deepEqual(outcomes(results), ['fail']);
        assert.match(results[0]!.text, /doesn't answer at http:\/\/localhost:8089: fetch failed: ECONNREFUSED/);
        assert.match(results[0]!.hint!, /8089/);
    });

    test('with SYNC_REPORTS=configured and no configured report in Splunk, it fails and says why', async () => {
        const unknown = reports.map((report) => ({ ...report, title: `${report.title} (copy)` }));
        const results = await checkSplunk(fixtureTransport(unknown), { ...options, syncReports: 'configured' });

        assert.equal(results.at(-1)!.outcome, 'fail');
        assert.match(results.at(-1)!.text, /the sync takes none of them \(SYNC_REPORTS=configured\)/);
    });

    test("warns about reports in report-config that Splunk doesn't have", async () => {
        const results = await checkSplunk(fixtureTransport(reports.slice(0, 3)), options);
        const warning = results.find(({ outcome }) => outcome === 'warn');

        assert.match(warning!.text, new RegExp(`^${reports.length - 3} of the \\d+ reports in lib/report-config.ts`));
        assert.ok(allPassed(results));
    });
});
