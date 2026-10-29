'use client';

import ChatAnswer, { type ReportChipData } from "@/components/ChatAnswer";
import FeedbackButtons from "@/components/FeedbackButtons";
import { SkeletonParagraph } from "@/components/Skeletons";
import { useSummary } from "@/components/useSummary";

// The briefing's "In short": two or three AI sentences, written once per set
// of reports and run, then shared. The briefing gives this a key that changes
// with the data, so new data asks again.
const BriefingSummary = ({ reports }: { reports: Record<string, ReportChipData> }) => {
    const summary = useSummary('/api/ai/briefing');
    const busy = summary.status === 'loading' || summary.status === 'streaming';

    return (
        <div className="briefing-summary" aria-busy={busy}>
            <h3>In short</h3>
            {summary.status === 'loading' ? (
                <SkeletonParagraph count={2} className="text-[15px]" />
            ) : summary.status === 'failed' && !summary.text ? (
                <p className="answer-note">{summary.error}</p>
            ) : (
                <ChatAnswer text={summary.text} reports={reports} streaming={summary.status === 'streaming'} />
            )}
            {summary.cutOff && <p className="answer-note">This summary was cut off because it got too long.</p>}
            {summary.status === 'done' && summary.id && <FeedbackButtons kind="summary" targetId={summary.id} initial={summary.vote} />}
        </div>
    )
}

export default BriefingSummary
