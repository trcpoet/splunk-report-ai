import type { Metadata } from "next";
import ChatHistory from "@/components/ChatHistory";
import { HistorySkeleton } from "@/components/Skeletons";
import { Reveal } from "@/components/Transitions";
import { listChats } from "@/lib/chats";

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
