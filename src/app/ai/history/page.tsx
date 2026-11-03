import type { Metadata } from "next";
import ChatHistory from "@/ai/components/ChatHistory";
import { HistorySkeleton } from "@/shared/components/Skeletons";
import { Reveal } from "@/shared/components/Transitions";
import { listChats } from "@/ai/chats";

export const metadata: Metadata = { title: 'Your chats | SplunkEvents' };

// The chats page, which Search chats in the sidebar opens (and Chats in the
// top bar on phones).
const HistoryPage = () => (
    <div className="chats-page">
        <h2>Your chats</h2>
        <Reveal fallback={<HistorySkeleton />}>
            <History />
        </Reveal>
    </div>
)

// Only the signed-in person's chats.
async function History() {
    const chats = await listChats();
    return <ChatHistory chats={chats} demo={process.env.DEMO_MODE === 'true'} />;
}

export default HistoryPage
