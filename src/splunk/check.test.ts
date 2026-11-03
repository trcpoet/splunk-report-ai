import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { allPassed, checkSplunk, type CheckResult } from '@/splunk/check';
import { reports } from '@/splunk/fixtures/reports';
import { fixtureTransport } from '@/splunk/fixtures/transport';
import { SplunkHttpError, SplunkNotJsonError, type SplunkTransport } from '@/splunk/transport';

const options = { where: 'http://localhost:8089', syncReports: 'emailed' as const };
const outcomes = (results: CheckResult[]) => results.map(({ outcome }) => outcome);

// A transport that fails every request the same way.
const failing = (error: Error): SplunkTransport => ({ get: () => Promise.reject(error) });

describe('checkSplunk', () => {
    test('passes every check against the dummy reports', async () => {
        const results = await checkSplunk(fixtureTransport(), options);

        assert.deepEqual(outcomes(results), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
        assert.match(results[5]!.text, /^The 10 cards checked name only columns their reports' results have/);
        assert.match(results[1]!.text, /signed in as splunk-events-sync, with roles splunk_events_reader/);
        assert.match(results[2]!.text, new RegExp(`can see ${reports.length} scheduled searches\\. The sync takes ${reports.length}`));
        assert.match(results[4]!.text, /Read the newest finished run of "[^"]+": \d+ rows, of \d+ results/);
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

    test("warns about cards for reports Splunk doesn't have", async () => {
        const results = await checkSplunk(fixtureTransport(reports.slice(0, 3)), options);
        const warning = results.find(({ outcome }) => outcome === 'warn');

        assert.match(warning!.text, new RegExp(`^${reports.length - 3} of the \\d+ cards in config/report-cards.yaml`));
        assert.ok(allPassed(results));
    });

    test("a web page at the address isn't Splunk's REST API, and says so without blaming the token", async () => {
        const results = await checkSplunk(failing(new SplunkNotJsonError(404, true, 'GET /x answered 404 with a web page.')), options);

        assert.deepEqual(outcomes(results), ['fail']);
        assert.match(results[0]!.text, /^Something answers at http:\/\/localhost:8089, but it isn't Splunk's REST API/);
        assert.match(results[0]!.hint!, /Splunk Web/);
    });

    test('a run that is still going is skipped for the newest finished one, as the sync does', async () => {
        const fixtures = fixtureTransport();
        // Splunk's history lists a newer run of every report, still running;
        // reading its results would get an empty reply.
        const running: SplunkTransport = {
            get: async <T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> => {
                if (path.endsWith('/history')) {
                    const history = await fixtures.get<{ entry: { name: string; published?: string }[] }>(path, params);
                    return { ...history, entry: [{ name: 'still_running', published: '2099-01-01T00:00:00Z', content: {} }, ...history.entry] } as T;
                }
                if (path.endsWith('/jobs/still_running')) return { entry: [{ name: 'still_running', content: { dispatchState: 'RUNNING', isDone: false } }] } as T;
                if (path.includes('/jobs/still_running/')) throw new SplunkNotJsonError(204, false, 'GET /results answered with something that isn\'t JSON.');
                return fixtures.get<T>(path, params);
            },
        };
        const results = await checkSplunk(running, options);

        assert.ok(allPassed(results));
        assert.ok(results.some(({ text }) => text.startsWith('Read the newest finished run of')));
    });
});
