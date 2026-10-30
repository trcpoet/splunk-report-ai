import { setTimeout as sleep } from 'node:timers/promises';
import type { EventBatch } from '@/lib/splunk/example/events';

// A small client for a test Splunk's REST API, signed in as its admin. Only the
// example's setup and feeder use it (docs/splunk-example.md). The connector
// never does: it reads Splunk with its own read-only token.

export type SplunkReply = { status: number; body: SplunkBody | null };
type SplunkBody = {
    entry?: { name: string; content?: Record<string, unknown> }[];
    messages?: { type: string; text: string }[];
};

// How long a request keeps trying while Splunk can't be reached, as when it restarts.
const UNREACHABLE_FOR_MS = 2 * 60_000;

export function splunkAdmin({ baseUrl, username, password }: { baseUrl: string; username: string; password: string }) {
    const root = baseUrl.replace(/\/$/, '');
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    async function request(method: 'GET' | 'POST', path: string, { query = {}, form, text }: { query?: Record<string, string>; form?: Record<string, string>; text?: string } = {}): Promise<SplunkReply> {
        const url = new URL(root + path);
        url.searchParams.set('output_mode', 'json');
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

        const deadline = Date.now() + UNREACHABLE_FOR_MS;
        let response: Response;
        for (;;) {
            try {
                response = await fetch(url, {
                    method,
                    headers: { Authorization: authorization },
                    body: form ? new URLSearchParams(form) : text,
                    signal: AbortSignal.timeout(120_000),
                });
                break;
            } catch (error) {
                if (Date.now() > deadline) throw new Error(`Can't reach Splunk at ${root}: ${error instanceof Error ? error.message : error}`);
                await sleep(5_000);
            }
        }
        const raw = await response.text();
        let body: SplunkBody | null = null;
        try {
            body = raw ? (JSON.parse(raw) as SplunkBody) : null;
        } catch {
            body = { messages: [{ type: 'ERROR', text: raw.slice(0, 200) }] };
        }
        return { status: response.status, body };
    }

    return {
        get: (path: string, query?: Record<string, string>) => request('GET', path, { query }),
        post: (path: string, form: Record<string, string>) => request('POST', path, { form }),
        // Raw log lines, the way a server would send them. Splunk splits them into
        // events and reads each one's time from the line.
        async sendEvents({ index, sourcetype, host, source, lines }: EventBatch) {
            const reply = await request('POST', '/services/receivers/simple', { query: { index, sourcetype, host, source }, text: lines.join('\n') });
            expectOk(reply, `Sending ${sourcetype} logs from ${host}`);
        },
    };
}

export type SplunkAdmin = ReturnType<typeof splunkAdmin>;

export function adminFromEnv(env: Record<string, string | undefined> = process.env): SplunkAdmin {
    const password = env.SPLUNK_ADMIN_PASSWORD;
    if (!password) throw new Error("Set SPLUNK_ADMIN_PASSWORD to the test Splunk's admin password.");
    return splunkAdmin({ baseUrl: env.SPLUNK_ADMIN_URL || 'http://localhost:8089', username: env.SPLUNK_ADMIN_USER || 'admin', password });
}

// Throws with Splunk's own message unless the reply is a success.
export function expectOk(reply: SplunkReply, what: string): SplunkReply {
    if (reply.status >= 200 && reply.status < 300) return reply;
    const message = reply.body?.messages?.map(({ text }) => text).join(' ') || 'no message';
    throw new Error(`${what} failed: Splunk answered ${reply.status} (${message}).`);
}

// Whether a create call failed only because the thing exists already.
export const alreadyThere = (reply: SplunkReply) =>
    reply.status === 409 || (reply.status === 400 && /already exists/i.test(reply.body?.messages?.map(({ text }) => text).join(' ') ?? ''));

// Splunk takes a minute or two to start. Waits until it answers its admin.
export async function waitForSplunk(admin: SplunkAdmin, timeoutMs = 10 * 60_000) {
    const deadline = Date.now() + timeoutMs;
    let said = 0;
    for (;;) {
        const reply = await admin.get('/services/server/info').catch(() => null);
        if (reply?.status === 200) return;
        if (reply?.status === 401) throw new Error('Splunk refused the admin password (SPLUNK_ADMIN_PASSWORD).');
        if (Date.now() > deadline) throw new Error(`Splunk didn't answer within ${timeoutMs / 60_000} minutes.`);
        if (Date.now() - said > 60_000) {
            console.log('Waiting for Splunk to start…');
            said = Date.now();
        }
        await sleep(5_000);
    }
}
