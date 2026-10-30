import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { splunkTokenFromEnv } from '@/lib/splunk/transport';

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
