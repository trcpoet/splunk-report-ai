import type { Metadata } from "next";
import ChatHistory from "@/components/ChatHistory";
import { HistorySkeleton } from "@/components/Skeletons";
import { Reveal } from "@/components/Transitions";
import { listChats } from "@/lib/chats";

export const metadata: Metadata = { title: 'Chat history | SplunkEvents' };

const HistoryPage = () => (
    <Reveal fallback={<HistorySkeleton />}>
        <History />
    </Reveal>
)

// Only the signed-in person's chats.
async function History() {
    const chats = await listChats();
    return <ChatHistory chats={chats} demo={process.env.DEMO_MODE === 'true'} />;
}

export default HistoryPage
