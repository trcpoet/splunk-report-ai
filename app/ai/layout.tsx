import { Suspense } from "react";
import { AttentionCount, ReportsPanel, SearchesPanel } from "@/components/AiPanels";
import AiTopBar, { AiTopBarFallback } from "@/components/AiTopBar";
import ChatSidebar from "@/components/ChatSidebar";
import { BriefingSkeleton, ChatListSkeleton, PanelListSkeleton } from "@/components/Skeletons";
import { PageTransition } from "@/components/Transitions";
import { listChats } from "@/lib/chats";

// The Ask AI page, laid out like ChatGPT: your chats down the left, and beside
// them a bar with the mode switch (Ask about reports or Write SPL, each with
// its own address) above the chat. The sidebar and the bar stay put while the
// chat changes.
const AiLayout = ({ children }: { children: React.ReactNode }) => (
    <PageTransition>
        <section id="ai">
            <h1 className="sr-only">Ask AI</h1>

            <Suspense fallback={<ChatListSkeleton />}>
                <Sidebar />
            </Suspense>

            {/* The sidebar's "Skip the list of chats" lands here. */}
            <div id="ai-main" className="ai-main">
                {/* The mode switch needs the address, which the prerendered shell doesn't know yet. */}
                <Suspense fallback={<AiTopBarFallback />}>
                    <AiTopBar
                        panels={{
                            reports: <Suspense fallback={<BriefingSkeleton variant="side" />}><ReportsPanel /></Suspense>,
                            spl: <Suspense fallback={<PanelListSkeleton />}><SearchesPanel /></Suspense>,
                        }}
                        attention={<Suspense fallback={null}><AttentionCount /></Suspense>}
                    />
                </Suspense>

                {children}
            </div>
        </section>
    </PageTransition>
)

// Only the signed-in person's chats.
async function Sidebar() {
    const chats = await listChats();
    return <ChatSidebar chats={chats} />;
}

export default AiLayout
