import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { demoParse, validateSpl } from '@/lib/ai/validate';

describe('demoParse', () => {
    test('accepts ordinary searches, including generating commands and pipes inside quotes', () => {
        assert.deepEqual(demoParse('index=web sourcetype=access_combined status>=500\n| stats count BY host\n| sort - count'), { ok: true });
        assert.deepEqual(demoParse('| tstats count WHERE index=web BY host'), { ok: true });
        assert.deepEqual(demoParse('index=web | rex field=_raw "(?<a>x||y)" | table a'), { ok: true });
        assert.deepEqual(demoParse('index=web [search index=users | fields user] | stats count BY user'), { ok: true });
    });

    test('names a command Splunk doesn\'t have', () => {
        assert.deepEqual(demoParse('index=web | statz count'), { ok: false, message: "Unknown search command 'statz'." });
    });

    test('finds quotes, parentheses and brackets that never close', () => {
        assert.deepEqual(demoParse('index=web "error | stats count'), { ok: false, message: 'Unbalanced quotes.' });
        assert.deepEqual(demoParse('index=web | eval x=if(a>1, "y", "n" | table x'), { ok: false, message: 'Unbalanced parentheses.' });
        assert.deepEqual(demoParse('index=web [search index=users | fields user'), { ok: false, message: 'Unbalanced square brackets.' });
    });

    test('finds a pipe with no command after it', () => {
        assert.deepEqual(demoParse('index=web | | stats count'), { ok: false, message: "Missing a search command after '|'." });
        assert.deepEqual(demoParse('index=web | stats count |'), { ok: false, message: "Missing a search command after '|'." });
        assert.deepEqual(demoParse(''), { ok: false, message: 'The search is empty.' });
    });
});

describe('validateSpl', () => {
    const env = { SPLUNK_BASE_URL: 'https://splunk.example.com:8089/', SPLUNK_PARSER_TOKEN: 'parse-only-token' };
    const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

    test('uses the demo parser when the app has no parse-only token', async () => {
        assert.deepEqual(await validateSpl('index=web | statz count', { env: {} }), { ok: false, by: 'demo', message: "Unknown search command 'statz'." });
    });

    test("asks Splunk's parser when it can, with the search and the token", async () => {
        const fetchImpl = mock.fn(reply(200, { commands: [] }));
        assert.deepEqual(await validateSpl('index=web | stats count', { env, fetchImpl: fetchImpl as unknown as typeof fetch }), { ok: true, by: 'splunk' });

        const [url, init] = fetchImpl.mock.calls[0].arguments as unknown as [string, RequestInit];
        assert.equal(url, 'https://splunk.example.com:8089/services/search/parser');
        assert.equal(init.method, 'POST');
        assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer parse-only-token');
        const body = new URLSearchParams(String(init.body));
        assert.equal(body.get('q'), 'search index=web | stats count');
        assert.equal(body.get('parse_only'), 'true');
    });

    test("passes on Splunk's own message when it can't parse the search", async () => {
        const fetchImpl = reply(400, { messages: [{ type: 'FATAL', text: "Unknown search command 'statz'." }] });
        assert.deepEqual(
            await validateSpl('index=web | statz count', { env, fetchImpl: fetchImpl as unknown as typeof fetch }),
            { ok: false, by: 'splunk', message: "Unknown search command 'statz'." },
        );
    });

    test("falls back to the demo parser when Splunk can't be asked", async () => {
        const quiet = mock.method(console, 'error', () => {});
        try {
            const down = async () => { throw new TypeError('fetch failed'); };
            assert.deepEqual(await validateSpl('index=web | stats count', { env, fetchImpl: down as unknown as typeof fetch }), { ok: true, by: 'demo' });
            assert.deepEqual(await validateSpl('index=web | stats count', { env, fetchImpl: reply(401, {}) as unknown as typeof fetch }), { ok: true, by: 'demo' });
        } finally {
            quiet.mock.restore();
        }
    });
});
