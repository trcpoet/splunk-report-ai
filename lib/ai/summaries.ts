import 'server-only';
import { AiSummary } from '@/database';
import type { Viewer } from '@/lib/access';
import { aiModel } from '@/lib/ai/config';
import { AiError, streamText } from '@/lib/ai/llm';
import { ndjsonResponse } from '@/lib/ai/stream';
import { jsonError } from '@/lib/ai/turn';
import { countRequest, recordTokens } from '@/lib/ai/usage';
import { getVotes } from '@/lib/feedback';
import connectDB from '@/lib/mongodb';

// Explain summaries and briefings: written once by the AI, saved under a key
// (lib/ai/keys.ts), then shown again to everyone the key applies to. Only
// writing a new one counts toward the daily limit.

type SummaryRequest = {
    request: Request;
    viewer: Viewer;
    key: string;
    kind: 'report' | 'briefing';
    // The prompt plus the report data.
    system: string;
    // What the AI is asked, after the system prompt.
    question: string;
};

// Streams a summary to the page: the saved one at once, or a new one as it's written.
export async function streamSummary({ request, viewer, key, kind, system, question }: SummaryRequest): Promise<Response> {
    await connectDB();
    const [saved, votes] = await Promise.all([AiSummary.findById(key).lean(), getVotes(viewer, 'summary', [key])]);
    const vote = votes[key];

    if (saved) {
        return ndjsonResponse(async (send) => {
            send({ type: 'text', text: saved.text });
            send({ type: 'done', messageId: key, cutOff: false, vote });
        }, () => 'Something went wrong. Try again.');
    }

    const limited = await countRequest(viewer.id);
    if (limited) return jsonError(429, limited);

    return ndjsonResponse(async (send) => {
        const answer = await streamText({ system, turns: [{ role: 'user', text: question }], thinking: 'low', signal: request.signal }, (text) => send({ type: 'text', text }));
        await AiSummary.updateOne({ _id: key }, { $set: { kind, text: answer.text, model: aiModel(), createdAt: new Date() } }, { upsert: true });
        send({ type: 'done', messageId: key, cutOff: answer.cutOff, vote });
        await recordTokens(viewer.id, answer.usage);
    }, (error) => {
        if (error instanceof AiError) return error.message;
        console.error(`AI ${kind} summary failed:`, error);
        return 'Something went wrong while writing the summary. Try again.';
    });
}
