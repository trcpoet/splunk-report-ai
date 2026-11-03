import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readSyncSettings, SettingsError } from '@/splunk/settings';

const live = { SPLUNK_MODE: 'live', SPLUNK_BASE_URL: 'https://splunk.example.com:8089', SPLUNK_TOKEN: 'a-token' };

// The problems a SettingsError lists, or a failed test if it didn't throw one.
const problems = (env: Record<string, string>) => {
    try {
        readSyncSettings(env);
    } catch (error) {
        if (error instanceof SettingsError) return error.problems;
        throw error;
    }
    assert.fail('expected the settings to be refused');
};

describe('readSyncSettings', () => {
    test('with nothing set: the dummy reports, every 15 minutes, in UTC, emailed searches', () => {
        const settings = readSyncSettings({});
        assert.equal(settings.mode, 'fixture');
        assert.equal(settings.intervalMinutes, 15);
        assert.equal(settings.timeZone, 'UTC');
        assert.equal(settings.syncReports, 'emailed');
        assert.deepEqual(settings.warnings, []);
    });

    test('live mode reads the address and the token', () => {
        const settings = readSyncSettings({ ...live, SYNC_REPORTS: 'configured', SYNC_INTERVAL_MINUTES: '5', SPLUNK_TZ: 'America/New_York' });
        assert.equal(settings.baseUrl, 'https://splunk.example.com:8089');
        assert.equal(settings.token, 'a-token');
        assert.equal(settings.syncReports, 'configured');
        assert.equal(settings.intervalMinutes, 5);
        assert.equal(settings.timeZone, 'America/New_York');
    });

    test('live mode with nothing else lists every missing setting at once', () => {
        const found = problems({ SPLUNK_MODE: 'live' });
        assert.equal(found.length, 2);
        assert.match(found[0]!, /needs SPLUNK_BASE_URL/);
        assert.match(found[1]!, /needs SPLUNK_TOKEN, or SPLUNK_TOKEN_FILE/);
    });

    test('refuses words it does not know, and says which ones it does', () => {
        assert.deepEqual(problems({ SPLUNK_MODE: 'Live' }), ['SPLUNK_MODE must be "fixture" or "live", not "Live".']);
        assert.deepEqual(problems({ SYNC_REPORTS: 'all' }), ['SYNC_REPORTS must be "emailed" or "configured", not "all".']);
    });

    test('refuses an interval that is not a number of minutes above 0 and up to a day', () => {
        // Past a day, Node's timers overflow and fire at once: the sync would never rest.
        for (const value of ['0', '-5', 'ten', '43200', 'Infinity']) {
            assert.match(problems({ SYNC_INTERVAL_MINUTES: value })[0]!, /SYNC_INTERVAL_MINUTES must be a number of minutes above 0 and at most 1440/);
        }
        assert.equal(readSyncSettings({ SYNC_INTERVAL_MINUTES: '1440' }).intervalMinutes, 1440);
    });

    test('refuses a time zone the runtime does not know', () => {
        assert.match(problems({ SPLUNK_TZ: 'Eastern' })[0]!, /SPLUNK_TZ must be a time zone name/);
    });

    test('refuses an address that is not http or https', () => {
        assert.match(problems({ ...live, SPLUNK_BASE_URL: 'splunk.example.com:8089' })[0]!, /must start with https:\/\/ or http:\/\//);
    });

    test("warns, but carries on, when the address is Splunk Web's usual port", () => {
        const settings = readSyncSettings({ ...live, SPLUNK_BASE_URL: 'http://localhost:8000' });
        assert.match(settings.warnings[0]!, /port 8000, which is usually Splunk Web/);
    });

    test("says which token file it couldn't read", () => {
        assert.match(problems({ ...live, SPLUNK_TOKEN: '', SPLUNK_TOKEN_FILE: '/nowhere/token' })[0]!, /Can't read SPLUNK_TOKEN_FILE/);
    });
});
