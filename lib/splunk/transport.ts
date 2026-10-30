import { readFileSync } from 'node:fs';

// How the sync worker talks to Splunk. httpTransport calls the REST API on the
// management port (8089); fixtures/transport.ts answers the same paths from the
// dummy reports. Only the worker holds the Splunk token.

export type QueryParams = Record<string, string | number | undefined>;

export interface SplunkTransport {
    get<T>(path: string, params?: QueryParams): Promise<T>;
}

export class SplunkHttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
        this.name = 'SplunkHttpError';
    }
}

export const isNotFound = (error: unknown) => error instanceof SplunkHttpError && error.status === 404;

// The worker's Splunk token: SPLUNK_TOKEN, or else the file SPLUNK_TOKEN_FILE
// names, which is how Docker and Kubernetes hand over a secret.
export function splunkTokenFromEnv(env: Record<string, string | undefined> = process.env): string | undefined {
    if (env.SPLUNK_TOKEN) return env.SPLUNK_TOKEN;
    const file = env.SPLUNK_TOKEN_FILE;
    if (!file) return undefined;

    try {
        return readFileSync(file, 'utf8').trim() || undefined;
    } catch (error) {
        throw new Error(`Can't read SPLUNK_TOKEN_FILE (${file}): ${error instanceof Error ? error.message : error}`);
    }
}

type HttpTransportOptions = {
    // e.g. https://splunk.example.com:8089. For an internal CA, set NODE_EXTRA_CA_CERTS
    // rather than turning off certificate checks.
    baseUrl: string;
    // A Splunk authentication token for a service account.
    token: string;
    timeoutMs?: number;
    retries?: number;
    fetchImpl?: typeof fetch;
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with a little jitter: ~0.5s, 1s, 2s.
const backoff = (attempt: number) => 500 * 2 ** attempt + Math.random() * 250;

const retryAfter = (response: Response) => {
    const seconds = Number(response.headers.get('retry-after'));
    return seconds > 0 ? Math.min(seconds, 60) * 1000 : undefined;
};

export function httpTransport({ baseUrl, token, timeoutMs = 30_000, retries = 3, fetchImpl = fetch }: HttpTransportOptions): SplunkTransport {
    return {
        async get<T>(path: string, params: QueryParams = {}) {
            const url = new URL(baseUrl.replace(/\/$/, '') + path);
            url.searchParams.set('output_mode', 'json');
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) url.searchParams.set(key, String(value));
            }

            for (let attempt = 0; ; attempt++) {
                let response: Response;

                try {
                    response = await fetchImpl(url, {
                        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                        signal: AbortSignal.timeout(timeoutMs),
                    });
                } catch (error) {
                    // Network errors and timeouts.
                    if (attempt < retries) {
                        await sleep(backoff(attempt));
                        continue;
                    }
                    throw error;
                }

                if (response.ok) return (await response.json()) as T;

                if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
                    await response.body?.cancel();
                    await sleep(retryAfter(response) ?? backoff(attempt));
                    continue;
                }

                const body = await response.text().catch(() => '');
                throw new SplunkHttpError(response.status, `GET ${url.pathname} returned ${response.status}: ${body.slice(0, 200)}`);
            }
        },
    };
}
