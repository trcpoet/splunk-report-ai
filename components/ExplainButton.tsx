'use client';

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import ChatAnswer from "@/components/ChatAnswer";
import FeedbackButtons from "@/components/FeedbackButtons";
import { SkeletonParagraph } from "@/components/Skeletons";
import Sparkline from "@/components/Sparkline";
import StatusBadge from "@/components/StatusBadge";
import { useSummary } from "@/components/useSummary";
import { track } from "@/lib/analytics";
import { formatDateTime, formatNumber } from "@/lib/format";
import { describeColumn, findUnusualRun, profileResults, unusualTrend } from "@/lib/insights";
import type { SplunkReport } from "@/lib/reports";

// The report with its result rows: the one the page already has (a report
// page), or else from the same JSON API the app offers (a report card).
function useReport(slug: string, given?: SplunkReport) {
    const [fetched, setFetched] = useState<{ report?: SplunkReport; error?: string }>({});

    useEffect(() => {
        if (given) return;
        const controller = new AbortController();
        fetch(`/api/reports/${slug}`, { signal: controller.signal })
            .then(async (response) => {
                const body = await response.json().catch(() => ({}));
                setFetched(response.ok ? { report: body.report } : { error: body.message ?? "Couldn't load the report." });
            })
            .catch(() => {
                if (!controller.signal.aborted) setFetched({ error: "Couldn't load the report. Check your connection." });
            });
        return () => controller.abort();
    }, [slug, given]);

    return given ? { report: given } : fetched;
}

// What's inside the panel. It mounts when the panel opens, so nothing loads
// for the cards nobody opens.
type ContentProps = { slug: string; title: string; given?: SplunkReport; headingId: string; close: () => void };

function ExplainContent({ slug, title, given, headingId, close }: ContentProps) {
    const summary = useSummary(`/api/ai/explain/${slug}`);
    const { report, error } = useReport(slug, given);

    const unusual = report ? findUnusualRun(report.history) : null;
    const trend = report && unusual ? unusualTrend(report.history, unusual) : null;
    const profile = report ? profileResults(report.columns, report.rows, report.resultCount) : null;
    // The summary may name the report as [[slug]], which shows as its chip.
    const chips = report ? { [report.slug]: { slug: report.slug, title: report.title, status: report.status } } : {};

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
                    <SkeletonParagraph count={4} className="text-sm" />
                ) : summary.status === 'failed' && !summary.text ? (
                    <p className="ai-notice">{summary.error}</p>
                ) : (
                    <ChatAnswer text={summary.text} reports={chips} streaming={summary.status === 'streaming'} />
                )}
                {summary.cutOff && <p className="answer-note">This summary was cut off because it got too long.</p>}
                {summary.status === 'done' && summary.id && <FeedbackButtons kind="summary" targetId={summary.id} initial={summary.vote} />}
            </section>

            <section className="explain-section">
                <h3>At a glance</h3>
                {error ? (
                    <p className="answer-note">{error}</p>
                ) : !report ? (
                    <SkeletonParagraph count={5} className="text-sm" />
                ) : (
                    <>
                        {unusual && trend && (
                            <div className="explain-unusual">
                                <Sparkline values={trend.values} usual={unusual.usual} highlightLast label={trend.label} />
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
                            <p className="text-sm text-light-200">
                                {report.resultsRunAt && report.resultCount === 0
                                    ? `The run at ${formatDateTime(report.resultsRunAt)} found no results.`
                                    : 'No results are stored for this report yet.'}
                            </p>
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

type Props = {
    slug: string;
    title: string;
    // The report with its results, when the page has it already (a report page).
    report?: SplunkReport;
    className?: string;
};

// "Explain" on a report card or a report page: opens a side panel (a bottom
// sheet on phones) with an AI summary of the latest run, a plain-statistics
// look at the results, and ways to dig further. It's a native <dialog>, so
// focus moves into it, Esc closes it, and focus returns to the button.
const ExplainButton = ({ slug, title, report, className = 'explain-trigger' }: Props) => {
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
                // A click on the dimmed backdrop lands on the dialog itself, outside
                // its box. (A click on the panel's own padding lands on it too, inside.)
                onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
                    if (event.target === event.currentTarget && outside) close();
                }}
            >
                {open && <ExplainContent slug={slug} title={title} given={report} headingId={headingId} close={close} />}
            </dialog>
        </>
    )
}

export default ExplainButton
