import Link from "next/link";
import { redirect } from "next/navigation";
import ChatView from "@/components/ChatView";
import { aiOffMessage, aiStatus, splunkWebUrl } from "@/lib/ai/config";
import { aboutQuestion, explainRequest, reportQuestions, splRequests } from "@/lib/ai/suggestions";
import { getChat, type ChatKind } from "@/lib/chats";
import { getSyncInfo, getViewer, getVisibleReports } from "@/lib/dal";
import { getVotes } from "@/lib/feedback";
import { savedExampleIds } from "@/lib/spl-examples";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

// One mode of the Ask AI page: the chat named in the address (?chat=<id>), or
// a new one. ?about=<slug> (Ask about reports) and ?explain=<slug> (Write SPL)
// start a new chat with a question filled in. The sidebar and the panels with
// your reports are in the layout (app/ai/layout.tsx).
const AiChat = async ({ kind, searchParams }: { kind: ChatKind; searchParams: SearchParams }) => {
    const params = await searchParams;
    const chatId = one(params.chat);
    const [viewer, reports, sync, chat] = await Promise.all([getViewer(), getVisibleReports(), getSyncInfo(), chatId ? getChat(chatId) : null]);

    // A chat from the other mode opens there.
    if (chat && chat.kind !== kind) redirect(`/ai/${chat.kind}?chat=${chat.id}`);
    if (chatId && !chat) {
        return (
            <div className="chat">
                <div className="empty-state">
                    Chat not found. It may have been deleted. <Link href="/ai/history" className="text-primary">See your chats</Link> or{' '}
                    <Link href={`/ai/${kind}`} className="text-primary">start a new one</Link>.
                </div>
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
    )
}

export default AiChat
