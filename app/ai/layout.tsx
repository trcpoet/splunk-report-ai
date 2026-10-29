import { Suspense } from "react";
import AiTabs, { AiTabList } from "@/components/AiTabs";
import { PageTransition } from "@/components/Transitions";

// The Ask AI page: a heading and three tabs, each with its own address
// (/ai/reports, /ai/spl, /ai/history). The tabs stay put while their content
// changes, and remember each tab's open chat.
const AiLayout = ({ children }: { children: React.ReactNode }) => (
    <PageTransition>
        <section id="ai">
            <div className="ai-header">
                <h1>Ask AI</h1>
                <p>Ask about your reports, answered from their latest runs, or describe a search and get the SPL, explained step by step.</p>
            </div>

            {/* The current tab needs the address, which the prerendered shell doesn't know yet. */}
            <Suspense fallback={<AiTabList />}>
                <AiTabs />
            </Suspense>

            {children}
        </section>
    </PageTransition>
)

export default AiLayout
