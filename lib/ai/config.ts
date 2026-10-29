// The AI settings, read from the environment (.env.local, or the host's
// settings). Pages and routes ask aiStatus() whether answers are available,
// and why not when they aren't. See docs/ai.md for every setting.

export type AiProvider = 'gemini' | 'fake';

export type AiStatus =
    | { enabled: true; provider: AiProvider; model: string }
    | { enabled: false; reason: 'no-key' | 'turned-off' | 'live-data' };

type Env = Record<string, string | undefined>;

// gemini-3.5-flash is deprecated (Google routes it to 3.6); 3.8 is the current Flash.
export const DEFAULT_MODEL = 'gemini-3.8-flash';

export const aiModel = (env: Env = process.env) => env.AI_MODEL || DEFAULT_MODEL;

// For finding past searches like a Write SPL request (lib/spl-examples.ts).
// gemini-embedding-001 also works; its vectors can't be compared with these,
// which is fine: saved vectors are kept per model.
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';
export const embeddingModel = (env: Env = process.env) => env.AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

// Whether AI answers are on. syncMode is how the reports got into MongoDB:
// with live Splunk data, AI stays off until AI_ALLOW_LIVE_DATA=true, because
// answers send report data to Google.
export function aiStatus(syncMode: 'fixture' | 'live' | undefined, env: Env = process.env): AiStatus {
    if (env.AI_ENABLED === 'false') return { enabled: false, reason: 'turned-off' };

    // Canned answers, for trying the pages and for automated checks without a
    // key. Nothing leaves the app, so live data is fine here.
    if (env.AI_PROVIDER === 'fake') return { enabled: true, provider: 'fake', model: 'fake' };

    if (syncMode === 'live' && env.AI_ALLOW_LIVE_DATA !== 'true') return { enabled: false, reason: 'live-data' };
    if (!env.GEMINI_API_KEY) return { enabled: false, reason: 'no-key' };

    return { enabled: true, provider: 'gemini', model: aiModel(env) };
}

// What the page says when AI is off. The hosted demo doesn't mention setup.
export function aiOffMessage(reason: Extract<AiStatus, { enabled: false }>['reason'], demoMode = process.env.DEMO_MODE === 'true') {
    if (demoMode) return 'AI answers are turned off in this demo.';
    if (reason === 'turned-off') return 'AI answers are turned off (AI_ENABLED=false in .env.local).';
    if (reason === 'live-data') {
        return 'AI answers are off for live Splunk data. Set AI_ALLOW_LIVE_DATA=true once your company has approved sending report data to Gemini.';
    }
    return 'AI answers are off. Add a GEMINI_API_KEY to .env.local to turn them on (see docs/ai.md).';
}

const count = (value: string | undefined, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

// Requests one account may make per day (UTC), and all accounts together.
export const dailyLimit = (env: Env = process.env) => count(env.AI_DAILY_LIMIT, 50);
export const siteDailyLimit = (env: Env = process.env) => count(env.AI_SITE_DAILY_LIMIT, 1000);

// Optional: Splunk Web's address, for "Open in Splunk" links on generated searches.
export const splunkWebUrl = (env: Env = process.env) => env.SPLUNK_WEB_URL || undefined;
