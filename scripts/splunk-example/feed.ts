import { setTimeout as sleep } from 'node:timers/promises';
import { eventsForMinute } from '@/lib/splunk/example/events';
import { adminFromEnv, waitForSplunk } from './admin';

// Plays the example's servers (docs/splunk-example.md): just after each minute
// ends, it sends that minute's dummy logs to the test Splunk, so the reports
// always have fresh data. Ctrl+C stops it.
//
//   SPLUNK_ADMIN_URL, SPLUNK_ADMIN_PASSWORD   as for the setup

const MINUTE = 60_000;

async function main() {
    const admin = adminFromEnv();
    await waitForSplunk(admin);

    const stop = new AbortController();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop.abort());
    console.log('Sending each minute of dummy logs to Splunk. Ctrl+C stops.');

    let minute = Math.floor(Date.now() / MINUTE) * MINUTE;
    while (!stop.signal.aborted) {
        // A couple of seconds after the minute ends, so the minute is complete.
        await sleep(Math.max(0, minute + MINUTE + 2_000 - Date.now()), undefined, { signal: stop.signal }).catch(() => {});
        if (stop.signal.aborted) break;

        const when = new Date(minute).toISOString();
        try {
            const batches = eventsForMinute(new Date(minute));
            await Promise.all(batches.map((batch) => admin.sendEvents(batch)));
            if (new Date(minute).getUTCMinutes() % 10 === 0) {
                console.log(`${when}: sent ${batches.reduce((lines, batch) => lines + batch.lines.length, 0)} log lines.`);
            }
        } catch (error) {
            console.error(`Couldn't send the logs for ${when}: ${error instanceof Error ? error.message : error}`);
        }
        minute += MINUTE;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
