import { fixtureTransport } from './fixtures/transport';
import { httpTransport, splunkTokenFromEnv, type SplunkTransport } from './transport';

// The sync worker's settings, read from its environment and checked when it
// starts. A typo stops it at once with every problem listed, instead of
// failing halfway through a sync. docs/configuration.md lists the settings.

// Which scheduled searches become reports:
// - 'emailed' (the default): every one that emails its results, plus the ones
//   in lib/report-config.ts;
// - 'configured': only the ones in lib/report-config.ts, for a Splunk with
//   more emailed searches than the app should show.
export type SyncReports = 'emailed' | 'configured';

export type SyncSettings = {
    mode: 'fixture' | 'live';
    // Live mode only; empty in fixture mode.
    baseUrl: string;
    token: string;
    timeZone: string;
    intervalMinutes: number;
    syncReports: SyncReports;
    // Worth saying, but not wrong enough to stop for.
    warnings: string[];
};

type Env = Record<string, string | undefined>;

const MAX_INTERVAL_MINUTES = 1440;

export class SettingsError extends Error {
    constructor(readonly problems: string[]) {
        super(`The sync worker's settings need fixing:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
        this.name = 'SettingsError';
    }
}

// One of a few allowed words, or the default when it isn't set.
function choice<T extends string>(name: string, value: string | undefined, options: readonly T[], fallback: T, problems: string[]): T {
    if (!value) return fallback;
    const match = options.find((option) => option === value);
    if (match) return match;
    problems.push(`${name} must be ${options.map((option) => `"${option}"`).join(' or ')}, not "${value}".`);
    return fallback;
}

const isTimeZone = (zone: string) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
};

export function readSyncSettings(env: Env = process.env): SyncSettings {
    const problems: string[] = [];
    const warnings: string[] = [];

    const mode = choice('SPLUNK_MODE', env.SPLUNK_MODE, ['fixture', 'live'], 'fixture', problems);
    const syncReports = choice('SYNC_REPORTS', env.SYNC_REPORTS, ['emailed', 'configured'], 'emailed', problems);

    // Up to a day: much longer overflows Node's timers, which then fire at once.
    const intervalMinutes = env.SYNC_INTERVAL_MINUTES ? Number(env.SYNC_INTERVAL_MINUTES) : 15;
    if (!(intervalMinutes > 0 && intervalMinutes <= MAX_INTERVAL_MINUTES)) {
        problems.push(`SYNC_INTERVAL_MINUTES must be a number of minutes above 0 and at most ${MAX_INTERVAL_MINUTES} (a day), not "${env.SYNC_INTERVAL_MINUTES ?? ''}".`);
    }

    const timeZone = env.SPLUNK_TZ || 'UTC';
    if (!isTimeZone(timeZone)) problems.push(`SPLUNK_TZ must be a time zone name such as "UTC" or "America/New_York", not "${timeZone}".`);

    let baseUrl = '';
    let token = '';
    if (mode === 'live') {
        baseUrl = env.SPLUNK_BASE_URL ?? '';
        const url = URL.canParse(baseUrl) ? new URL(baseUrl) : null;
        if (!baseUrl) {
            problems.push('SPLUNK_MODE=live needs SPLUNK_BASE_URL: the management port, such as https://splunk.example.com:8089.');
        } else if (url?.protocol !== 'https:' && url?.protocol !== 'http:') {
            problems.push(`SPLUNK_BASE_URL must start with https:// or http://, not "${baseUrl}".`);
        } else if (url.port === '8000') {
            warnings.push('SPLUNK_BASE_URL uses port 8000, which is usually Splunk Web. The REST API is usually on the management port, 8089.');
        }

        try {
            token = splunkTokenFromEnv(env) ?? '';
            if (!token) problems.push('SPLUNK_MODE=live needs SPLUNK_TOKEN, or SPLUNK_TOKEN_FILE naming a file that holds it.');
        } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error));
        }
    }

    if (problems.length > 0) throw new SettingsError(problems);
    return { mode, baseUrl, token, timeZone, intervalMinutes, syncReports, warnings };
}

// The dummy reports in fixture mode, Splunk's REST API in live mode.
export const transportFor = (settings: SyncSettings): SplunkTransport =>
    settings.mode === 'live' ? httpTransport({ baseUrl: settings.baseUrl, token: settings.token }) : fixtureTransport();
