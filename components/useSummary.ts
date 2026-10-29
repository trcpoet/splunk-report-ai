'use client';

import { useEffect, useState } from "react";
import { readEvents } from "@/lib/ai/stream";

export type Summary = {
    status: 'loading' | 'streaming' | 'done' | 'failed';
    text: string;
    // The summary's key, for its 👍 / 👎, once it's complete.
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
                    const body = await response.json().catch(() => null);
                    setSummary({ status: 'failed', text: '', error: body?.message ?? "Couldn't get a summary. Try again later." });
                    return;
                }

                let finished = false;
                await readEvents(response.body, (event) => {
                    if (event.type === 'text') {
                        text += event.text;
                        setSummary({ status: 'streaming', text });
                    } else if (event.type === 'done') {
                        finished = true;
                        setSummary({ status: 'done', text, id: event.messageId, vote: event.vote, cutOff: event.cutOff });
                    } else if (event.type === 'error') {
                        finished = true;
                        setSummary({ status: 'failed', text, error: event.message });
                    }
                });
                if (!finished && !controller.signal.aborted) {
                    setSummary({ status: 'failed', text, error: 'The summary stopped before it finished. Try again later.' });
                }
            } catch {
                if (!controller.signal.aborted) setSummary({ status: 'failed', text, error: "Couldn't reach the app. Check your connection." });
            }
        };
        follow();

        return () => controller.abort();
    }, [url]);

    return summary;
}
