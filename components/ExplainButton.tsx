'use client';

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import ChatAnswer from "@/components/ChatAnswer";
import FeedbackButtons from "@/components/FeedbackButtons";
import Sparkline from "@/components/Sparkline";
import StatusBadge from "@/components/StatusBadge";
import { useSummary } from "@/components/useSummary";
import { track } from "@/lib/analytics";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { describeColumn, findUnusualRun, profileResults } from "@/lib/insights";
import type { SplunkReport } from "@/lib/reports";

// The report with its result rows, from the same JSON API the app offers.
function useReport(slug: string) {
    const [state, setState] = useState<{ report?: SplunkReport; error?: string }>({});

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/reports/${slug}`, { signal: controller.signal })
            .then(async (response) => {
                const body = await response.json().catch(() => ({}));
                setState(response.ok ? { report: body.report } : { error: body.message ?? "Couldn't load the report." });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ error: "Couldn't load the report. Check your connection." });
            });
        return () => controller.abort();
    }, [slug]);

    return state;
}

const Lines = ({ count }: { count: number }) => (
    <p className="text-sm">
        {Array.from({ length: count }, (_, i) => (
            <span key={i}><span className={`skeleton-line ${i === count - 1 ? 'w-2/3' : 'w-full'}`}>&nbsp;</span><br /></span>
        ))}
    </p>
)

// What's inside the panel. It mounts when the panel opens, so nothing loads
// for the cards nobody opens.
function ExplainContent({ slug, title, headingId, close }: { slug: string; title: string; headingId: string; close: () => void }) {
    const summary = useSummary(`/api/ai/explain/${slug}`);
    const { report, error } = useReport(slug);

    const unusual = report ? findUnusualRun(report.history) : null;
    const profile = report && report.columns.length > 0 ? profileResults(report.columns, report.rows, report.resultCount) : null;
    const trend = report?.history.filter((run) => run.status !== 'failed').map((run) => (unusual?.measure === 'duration' ? run.durationSec : run.resultCount)) ?? [];

    return (
        <div className="explain-content">
            <header className="explain-head">
                <div className="flex min-w-0 flex-col gap-2">
                    <h2 id={headingId}>{title}</h2>
                    {report && <StatusBadge status={report.status} />}
                </div>
                <button type="button" className="icon-button" onClick={close} aria-label="Close">
                    <X aria-hidden="true" />
                </button>
            </header>

            <section className="explain-section" aria-busy={summary.status === 'loading' || summary.status === 'streaming'}>
                <h3>In plain words</h3>
                {summary.status === 'loading' ? (
                    <Lines count={4} />
                ) : summary.status === 'failed' && !summary.text ? (
                    <p className="ai-notice">{summary.error}</p>
                ) : (
                    <ChatAnswer text={summary.text} reports={{}} streaming={summary.status === 'streaming'} />
                )}
                {summary.status === 'done' && summary.id && <FeedbackButtons kind="summary" targetId={summary.id} initial={summary.vote} reportSlug={slug} />}
            </section>

            <section className="explain-section">
                <h3>At a glance</h3>
                {error ? (
                    <p className="answer-note">{error}</p>
                ) : !report ? (
                    <Lines count={5} />
                ) : (
                    <>
                        {unusual && (
                            <div className="explain-unusual">
                                <Sparkline
                                    values={trend}
                                    usual={unusual.usual}
                                    highlightLast
                                    label={`${unusual.measure === 'results' ? 'Results' : 'Search time'} in the last ${trend.length} runs; the newest stands out against the usual ${unusual.measure === 'results' ? formatNumber(Math.round(unusual.usual)) : formatDuration(Math.round(unusual.usual))}.`}
                                />
                                <p><strong>Unusual run.</strong> {unusual.message}</p>
                            </div>
                        )}
                        {report.statusMessage && <p className={`status-callout status-${report.status}`}>{report.statusMessage}</p>}
                        {profile ? (
                            <>
                                <p className="text-sm text-light-200">
                                    {profile.rows < profile.total ? `Showing ${profile.rows} of ${formatNumber(profile.total)} results` : `${formatNumber(profile.total)} results`}
                                    {report.resultsRunAt ? `, from the run at ${formatDateTime(report.resultsRunAt)}.` : '.'}
                                </p>
                                <dl className="explain-profile">
                                    {profile.columns.map((column) => (
                                        <div key={column.name}>
                                            <dt>{column.name}</dt>
                                            <dd>{describeColumn(column, profile.rows)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </>
                        ) : (
                            <p className="text-sm text-light-200">No results are stored for this report yet.</p>
                        )}
                    </>
                )}
            </section>

            <section className="explain-section">
                <h3>Ask more</h3>
                <div className="chips">
                    {/* Close first: a page left behind with the panel open would block the next one. */}
                    <Link href={`/ai/reports?about=${slug}`} className="chip" onClick={close}>Ask about this report</Link>
                    <Link href={`/ai/spl?explain=${slug}`} className="chip" onClick={close}>Explain its search step by step</Link>
                    <Link href={`/reports/${slug}`} className="chip" onClick={close}>Open the report</Link>
                </div>
            </section>
        </div>
    )
}

// "Explain" on a report card or a report page: opens a side panel (a bottom
// sheet on phones) with an AI summary of the latest run, a plain-statistics
// look at the results, and ways to dig further. It's a native <dialog>, so
// focus moves into it, Esc closes it, and focus returns to the button.
const ExplainButton = ({ slug, title, className = 'explain-trigger' }: { slug: string; title: string; className?: string }) => {
    const dialog = useRef<HTMLDialogElement>(null);
    const [open, setOpen] = useState(false);
    const headingId = useId();

    // Next keeps a page you leave, hidden, and runs this cleanup then. A modal
    // dialog left open on a hidden page would still block the page you're on.
    useEffect(() => {
        const node = dialog.current;
        return () => node?.close();
    }, []);

    const show = () => {
        setOpen(true);
        dialog.current?.showModal();
        track('report_explained', { slug });
    };
    const close = () => dialog.current?.close();

    return (
        <>
            <button type="button" className={className} onClick={show} aria-haspopup="dialog">
                <MessageCircleQuestion aria-hidden="true" />
                Explain<span className="sr-only"> {title}</span>
            </button>
            <dialog
                ref={dialog}
                className="explain-panel"
                aria-labelledby={headingId}
                onClose={() => setOpen(false)}
                // A click on the dimmed backdrop lands on the dialog itself.
                onClick={(event) => {
                    if (event.target === event.currentTarget) close();
                }}
            >
                {open && <ExplainContent slug={slug} title={title} headingId={headingId} close={close} />}
            </dialog>
        </>
    )
}

export default ExplainButton
