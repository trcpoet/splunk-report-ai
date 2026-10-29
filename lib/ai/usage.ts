import 'server-only';
import { AiUsage } from '@/database';
import { dailyLimit, siteDailyLimit } from '@/lib/ai/config';
import type { Usage } from '@/lib/ai/llm';
import connectDB from '@/lib/mongodb';

// Daily limits on AI requests, so a shared demo account (or a stuck script)
// can't run up the bill. Days are UTC.

const today = () => new Date().toISOString().slice(0, 10);

const add = (id: string, amounts: Partial<Record<'requests' | 'inputTokens' | 'outputTokens', number>>) =>
    AiUsage.findOneAndUpdate(
        { _id: id },
        { $inc: amounts, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true },
    ).lean();

// Counts one request for this person, then for the whole site. Returns why it's
// over the limit, or null when it may go ahead. A request counts when it
// starts, so one that fails still uses it up. Someone already over their own
// limit isn't counted for the site, so they can't use up everyone's.
export async function countRequest(userId: string): Promise<string | null> {
    await connectDB();
    const day = today();

    const user = await add(`${userId}:${day}`, { requests: 1 });
    if ((user?.requests ?? 0) > dailyLimit()) {
        return `You've used today's ${dailyLimit()} AI requests. More are available after midnight UTC.`;
    }

    const site = await add(`site:${day}`, { requests: 1 });
    if ((site?.requests ?? 0) > siteDailyLimit()) {
        return 'The AI has answered as many questions as it can for everyone today. It answers again after midnight UTC.';
    }
    return null;
}

// Adds an answer's tokens to today's totals, for a rough idea of the cost.
// Best effort: the answer is already saved, so a failure here is only logged.
export async function recordTokens(userId: string, usage: Usage) {
    if (usage.inputTokens === 0 && usage.outputTokens === 0) return;

    const day = today();
    const tokens = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    try {
        await Promise.all([add(`${userId}:${day}`, tokens), add(`site:${day}`, tokens)]);
    } catch (error) {
        console.error('Could not record AI token usage:', error);
    }
}
