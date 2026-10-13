import { setTimeout as sleep } from 'node:timers/promises';
import { disconnectDB } from '@/lib/mongodb';
import { fixtureTransport } from '@/lib/splunk/fixtures/transport';
import { syncAll } from '@/lib/splunk/sync';
import { httpTransport, type SplunkTransport } from '@/lib/splunk/transport';

// Syncs Splunk scheduled reports into MongoDB. Runs as its own process, not
// inside Next.js, so it runs once per deployment and only it holds the Splunk token.
//
//   npm run sync          sync once, then exit (exit code 1 if any report failed)
//   npm run sync:watch    sync every SYNC_INTERVAL_MINUTES (default 15)
//
// SPLUNK_MODE=fixture (default) serves the dummy reports. SPLUNK_MODE=live calls
// SPLUNK_BASE_URL (the management port, usually 8089) with SPLUNK_TOKEN.

function transportFromEnv(): { mode: 'fixture' | 'live'; transport: SplunkTransport } {
    const mode = process.env.SPLUNK_MODE || 'fixture';

    if (mode === 'fixture') return { mode, transport: fixtureTransport() };
    if (mode !== 'live') throw new Error(`SPLUNK_MODE must be "fixture" or "live", not "${mode}".`);

    const baseUrl = process.env.SPLUNK_BASE_URL;
    const token = process.env.SPLUNK_TOKEN;
    if (!baseUrl || !token) throw new Error('SPLUNK_MODE=live needs SPLUNK_BASE_URL and SPLUNK_TOKEN.');

    return { mode, transport: httpTransport({ baseUrl, token }) };
}

async function main() {
    const { mode, transport } = transportFromEnv();
    const timeZone = process.env.SPLUNK_TZ || 'UTC';

    const syncOnce = async () => {
        const started = Date.now();
        const summary = await syncAll({ transport, mode, timeZone });
        console.log(`Synced ${summary.reports} reports (${mode}): ${summary.newRuns} new runs, ${summary.errors} errors, ${((Date.now() - started) / 1000).toFixed(1)}s.`);
        return summary;
    };

    if (!process.argv.includes('--watch')) {
        const summary = await syncOnce();
        if (summary.errors > 0) process.exitCode = 1;
        return;
    }

    const minutes = Number(process.env.SYNC_INTERVAL_MINUTES) || 15;
    const stop = new AbortController();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop.abort());

    console.log(`Syncing every ${minutes} minutes. Press Ctrl+C to stop.`);
    while (!stop.signal.aborted) {
        try {
            await syncOnce();
        } catch (error) {
            console.error(`Sync failed: ${error instanceof Error ? error.message : error}`);
        }
        await sleep(minutes * 60_000, undefined, { signal: stop.signal }).catch(() => {});
    }
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(disconnectDB);
