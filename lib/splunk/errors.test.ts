import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { describeError, errorMessage, setupHint } from '@/lib/splunk/errors';
import { SplunkHttpError, SplunkNotJsonError } from '@/lib/splunk/transport';

// fetch fails with "fetch failed", and keeps Node's reason in its cause.
const fetchFailed = (code: string, message = '') =>
    new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) });

describe('errorMessage', () => {
    test('says why fetch failed, such as a certificate it could not verify', () => {
        const error = new TypeError('fetch failed', { cause: new Error('unable to verify the first certificate') });
        assert.equal(errorMessage(error), 'fetch failed: unable to verify the first certificate');
    });

    test('falls back to the code when the cause has no message, as a refused connection does', () => {
        const cause = Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' });
        assert.equal(errorMessage(new TypeError('fetch failed', { cause })), 'fetch failed: ECONNREFUSED');
    });

    test('passes other errors through', () => {
        assert.equal(errorMessage(new Error('GET /x returned 500')), 'GET /x returned 500');
        assert.equal(errorMessage('plain text'), 'plain text');
    });
});

describe('setupHint', () => {
    test('a rejected token says to make a new one', () => {
        assert.match(setupHint(new SplunkHttpError(401, 'GET /x returned 401'))!, /turned the token down/);
    });

    test("a token that can't read something says to share the reports", () => {
        assert.match(setupHint(new SplunkHttpError(403, 'GET /x returned 403'))!, /Share the reports with the account's role/);
    });

    test('a refused connection points at the address and port 8089', () => {
        assert.match(setupHint(fetchFailed('ECONNREFUSED'))!, /management port is usually 8089/);
    });

    test('an unknown host says to check the name', () => {
        assert.match(setupHint(fetchFailed('ENOTFOUND', 'getaddrinfo ENOTFOUND splunk.example.invalid'))!, /can't be found/);
    });

    test("a certificate Node doesn't trust points at NODE_EXTRA_CA_CERTS, never at turning checks off", () => {
        const hint = setupHint(fetchFailed('SELF_SIGNED_CERT_IN_CHAIN', 'self-signed certificate in certificate chain'))!;
        assert.match(hint, /NODE_EXTRA_CA_CERTS/);
        assert.match(hint, /Don't turn certificate checks off/);
    });

    test('a web page instead of JSON means Splunk Web, not the REST API', () => {
        assert.match(setupHint(new SplunkNotJsonError(true, 'GET /x answered with a web page'))!, /Splunk Web \(usually port 8000\), or a proxy/);
    });

    test('says nothing for errors it has no advice for', () => {
        assert.equal(setupHint(new SplunkHttpError(500, 'GET /x returned 500')), null);
        assert.equal(setupHint(new Error('something else')), null);
    });
});

describe('describeError', () => {
    test('puts the hint on its own line after the error', () => {
        assert.equal(
            describeError(fetchFailed('ECONNREFUSED')),
            'fetch failed: ECONNREFUSED\n  → Nothing answered at that address and port. Check SPLUNK_BASE_URL: the management port is usually 8089.',
        );
    });

    test('is just the error when there is no hint', () => {
        assert.equal(describeError(new Error('GET /x returned 500')), 'GET /x returned 500');
    });
});
