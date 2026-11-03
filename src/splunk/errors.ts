import { SplunkHttpError, SplunkNotJsonError } from './transport';

// What went wrong talking to Splunk, in words someone setting up the connector
// can act on. Pure, so the worker, `npm run splunk:check` and the tests share it.

// Node's own error code for a failed connection, such as ECONNREFUSED. fetch
// only says "fetch failed"; the code is on its cause.
function errorCode(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    const { cause } = error;
    const code: unknown = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    return typeof code === 'string' ? code : undefined;
}

// The error, with the reason fetch keeps in its cause: "fetch failed: ECONNREFUSED".
export function errorMessage(error: unknown) {
    if (!(error instanceof Error)) return String(error);

    // For a refused connection, Node's cause has a code and an empty message.
    const { cause } = error;
    const reason = cause instanceof Error ? cause.message || errorCode(error) : undefined;
    return reason ? `${error.message}: ${reason}` : error.message;
}

const CERTIFICATE_CODES = new Set([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// What to check for the setup mistakes people make most, or null when the
// error isn't one of them.
export function setupHint(error: unknown): string | null {
    if (error instanceof SplunkNotJsonError) {
        if (!error.html) return "Splunk's answer wasn't JSON. Check that SPLUNK_BASE_URL is the management port, usually 8089.";
        if (error.status >= 500) return `An error page came back (${error.status}): Splunk, or a proxy in front of it, isn't working right now. Try again in a few minutes.`;
        return "That address answered with a web page, not Splunk's REST API: it's Splunk Web (usually port 8000), or a proxy. Use the management port, usually 8089.";
    }

    if (error instanceof SplunkHttpError) {
        if (error.status === 401) return 'Splunk turned the token down: it is wrong, or it has expired. Make a new token for the service account.';
        if (error.status === 403) return "The token works, but its account isn't allowed to read this. Share the reports with the account's role.";
        return null;
    }

    const code = errorCode(error);
    if (!code) return null;
    if (code === 'ECONNREFUSED') return 'Nothing answered at that address and port. Check SPLUNK_BASE_URL: the management port is usually 8089.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return "The host name in SPLUNK_BASE_URL can't be found. Check it for typos.";
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return "Splunk didn't answer in time. A firewall may be in the way of port 8089.";
    if (CERTIFICATE_CODES.has(code)) {
        return "Node doesn't trust Splunk's certificate. Point NODE_EXTRA_CA_CERTS at your company's CA certificate (a PEM file). Don't turn certificate checks off.";
    }
    if (code === 'ERR_SSL_WRONG_VERSION_NUMBER' || code === 'EPROTO') return 'That port speaks plain HTTP: start SPLUNK_BASE_URL with http://, or turn on HTTPS in Splunk.';
    if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return 'Splunk closed the connection. If its management port uses HTTPS, as it does by default, start SPLUNK_BASE_URL with https://.';
    return null;
}

// The error and, when it's a common setup mistake, what to check.
export function describeError(error: unknown) {
    const hint = setupHint(error);
    return hint ? `${errorMessage(error)}\n  → ${hint}` : errorMessage(error);
}
