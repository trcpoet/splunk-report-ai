// Checks a search with Splunk's own parser (POST /services/search/parser)
// without running it. The Write SPL tab uses it (lib/ai/validate.ts) when the
// web app has a parse-only token: SPLUNK_PARSER_TOKEN, for a role that can't
// read any index. The sync worker's SPLUNK_TOKEN never reaches the web app.
//
// Splunk's community examples call this endpoint with POST; check the method
// against the REST API reference for your Splunk version.

export type SplunkParseResult = { ok: true } | { ok: false; message: string };

type ParseOptions = {
    // The management port, e.g. https://splunk.example.com:8089.
    baseUrl: string;
    token: string;
    query: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
};

type ParserReply = { messages?: { type?: string; text?: string }[] };

// A search Splunk runs starts with a command: a plain base search with "search".
const asSearch = (query: string) => (query.trim().startsWith('|') ? query.trim() : `search ${query.trim()}`);

// Whether Splunk can parse the search, and if not, Splunk's own message. Throws
// when Splunk can't be asked (network, sign-in, a timeout), so the caller can
// fall back to another check.
export async function splunkParse({ baseUrl, token, query, fetchImpl = fetch, timeoutMs = 5_000 }: ParseOptions): Promise<SplunkParseResult> {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/services/search/parser`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        // parse_only: don't expand macros, lookups, tags or subsearches.
        body: new URLSearchParams({ q: asSearch(query), parse_only: 'true', output_mode: 'json' }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return { ok: true };

    if (response.status === 400) {
        const reply = (await response.json().catch(() => null)) as ParserReply | null;
        const problem = reply?.messages?.find(({ type }) => type === 'FATAL' || type === 'ERROR');
        if (problem?.text) return { ok: false, message: problem.text };
    }
    throw new Error(`Splunk's parser answered ${response.status}.`);
}
