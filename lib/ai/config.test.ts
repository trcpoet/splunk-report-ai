import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aiOffMessage, aiStatus, dailyLimit, DEFAULT_MODEL, siteDailyLimit } from '@/lib/ai/config';

describe('aiStatus', () => {
    test('is off without a key', () => {
        assert.deepEqual(aiStatus('fixture', {}), { enabled: false, reason: 'no-key' });
    });

    test('uses Gemini with the default model when there is a key', () => {
        assert.deepEqual(aiStatus('fixture', { GEMINI_API_KEY: 'k' }), { enabled: true, provider: 'gemini', model: DEFAULT_MODEL });
        assert.equal(DEFAULT_MODEL, 'gemini-3.8-flash');
        assert.deepEqual(aiStatus('fixture', { GEMINI_API_KEY: 'k', AI_MODEL: 'gemini-3.1-flash-lite' }), { enabled: true, provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    });

    test('AI_ENABLED=false turns it off, even with a key', () => {
        assert.deepEqual(aiStatus('fixture', { GEMINI_API_KEY: 'k', AI_ENABLED: 'false' }), { enabled: false, reason: 'turned-off' });
    });

    test('stays off for live Splunk data until AI_ALLOW_LIVE_DATA=true', () => {
        assert.deepEqual(aiStatus('live', { GEMINI_API_KEY: 'k' }), { enabled: false, reason: 'live-data' });
        assert.equal(aiStatus('live', { GEMINI_API_KEY: 'k', AI_ALLOW_LIVE_DATA: 'true' }).enabled, true);
    });

    test('test mode needs no key, and sends nothing anywhere, so live data is fine', () => {
        assert.deepEqual(aiStatus('live', { AI_PROVIDER: 'fake' }), { enabled: true, provider: 'fake', model: 'fake' });
    });
});

describe('aiOffMessage', () => {
    test('tells a developer what to set, and a demo visitor only that it is off', () => {
        assert.match(aiOffMessage('no-key', false), /GEMINI_API_KEY/);
        assert.equal(aiOffMessage('no-key', true), 'AI answers are turned off in this demo.');
    });
});

describe('daily limits', () => {
    test('default to 50 per account and 1,000 for the site, ignoring bad values', () => {
        assert.equal(dailyLimit({}), 50);
        assert.equal(dailyLimit({ AI_DAILY_LIMIT: '20' }), 20);
        assert.equal(dailyLimit({ AI_DAILY_LIMIT: 'lots' }), 50);
        assert.equal(siteDailyLimit({ AI_SITE_DAILY_LIMIT: '-1' }), 1000);
    });
});
