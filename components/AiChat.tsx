import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Briefing from "@/components/Briefing";
import ChatView from "@/components/ChatView";
import { BriefingSkeleton } from "@/components/Skeletons";
import { aiOffMessage, aiStatus, splunkWebUrl } from "@/lib/ai/config";
import { aboutQuestion, explainRequest, reportQuestions, splRequests } from "@/lib/ai/suggestions";
import { getChat, type ChatKind } from "@/lib/chats";
import { getSyncInfo, getViewer, getVisibleReports } from "@/lib/dal";
import { getVotes } from "@/lib/feedback";
import { savedExampleIds } from "@/lib/spl-examples";
import type { ReportListItem } from "@/lib/reports";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

// The side panel on Ask about reports: the briefing (what needs attention),
// then every report the AI can see, to ask about one.
const ReportsAside = ({ reports }: { reports: ReportListItem[] }) => (
    <aside className="ai-side" aria-label="Your reports right now">
        <Suspense fallback={<BriefingSkeleton variant="side" />}>
            <Briefing variant="side" />
        </Suspense>
        <details className="side-reports">
            <summary>Ask about any of your {reports.length} report{reports.length === 1 ? '' : 's'}</summary>
            <ul>
                {reports.map((report) => (
                    <li key={report.slug}>
                        <Link href={`/ai/reports?about=${report.slug}`}>
                            <span className={`dot dot-${report.status}`} aria-hidden="true" />
                            <span className="truncate">{report.title}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </details>
    </aside>
)

// The side panel on Write SPL: the searches behind the reports, to learn from.
const SplAside = ({ reports }: { reports: ReportListItem[] }) => (
    <aside className="ai-side" aria-label="Searches in your reports">
        <h2>Searches in your reports</h2>
        <p>Pick one to have its search explained step by step.</p>
        <ul>
            {reports.map((report) => (
                <li key={report.slug}>
                    <Link href={`/ai/spl?explain=${report.slug}`}>
                        <span className="flex min-w-0 flex-col">
                            <span className="truncate">{report.title}</span>
                            <code className="side-note">{report.index}</code>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    </aside>
)

// One tab of the Ask AI page: the chat named in the address (?chat=<id>), or a
// new one, next to its side panel. ?about=<slug> (Ask about reports) and
// ?explain=<slug> (Write SPL) start a new chat with a question filled in.
const AiChat = async ({ kind, searchParams }: { kind: ChatKind; searchParams: SearchParams }) => {
    const params = await searchParams;
    const chatId = one(params.chat);
    const [viewer, reports, sync, chat] = await Promise.all([getViewer(), getVisibleReports(), getSyncInfo(), chatId ? getChat(chatId) : null]);

    // A chat from the other tab opens there.
    if (chat && chat.kind !== kind) redirect(`/ai/${chat.kind}?chat=${chat.id}`);
    if (chatId && !chat) {
        return (
            <div className="empty-state">
                Chat not found. It may have been deleted. <Link href="/ai/history" className="text-primary">See your chats</Link> or{' '}
                <Link href={`/ai/${kind}`} className="text-primary">start a new one</Link>.
            </div>
        );
    }

    const status = aiStatus(sync?.mode);
    const linked = reports.find(({ slug }) => slug === one(kind === 'reports' ? params.about : params.explain));
    const prefill = !chat && linked ? (kind === 'reports' ? aboutQuestion(linked) : explainRequest(linked)) : '';
    const chips = Object.fromEntries(reports.map(({ slug, title, status }) => [slug, { slug, title, status }]));
    const answerIds = chat ? chat.messages.filter(({ role }) => role === 'assistant').map(({ id }) => id) : [];
    const [votes, savedExamples] = await Promise.all([
        getVotes(viewer, 'answer', answerIds),
        kind === 'spl' ? savedExampleIds(viewer, answerIds) : {},
    ]);

    return (
        <div className="ai-workspace">
            <ChatView
                key={chat?.id ?? `new:${prefill}`}
                kind={kind}
                chat={chat}
                reports={chips}
                suggestions={kind === 'reports' ? reportQuestions(reports) : splRequests(reports)}
                ai={status.enabled
                    ? { enabled: true, testMode: status.provider === 'fake' }
                    : { enabled: false, notice: aiOffMessage(status.reason) }}
                prefill={prefill}
                splunkWebUrl={splunkWebUrl()}
                demo={process.env.DEMO_MODE === 'true'}
                votes={votes}
                savedExamples={savedExamples}
            />
            {reports.length > 0 && (kind === 'reports' ? <ReportsAside reports={reports} /> : <SplAside reports={reports} />)}
        </div>
    )
}

export default AiChat
