import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { httpTransport, isNotFound, SplunkHttpError, SplunkNotJsonError, splunkTokenFromEnv } from '@/lib/splunk/transport';

describe('splunkTokenFromEnv', () => {
    test('uses SPLUNK_TOKEN when it is set', () => {
        assert.equal(splunkTokenFromEnv({ SPLUNK_TOKEN: 'from-env', SPLUNK_TOKEN_FILE: '/nowhere/token' }), 'from-env');
    });

    test('otherwise reads the file SPLUNK_TOKEN_FILE names, without its trailing newline', () => {
        const file = join(mkdtempSync(join(tmpdir(), 'splunk-token-')), 'token');
        writeFileSync(file, 'from-a-file\n');
        assert.equal(splunkTokenFromEnv({ SPLUNK_TOKEN_FILE: file }), 'from-a-file');
    });

    test('has no token when neither is set', () => {
        assert.equal(splunkTokenFromEnv({}), undefined);
    });

    test("says which file it couldn't read", () => {
        assert.throws(() => splunkTokenFromEnv({ SPLUNK_TOKEN_FILE: '/nowhere/token' }), /Can't read SPLUNK_TOKEN_FILE \(\/nowhere\/token\)/);
    });
});

describe('httpTransport', () => {
    // A transport whose fetch always gives this reply.
    const answering = (body: string, status = 200, type = 'application/json') => httpTransport({
        baseUrl: 'http://splunk.example.com:8089',
        token: 'a-token',
        retries: 0,
        fetchImpl: () => Promise.resolve(new Response(body, { status, headers: { 'content-type': type } })),
    });

    test('reads JSON', async () => {
        assert.deepEqual(await answering('{"entry":[]}').get('/services/apps/local'), { entry: [] });
    });

    test('a web page instead of JSON is Splunk Web or a proxy, whatever its status', async () => {
        const page = '<!doctype html><html><body>Splunk</body></html>';
        for (const status of [200, 404]) {
            await assert.rejects(answering(page, status, 'text/html').get('/services/apps/local'), (error) => error instanceof SplunkNotJsonError && error.html);
        }
    });

    test("a proxy's 404 page keeps its status, so a run's expired results still count as not found", async () => {
        await assert.rejects(
            answering('<html><body>Not found</body></html>', 404, 'text/html').get('/services/search/v2/jobs/x/results'),
            (error) => error instanceof SplunkNotJsonError && isNotFound(error),
        );
    });

    test("an API error stays an HTTP error, so a run's expired results still read as 404", async () => {
        await assert.rejects(
            answering('{"messages":[{"type":"ERROR","text":"Unknown sid."}]}', 404).get('/services/search/v2/jobs/x/results'),
            (error) => error instanceof SplunkHttpError && error.status === 404,
        );
    });
});
