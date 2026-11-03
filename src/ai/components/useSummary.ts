'use client';

import { useEffect, useState } from "react";
import { readEvents } from "@/ai/stream";
import { replyError } from "@/shared/api-reply";

type Summary = {
    status: 'loading' | 'streaming' | 'done' | 'failed';
    text: string;
    // The summary's key, for its 👍 / 👎, once it's complete and saved.
    id?: string;
    vote?: 'up' | 'down';
    cutOff?: boolean;
    error?: string;
};

// Asks a summary endpoint (Explain, or the briefing) and follows its stream.
// A saved summary arrives at once; a new one streams in as it's written.
export function useSummary(url: string): Summary {
    const [summary, setSummary] = useState<Summary>({ status: 'loading', text: '' });

    useEffect(() => {
        const controller = new AbortController();
        let text = '';

        const follow = async () => {
            try {
                const response = await fetch(url, { method: 'POST', signal: controller.signal });
                if (!response.ok || !response.body) {
                    setSummary({ status: 'failed', text: '', error: (await replyError(response)) ?? "Couldn't get a summary. Try again later." });
                    return;
                }

                // Set inside the callback, so it's an object: TypeScript can't see that change.
                const stream = { finished: false };
                await readEvents(response.body, (event) => {
                    if (event.type === 'text') {
                        text += event.text;
                        setSummary({ status: 'streaming', text });
                    } else if (event.type === 'done') {
                        stream.finished = true;
                        // A cut-off summary isn't saved, so there's nothing to vote on.
                        setSummary({ status: 'done', text, id: event.cutOff ? undefined : event.messageId, vote: event.vote, cutOff: event.cutOff });
                    } else if (event.type === 'error') {
                        stream.finished = true;
                        setSummary({ status: 'failed', text, error: event.message });
                    }
                });
                if (!stream.finished && !controller.signal.aborted) {
                    setSummary({ status: 'failed', text, error: 'The summary stopped before it finished. Try again later.' });
                }
            } catch {
                if (!controller.signal.aborted) setSummary({ status: 'failed', text, error: "Couldn't reach the app. Check your connection." });
            }
        };
        void follow();

        return () => controller.abort();
    }, [url]);

    return summary;
}
