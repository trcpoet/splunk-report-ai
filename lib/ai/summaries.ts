import 'server-only';
import { after } from 'next/server';
import { AiSummary, type Vote } from '@/database';
import type { Viewer } from '@/lib/access';
import { aiModel } from '@/lib/ai/config';
import { AiError, streamText } from '@/lib/ai/llm';
import { ndjsonResponse } from '@/lib/ai/stream';
import { countRequest, recordTokens } from '@/lib/ai/usage';
import { getVotes } from '@/lib/feedback';
import connectDB from '@/lib/mongodb';

// Explain summaries and briefings: written once by the AI, saved under a key
// (lib/ai/keys.ts), then shown again to everyone the key applies to. Only
// writing a new one counts toward the daily limits, once however many people
// are waiting for it.

type SummaryRequest = {
    viewer: Viewer;
    key: string;
    kind: 'report' | 'briefing';
    // The prompt plus the report data. It's only called when a new summary is
    // written, so showing a saved one doesn't load any results.
    system: () => Promise<string>;
    // What the AI is asked, after the system prompt.
    question: string;
};

type Written = { text: string; cutOff: boolean } | { error: string };

// A summary being written: the text so far, the requests following it, and how it ends.
type Writing = {
    text: string;
    followers: Set<(text: string) => void>;
    done: Promise<Written>;
};

// The summaries this server is writing right now, by key. A request for one
// that's already being written follows it instead of paying for another, so
// two people opening the home page at once share one briefing.
const writing = new Map<string, Writing>();

async function write({ viewer, kind, key, system, question }: SummaryRequest, onText: (text: string) => void): Promise<Written> {
    try {
        // The briefing loads by itself with the page, so it counts only for the site.
        const limited = await countRequest(kind === 'briefing' ? null : viewer.id);
        if (limited) return { error: limited };

        // No abort signal: the summary is finished and saved even when the
        // person who asked has left, so the next person gets it at once.
        // (Stopping early would save nothing: Google bills the whole answer.)
        const answer = await streamText({ system: await system(), turns: [{ role: 'user', text: question }], thinking: 'low' }, onText);
        // A cut-off summary isn't saved, so the next request writes a whole one.
        if (!answer.cutOff) {
            await AiSummary.updateOne({ _id: key }, { $set: { kind, text: answer.text, model: aiModel(), createdAt: new Date() } }, { upsert: true });
        }
        await recordTokens(kind === 'briefing' ? null : viewer.id, answer.usage);
        return { text: answer.text, cutOff: answer.cutOff };
    } catch (error) {
        if (error instanceof AiError) return { error: error.message };
        console.error(`AI ${kind} summary failed:`, error);
        return { error: 'Something went wrong while writing the summary. Try again.' };
    } finally {
        writing.delete(key);
    }
}

// Starts writing a summary. It's listed before anything is awaited, so a
// request arriving a moment later follows this one instead of starting another.
function startWriting(summary: SummaryRequest): Writing {
    const followers = new Set<(text: string) => void>();
    const job: Writing = {
        text: '',
        followers,
        done: write(summary, (text) => {
            job.text += text;
            for (const follower of followers) follower(text);
        }),
    };
    writing.set(summary.key, job);
    // Keeps the server working on it after the response has ended.
    after(() => job.done);
    return job;
}

// Sends a summary that's being written: what's there so far, then the rest as it comes.
function follow(job: Writing, key: string, vote: Vote | undefined) {
    return ndjsonResponse(async (send) => {
        const forward = (text: string) => send({ type: 'text', text });
        if (job.text) forward(job.text);
        job.followers.add(forward);
        try {
            const written = await job.done;
            send('error' in written ? { type: 'error', message: written.error } : { type: 'done', messageId: key, cutOff: written.cutOff, vote });
        } finally {
            job.followers.delete(forward);
        }
    }, () => 'Something went wrong while writing the summary. Try again.');
}

// Streams a summary to the page: the saved one at once, or a new one as it's written.
export async function streamSummary(summary: SummaryRequest): Promise<Response> {
    const { viewer, key } = summary;
    await connectDB();
    const [saved, votes] = await Promise.all([AiSummary.findById(key).lean(), getVotes(viewer, 'summary', [key])]);
    const vote = votes[key];

    if (saved) {
        return ndjsonResponse(async (send) => {
            send({ type: 'text', text: saved.text });
            send({ type: 'done', messageId: key, cutOff: false, vote });
        }, () => 'Something went wrong. Try again.');
    }

    return follow(writing.get(key) ?? startWriting(summary), key, vote);
}
