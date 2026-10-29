import 'server-only';
import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponseUsageMetadata } from '@google/genai';
import { z } from 'zod';
import { aiModel } from '@/lib/ai/config';

// The only file that talks to the AI provider (Google Gemini). The rest of the
// app passes plain text in and gets plain text, or checked JSON, back. To use
// another provider, such as a company's own LLM, rewrite this file.
//
// AI_PROVIDER=fake answers with canned text instead, for trying the pages and
// for automated checks without an API key.

export type Turn = { role: 'user' | 'assistant'; text: string };

export type AskOptions = {
    // The instructions and the reports. Keep it the same for every question in
    // a chat: Gemini caches a prompt's start, so follow-ups cost less.
    system: string;
    // The conversation so far, ending with the new question.
    turns: Turn[];
    // How much the model thinks before answering. More is slower and costs more.
    thinking: 'low' | 'medium';
    // Fires when the person presses Stop. It only stops the app reading:
    // Gemini still finishes the answer, and bills for it.
    signal?: AbortSignal;
};

export type Usage = { inputTokens: number; outputTokens: number; cachedTokens: number };

// Why an answer failed, with a message the page can show as it is.
export class AiError extends Error {
    constructor(readonly kind: 'busy' | 'blocked' | 'key' | 'unavailable' | 'invalid' | 'stopped', message: string) {
        super(message);
        this.name = 'AiError';
    }
}

// Caps each answer, and with it what one question can cost. Thinking counts too.
const MAX_OUTPUT_TOKENS = 8192;

const THINKING_LEVELS = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM } as const;

// Finish reasons that mean Google's filters stopped the answer.
const BLOCKED = new Set<FinishReason | undefined>([
    FinishReason.SAFETY,
    FinishReason.PROHIBITED_CONTENT,
    FinishReason.BLOCKLIST,
    FinishReason.SPII,
    FinishReason.RECITATION,
]);

const blocked = () => new AiError('blocked', "Google's safety filters stopped this answer. Try asking in another way.");

let client: GoogleGenAI | undefined;

// Made on first use, so building the app (and CI) needs no key.
const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

// Gemini calls the assistant "model". Earlier answers go back as text only:
// the app doesn't store Gemini's thought signatures, which Google requires
// only for function calling, and this app calls no functions.
const toContents = (turns: Turn[]): Content[] =>
    turns.map(({ role, text }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text }] }));

const toUsage = (usage?: GenerateContentResponseUsageMetadata): Usage => ({
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    cachedTokens: usage?.cachedContentTokenCount ?? 0,
});

function toAiError(error: unknown, signal?: AbortSignal): AiError {
    if (error instanceof AiError) return error;
    if (signal?.aborted) return new AiError('stopped', 'Stopped.');

    if (error instanceof ApiError) {
        if (error.status === 429) return new AiError('busy', 'Gemini is busy, or this API key has used up its limit for now. Try again in a minute.');
        if (error.status === 401 || error.status === 403) return new AiError('key', 'Gemini rejected the API key. Check GEMINI_API_KEY.');
        if (error.status === 404) return new AiError('unavailable', `Gemini doesn't offer the model "${aiModel()}". Check AI_MODEL.`);
        if (error.status === 400) return new AiError('invalid', `Gemini couldn't use this request (${error.message.slice(0, 160)}).`);
        return new AiError('unavailable', 'Gemini is unavailable right now. Try again in a minute.');
    }
    return new AiError('unavailable', "Couldn't reach Gemini. Check the network and try again.");
}

const settings = ({ system, thinking, signal }: AskOptions) => ({
    systemInstruction: system,
    thinkingConfig: { thinkingLevel: THINKING_LEVELS[thinking] },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: signal,
});

// Streams an answer: onText gets each piece as it arrives. Resolves with the
// whole answer once it's complete. cutOff means it hit MAX_OUTPUT_TOKENS.
export async function streamText(options: AskOptions, onText: (text: string) => void): Promise<{ text: string; usage: Usage; cutOff: boolean }> {
    if (process.env.AI_PROVIDER === 'fake') return fakeStream(options, onText);

    let text = '';
    let finish: FinishReason | undefined;
    let usage: GenerateContentResponseUsageMetadata | undefined;

    try {
        const stream = await gemini().models.generateContentStream({
            model: aiModel(),
            contents: toContents(options.turns),
            config: settings(options),
        });

        for await (const chunk of stream) {
            if (chunk.promptFeedback?.blockReason) throw blocked();

            const piece = chunk.text;
            if (piece) {
                text += piece;
                onText(piece);
            }
            finish = chunk.candidates?.[0]?.finishReason ?? finish;
            usage = chunk.usageMetadata ?? usage;
        }
    } catch (error) {
        throw toAiError(error, options.signal);
    }

    if (BLOCKED.has(finish)) throw blocked();
    if (!text) throw new AiError('unavailable', 'Gemini sent an empty answer. Try asking again.');

    return { text, usage: toUsage(usage), cutOff: finish === FinishReason.MAX_TOKENS };
}

