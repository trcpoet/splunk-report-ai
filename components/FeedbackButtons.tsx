'use client';

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { voteAction } from "@/app/ai/actions";
import { track } from "@/lib/analytics";

type Props = {
    kind: 'answer' | 'summary' | 'flag';
    targetId: string;
    initial?: 'up' | 'down';
    // Shown next to the thumbs (unless compact) and read out with them.
    question?: string;
    compact?: boolean;
    // Tooltips for the two thumbs, such as under answers.
    tips?: { up: string; down: string };
};

// 👍 / 👎. Pressing the same thumb again takes the vote back. The vote shows at
// once and is saved in the background; if saving fails, it goes back. The
// server works out what the vote is about from targetId (lib/feedback.ts).
const FeedbackButtons = ({ kind, targetId, initial, question = 'Was this helpful?', compact = false, tips }: Props) => {
    const [vote, setVote] = useState<'up' | 'down' | null>(initial ?? null);
    const [failed, setFailed] = useState(false);
    const [, startTransition] = useTransition();

    const cast = (value: 'up' | 'down') => {
        const previous = vote;
        const next = vote === value ? null : value;
        setVote(next);
        setFailed(false);

        startTransition(async () => {
            // A failed request counts as not saved, rather than breaking the page.
            const result = await voteAction({ kind, targetId, value: next }).catch(() => null);
            if (result?.ok) {
                track('ai_vote', { kind, value: next });
            } else {
                setVote(previous);
                setFailed(true);
            }
        });
    };

    return (
        <div className={compact ? 'feedback compact' : 'feedback'} role="group" aria-label={question}>
            {!compact && <span>{question}</span>}
            <button type="button" aria-pressed={vote === 'up'} aria-label={`${question} Yes`} data-tip={tips?.up} onClick={() => cast('up')}>
                <ThumbsUp aria-hidden="true" />
            </button>
            <button type="button" aria-pressed={vote === 'down'} aria-label={`${question} No`} data-tip={tips?.down} onClick={() => cast('down')}>
                <ThumbsDown aria-hidden="true" />
            </button>
            {failed && <span className="feedback-error" role="alert">Not saved. Try again.</span>}
        </div>
    )
}

export default FeedbackButtons
