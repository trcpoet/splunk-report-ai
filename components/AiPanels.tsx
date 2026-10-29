import Link from "next/link";
import { Suspense } from "react";
import Briefing from "@/components/Briefing";
import { BriefingSkeleton } from "@/components/Skeletons";
import { getVisibleReports } from "@/lib/dal";

// What the Ask AI top bar's panels hold (components/AiTopBar.tsx), and the
// count on its Reports button. They're rendered on the server with the page;
// a panel shows its part when someone opens it.

const plural = (count: number) => `${count} report${count === 1 ? '' : 's'}`;

const NO_REPORTS = <p className="answer-note">You can&apos;t see any reports yet, so there&apos;s nothing to ask about.</p>;

// Ask about reports: the briefing (what needs attention), then every report
// the AI can see, to start a chat about one.
export async function ReportsPanel() {
    const reports = await getVisibleReports();
    if (reports.length === 0) return NO_REPORTS;

    return (
        <div className="ai-panel">
            <Suspense fallback={<BriefingSkeleton variant="side" />}>
                <Briefing variant="side" />
            </Suspense>
            <section className="ai-panel-list">
                <h3>Ask about any of your {plural(reports.length)}</h3>
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
            </section>
        </div>
    )
}

// Write SPL: the searches behind the reports, to learn from.
export async function SearchesPanel() {
    const reports = await getVisibleReports();
    if (reports.length === 0) return NO_REPORTS;

    return (
        <section className="ai-panel-list">
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
        </section>
    )
}

// How many reports need attention, on the Reports button. None shows nothing.
export async function AttentionCount() {
    const count = (await getVisibleReports()).filter(({ status }) => status !== 'success').length;
    if (count === 0) return null;

    return (
        <span className="topbar-badge">
            {count}
            <span className="sr-only"> need attention</span>
        </span>
    )
}
