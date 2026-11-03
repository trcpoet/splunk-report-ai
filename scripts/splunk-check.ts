import { allPassed, checkSplunk } from '@/splunk/check';
import { describeError } from '@/splunk/errors';
import { readSyncSettings, transportFor } from '@/splunk/settings';

// npm run splunk:check: tests the connection to Splunk with the sync worker's
// own settings (SPLUNK_MODE, SPLUNK_BASE_URL, the token, SYNC_REPORTS), one
// step at a time, and says what to fix. It only reads; `npm run sync` copies
// the reports afterwards. Exit code 1 if a check failed.

const MARKS = { pass: '✓', warn: '⚠', fail: '✗' } as const;

async function main() {
    const settings = readSyncSettings();
    const where = settings.mode === 'live' ? settings.baseUrl : 'the dummy-data stand-in (SPLUNK_MODE=fixture)';
    console.log(`Checking ${where}\n`);
    for (const warning of settings.warnings) console.log(`⚠ ${warning}`);

    const results = await checkSplunk(transportFor(settings), { where, syncReports: settings.syncReports });
    for (const { outcome, text, hint } of results) {
        console.log(`${MARKS[outcome]} ${text}`);
        if (hint) console.log(`  → ${hint}`);
    }

    if (allPassed(results)) {
        console.log('\nAll checks passed. Next: npm run sync');
    } else {
        console.log('\nFix what is marked ✗, then run npm run splunk:check again.');
        process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    console.error(describeError(error));
    process.exitCode = 1;
});
