import { setTimeout as sleep } from 'node:timers/promises';
import { disconnectDB } from '@/database/mongodb';
import { describeError } from '@/splunk/errors';
import { readSyncSettings, transportFor } from '@/splunk/settings';
import { syncAll } from '@/splunk/sync';

// Syncs Splunk scheduled reports into MongoDB. Runs as its own process, not
// inside Next.js, so it runs once per deployment and only it holds the Splunk token.
//
//   npm run sync          sync once, then exit (exit code 1 if any report failed)
//   npm run sync:watch    sync every SYNC_INTERVAL_MINUTES (default 15)
//
// SPLUNK_MODE=fixture (default) serves the dummy reports. SPLUNK_MODE=live calls
// SPLUNK_BASE_URL (the management port, usually 8089) with SPLUNK_TOKEN, or with
// the token in the file SPLUNK_TOKEN_FILE names. The settings are checked
// before anything else (src/splunk/settings.ts), and `npm run splunk:check`
// tests the connection without syncing.

async function main() {
    const settings = readSyncSettings();
    for (const warning of settings.warnings) console.warn(`⚠ ${warning}`);

    const { mode, timeZone, syncReports } = settings;
    const transport = transportFor(settings);

    const syncOnce = async () => {
        const started = Date.now();
        const summary = await syncAll({ transport, mode, timeZone, syncReports });
        console.log(`Synced ${summary.reports} reports (${mode}): ${summary.newRuns} new runs, ${summary.errors} errors, ${((Date.now() - started) / 1000).toFixed(1)}s.`);
        return summary;
    };

    if (!process.argv.includes('--watch')) {
        const summary = await syncOnce();
        if (summary.errors > 0) process.exitCode = 1;
        return;
    }

    const minutes = settings.intervalMinutes;
    const stop = new AbortController();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop.abort());

    console.log(`Syncing every ${minutes} minutes. Press Ctrl+C to stop.`);
    while (!stop.signal.aborted) {
        try {
            await syncOnce();
        } catch (error) {
            console.error(`Sync failed: ${describeError(error)}`);
        }
        await sleep(minutes * 60_000, undefined, { signal: stop.signal }).catch(() => {});
    }
}

main()
    .catch((error: unknown) => {
        console.error(describeError(error));
        process.exitCode = 1;
    })
    .finally(disconnectDB);
