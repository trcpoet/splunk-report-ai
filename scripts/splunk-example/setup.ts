import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { eventsForMinute, type EventBatch } from '@/lib/splunk/example/events';
import { EXAMPLE_INDEXES, exampleSearches } from '@/lib/splunk/example/searches';
import { adminFromEnv, alreadyThere, expectOk, waitForSplunk, type SplunkAdmin } from './admin';

// Sets up a test Splunk for the example (docs/splunk-example.md) through its
// REST API, the way a Splunk admin would for the app:
// 1. indexes for the dummy logs, and the SSH log's user and source fields;
// 2. six scheduled reports (lib/splunk/example/searches.ts);
// 3. a service account that can read them, and a token for the connector;
// 4. the last 24 hours of dummy logs (lib/splunk/example/events.ts).
// It's safe to run again: it updates what's there, makes a new token, and only
// sends the old logs once.
//
//   SPLUNK_ADMIN_URL       the test Splunk's management port (default http://localhost:8089)
//   SPLUNK_ADMIN_PASSWORD  its admin password (required)
//   SPLUNK_EXAMPLE_CRON    when the reports run (default every 5 minutes)
//   SPLUNK_TOKEN_FILE      where the connector's token goes (default .splunk-example/token)

// The Splunk app the reports live in, and who the connector reads them as.
const APP = 'search';
const ROLE = 'splunk_events_reader';
const SERVICE_ACCOUNT = 'splunk-events-sync';

const MINUTE = 60_000;
const BACKFILL_HOURS = 24;
const LINES_PER_REQUEST = 5_000;

async function createIndexes(admin: SplunkAdmin) {
    for (const name of EXAMPLE_INDEXES) {
        const reply = await admin.post('/services/data/indexes', { name });
        if (!alreadyThere(reply)) expectOk(reply, `Creating the ${name} index`);
    }
}

// The SSH log's user and source IP, which Splunk doesn't pick out by itself.
async function addSshFields(admin: SplunkAdmin) {
    const props = `/servicesNS/nobody/${APP}/configs/conf-props`;
    const settings = { 'EXTRACT-splunk_events_ssh': 'Failed password for (?:invalid user )?(?<user>\\S+) from (?<src_ip>\\S+)' };
    const created = await admin.post(props, { name: 'linux_secure', ...settings });
    if (alreadyThere(created)) expectOk(await admin.post(`${props}/linux_secure`, settings), 'Updating the SSH log fields');
    else expectOk(created, 'Adding the SSH log fields');
}

async function saveReports(admin: SplunkAdmin, cron: string) {
    const searches = `/servicesNS/nobody/${APP}/saved/searches`;
    for (const report of exampleSearches()) {
        const settings = {
            search: report.search,
            description: report.description,
            cron_schedule: cron,
            is_scheduled: '1',
            'dispatch.earliest_time': report.earliest,
            'dispatch.latest_time': report.latest,
            // Each run's results stay for an hour, plenty for the connector to copy them.
            'dispatch.ttl': '3600',
            // The app's groups come from the recipients, as for a real report. No email is sent.
            'action.email': '0',
            'action.email.to': report.recipients.join(','),
            'display.general.type': report.chart ? 'visualizations' : 'statistics',
            'display.visualizations.show': report.chart ? '1' : '0',
            'display.visualizations.type': 'charting',
            'display.visualizations.charting.chart': report.chart ?? 'column',
        };
        const path = `${searches}/${encodeURIComponent(report.name)}`;
        const created = await admin.post(searches, { name: report.name, ...settings });
        if (alreadyThere(created)) expectOk(await admin.post(path, settings), `Updating "${report.name}"`);
        else expectOk(created, `Creating "${report.name}"`);

        // Shared with everyone in the app, so the service account can read it and its runs.
        expectOk(await admin.post(`${path}/acl`, { owner: 'nobody', sharing: 'app', 'perms.read': '*', 'perms.write': 'admin' }), `Sharing "${report.name}"`);
    }
}

// A role that reads what's shared with it, a user with that role, and a token
// for that user: what to ask your Splunk admins for (docs/connecting-live-splunk.md).
async function connectorToken(admin: SplunkAdmin): Promise<string> {
    const role = await admin.post('/services/authorization/roles', { name: ROLE, imported_roles: 'user' });
    if (!alreadyThere(role)) expectOk(role, `Creating the ${ROLE} role`);

    // Nobody signs in as this user, so its password is random and forgotten.
    const user = await admin.post('/services/authentication/users', { name: SERVICE_ACCOUNT, password: randomBytes(24).toString('base64url'), roles: ROLE });
    if (!alreadyThere(user)) expectOk(user, `Creating the ${SERVICE_ACCOUNT} user`);

    expectOk(await admin.post('/services/admin/token-auth/tokens_auth', { disabled: 'false' }), 'Turning on token authentication');
    const reply = expectOk(
        await admin.post('/services/authorization/tokens', { name: SERVICE_ACCOUNT, audience: 'SplunkEvents example connector', expires_on: '+30d' }),
        'Creating the connector token',
    );
    const token = reply.body?.entry?.[0]?.content?.token;
    if (typeof token !== 'string' || !token) throw new Error("Splunk made the token but didn't send it back.");
    return token;
}

// The last day of dummy logs, unless an earlier run already sent them. It ends
// where the current minute starts, which the feeder sends.
async function backfill(admin: SplunkAdmin) {
    const web = await admin.get('/services/data/indexes/web');
    const already = Number(web.body?.entry?.[0]?.content?.totalEventCount ?? 0);
    if (already > 0) {
        console.log(`The indexes already hold logs (${already.toLocaleString('en-US')} web requests), so no old logs are sent.`);
        return;
    }

    const now = Date.now();
    const end = Math.floor(now / MINUTE) * MINUTE;
    const streams = new Map<string, EventBatch>();
    for (let minute = end - BACKFILL_HOURS * 60 * MINUTE; minute < end; minute += MINUTE) {
        for (const batch of eventsForMinute(new Date(minute), { live: false, now })) {
            const key = `${batch.index}|${batch.sourcetype}|${batch.host}`;
            const stream = streams.get(key) ?? { ...batch, lines: [] };
            stream.lines.push(...batch.lines);
            streams.set(key, stream);
        }
    }

    let sent = 0;
    for (const stream of streams.values()) {
        for (let i = 0; i < stream.lines.length; i += LINES_PER_REQUEST) {
            await admin.sendEvents({ ...stream, lines: stream.lines.slice(i, i + LINES_PER_REQUEST) });
        }
        sent += stream.lines.length;
    }
    console.log(`Sent ${sent.toLocaleString('en-US')} log lines from the last ${BACKFILL_HOURS} hours.`);
}

async function main() {
    const admin = adminFromEnv();
    const cron = process.env.SPLUNK_EXAMPLE_CRON || '*/5 * * * *';
    const tokenFile = process.env.SPLUNK_TOKEN_FILE || '.splunk-example/token';

    await waitForSplunk(admin);

    await createIndexes(admin);
    await addSshFields(admin);
    console.log(`Indexes ready: ${EXAMPLE_INDEXES.join(', ')}.`);

    await saveReports(admin, cron);
    console.log(`Scheduled ${exampleSearches().length} reports to run at "${cron}".`);

    const token = await connectorToken(admin);
    mkdirSync(dirname(tokenFile), { recursive: true });
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    console.log(`Created the ${SERVICE_ACCOUNT} service account, and wrote its token to ${tokenFile}.`);

    await backfill(admin);
    console.log('Done. Splunk runs the reports on schedule, and the connector copies each run into MongoDB.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
