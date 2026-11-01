import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateSpl } from '@/lib/ai/validate';

describe('validateSpl', () => {
    test('accepts ordinary searches, including generating commands and pipes inside quotes', () => {
        assert.deepEqual(validateSpl('index=web sourcetype=access_combined status>=500\n| stats count BY host\n| sort - count'), { ok: true });
        assert.deepEqual(validateSpl('| tstats count WHERE index=web BY host'), { ok: true });
        assert.deepEqual(validateSpl('index=web | rex field=_raw "(?<a>x||y)" | table a'), { ok: true });
        assert.deepEqual(validateSpl('index=web [search index=users | fields user] | stats count BY user'), { ok: true });
    });

    test('names a command Splunk doesn\'t have', () => {
        assert.deepEqual(validateSpl('index=web | statz count'), { ok: false, message: "Unknown search command 'statz'." });
    });

    test('finds quotes, parentheses and brackets that never close', () => {
        assert.deepEqual(validateSpl('index=web "error | stats count'), { ok: false, message: 'Unbalanced quotes.' });
        assert.deepEqual(validateSpl('index=web | eval x=if(a>1, "y", "n" | table x'), { ok: false, message: 'Unbalanced parentheses.' });
        assert.deepEqual(validateSpl('index=web [search index=users | fields user'), { ok: false, message: 'Unbalanced square brackets.' });
    });

    test('finds a pipe with no command after it', () => {
        assert.deepEqual(validateSpl('index=web | | stats count'), { ok: false, message: "Missing a search command after '|'." });
        assert.deepEqual(validateSpl('index=web | stats count |'), { ok: false, message: "Missing a search command after '|'." });
        assert.deepEqual(validateSpl(''), { ok: false, message: 'The search is empty.' });
    });

    test('flags what comes after a pipe when it can\'t be a command', () => {
        assert.deepEqual(validateSpl('index=web | 123abc'), { ok: false, message: "Unknown search command '123abc'." });
    });

    test('leaves macros to Splunk, but notices one that never closes', () => {
        assert.deepEqual(validateSpl('index=web | `my_macro(1, "a)")` | stats count'), { ok: true });
        assert.deepEqual(validateSpl('`web_base(prod|staging)` | stats count BY host'), { ok: true });
        assert.deepEqual(validateSpl('index=web | `my_macro(1) | stats count'), { ok: false, message: 'A macro is missing its closing backtick.' });
    });
});