// Asks for an answer in the shape of `schema` (sent to Gemini as a JSON
// Schema) and checks it against the schema before returning it.
export async function generateJson<T>(options: AskOptions & { schema: z.ZodType<T> }): Promise<{ value: T; usage: Usage }> {
    if (process.env.AI_PROVIDER === 'fake') return fakeJson(options);

    const jsonSchema: Record<string, unknown> = z.toJSONSchema(options.schema);
    delete jsonSchema.$schema;

    let response;
    try {
        response = await gemini().models.generateContent({
            model: aiModel(),
            contents: toContents(options.turns),
            config: { ...settings(options), responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
        });
    } catch (error) {
        throw toAiError(error, options.signal);
    }

    if (response.promptFeedback?.blockReason || BLOCKED.has(response.candidates?.[0]?.finishReason)) throw blocked();

    let json: unknown;
    try {
        json = JSON.parse(response.text ?? '');
    } catch {
        json = undefined;
    }
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) throw new AiError('invalid', "Gemini's answer wasn't in the expected shape. Try asking again.");

    return { value: parsed.data, usage: toUsage(response.usageMetadata) };
}

// ---------------------------------------------------------------------------
// AI_PROVIDER=fake: canned answers that say they're canned. They follow the
// dummy-data rules (example.com, documentation IP ranges).

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

async function fakeStream(options: AskOptions, onText: (text: string) => void) {
    const question = options.turns.at(-1)?.text ?? '';
    const ids = [...options.system.matchAll(/<report id="([a-z0-9-]+)">/g)].map(([, id]) => id).slice(0, 2);
    const text = [
        '**Test mode:** this answer is canned, not written by an AI. Add a GEMINI_API_KEY and remove AI_PROVIDER=fake for real answers.',
        '',
        `You asked: "${question.slice(0, 200)}"`,
        '',
        ...(ids.length > 0 ? [`A real answer names the reports it uses, such as ${ids.map((id) => `[[${id}]]`).join(' and ')}, and quotes their numbers:`, ''] : []),
        '- the latest status, and what changed since the previous run',
        '- the rows behind it, such as the busiest host or account',
    ].join('\n');

    for (const word of text.split(/(?<= )/)) {
        if (options.signal?.aborted) throw new AiError('stopped', 'Stopped.');
        onText(word);
        await sleep(20);
    }
    return { text, usage: NO_USAGE, cutOff: false };
}

const FAKE_SEARCH = {
    summary: 'Test mode: a canned search, not written by an AI. It counts failed sign-ins per account and source address.',
    steps: [
        { code: 'index=wineventlog EventCode=4625', explanation: 'Starts from failed Windows sign-ins (event 4625).' },
        { code: 'stats count AS failures BY user, src_ip', explanation: 'Counts the failures for each account and source address.' },
        { code: 'where failures >= 10', explanation: 'Keeps the pairs with 10 or more failures.' },
        { code: 'sort - failures', explanation: 'Puts the most failures first.' },
        { code: 'rename user AS "User", src_ip AS "Source IP", failures AS "Failed logins"', explanation: 'Gives the columns readable names.' },
    ],
    timeRange: 'Last 24 hours',
    fields: ['EventCode', 'user', 'src_ip'],
    assumptions: ['The source address is in the src_ip field.'],
    followUps: ['Only the last hour', 'Group by host instead', 'Add the time of the last attempt'],
};

async function fakeJson<T>(options: AskOptions & { schema: z.ZodType<T> }) {
    await sleep(600, undefined, { signal: options.signal }).catch(() => {
        throw new AiError('stopped', 'Stopped.');
    });

    // Asking for a lookup shows the warning for searches that write data.
    const question = options.turns.at(-1)?.text ?? '';
    const answer = /lookup/i.test(question)
        ? { ...FAKE_SEARCH, steps: [...FAKE_SEARCH.steps, { code: 'outputlookup failed_logins.csv', explanation: 'Saves the results to a lookup file.' }] }
        : FAKE_SEARCH;

    return { value: options.schema.parse(answer), usage: NO_USAGE };
}
