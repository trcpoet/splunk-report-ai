'use client';

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BookOpenText, MessageCircleQuestion, X } from "lucide-react";
import ChatAnswer from "@/components/ChatAnswer";
import FeedbackButtons from "@/components/FeedbackButtons";
import { usePanel } from "@/components/SidePanel";
import { SkeletonParagraph } from "@/components/Skeletons";
import Sparkline from "@/components/Sparkline";
import StatusBadge from "@/components/StatusBadge";
import { useSummary } from "@/components/useSummary";
import { track } from "@/lib/analytics";
import { readJson } from "@/lib/api-reply";
import { columnLabel, formatDateTime, formatNumber } from "@/lib/format";
import { describeColumn, findUnusualRun, profileResults, unusualTrend } from "@/lib/insights";
import type { ModelRun, SplunkReport } from "@/lib/reports";

// The report with its result rows: the one the page already has (a report
// page), or else from the same JSON API the app offers (a report card).
function useReport(slug: string, given?: SplunkReport) {
    const [fetched, setFetched] = useState<{ report?: SplunkReport; error?: string }>({});

    useEffect(() => {
        if (given) return;
        const controller = new AbortController();
        fetch(`/api/reports/${slug}`, { signal: controller.signal })
            .then(async (response) => {
                const body = await readJson<{ report?: SplunkReport; message?: string }>(response);
                setFetched(response.ok && body?.report ? { report: body.report } : { error: body?.message ?? "Couldn't load the report." });
            })
            .catch(() => {
                if (!controller.signal.aborted) setFetched({ error: "Couldn't load the report. Check your connection." });
            });
        return () => controller.abort();
    }, [slug, given]);

    return given ? { report: given } : fetched;
}

// What the ML job (ml/score.py) says about the newest run, in a sentence or two.
function modelSentence(run: ModelRun, attention?: number) {
    const score = `ML model: ${run.score.toFixed(2)} of 1 for how unusual this run is`;
    const where = run.unusual ? ', among the 5% of all runs that differ most.' : ' (0 is typical).';
    const learned = attention === undefined ? '' : ` Learned from people's votes: a flag on this report is worth attention about ${Math.round(attention * 100)}% of the time.`;
    return score + where + learned;
}

// What changes between Explain and "Explain report and SPL".
const MODES = {
    report: { label: 'Explain', Icon: MessageCircleQuestion, heading: 'In plain words', query: '', lines: 4 },
    spl: { label: 'Explain report and SPL', Icon: BookOpenText, heading: 'The report and its search, in plain words', query: '?with=spl', lines: 8 },
} as const;

// What's inside the panel. It mounts when the panel opens, so nothing loads
// for the cards nobody opens. With withSpl ("Explain report and SPL"), the AI
// also walks through the search, and the panel shows the search instead of
// the statistics.
type ContentProps = { slug: string; title: string; given?: SplunkReport; withSpl: boolean; headingId: string; close: () => void };

function ExplainContent({ slug, title, given, withSpl, headingId, close }: ContentProps) {
    const mode = withSpl ? MODES.spl : MODES.report;
    const summary = useSummary(`/api/ai/explain/${slug}${mode.query}`);
    const { report, error } = useReport(slug, given);

    // The statistics for "At a glance", which "Explain report and SPL" doesn't show.
    const glance = report && !withSpl ? report : null;
    const unusual = glance ? findUnusualRun(glance.history, glance.modelRun) : null;
    const trend = glance && unusual ? unusualTrend(glance.history, unusual) : null;
    const profile = glance ? profileResults(glance.columns, glance.rows, glance.resultCount) : null;
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
                <h3>{mode.heading}</h3>
                {summary.status === 'loading' ? (
                    <SkeletonParagraph count={mode.lines} className="text-sm" />
                ) : summary.status === 'failed' && !summary.text ? (
                    <p className="ai-notice">{summary.error}</p>
                ) : (
                    <ChatAnswer text={summary.text} reports={chips} streaming={summary.status === 'streaming'} />
                )}
                {summary.cutOff && <p className="answer-note">This summary was cut off because it got too long.</p>}
                {summary.status === 'done' && summary.id && <FeedbackButtons kind="summary" targetId={summary.id} initial={summary.vote} />}
            </section>

            {withSpl ? (
                <section className="explain-section">
                    <h3>The search (SPL)</h3>
                    {report ? <pre className="spl whitespace-pre-wrap break-words">{report.spl}</pre> : error ? <p className="answer-note">{error}</p> : <SkeletonParagraph count={3} className="text-sm" />}
                </section>
            ) : (
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
                                <p><strong>Unusual run.</strong> {unusual.message}{unusual.flaggedBy === 'model' && ' (Noticed by the ML model.)'}</p>
                            </div>
                        )}
                        {report.modelRun && <p className="text-sm text-light-200">{modelSentence(report.modelRun, report.attention)}</p>}
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
                                            <dt>{columnLabel(column.name)}</dt>
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
            )}

            <section className="explain-section">
                <h3>Ask more</h3>
                <div className="chips">
                    {/* Close first: a page left behind with the panel open would block the next one. */}
                    <Link href={`/ai/reports?about=${slug}`} className="chip" onClick={close}>Ask about this report</Link>
                    {/* "Explain report and SPL" has just done that. */}
                    {!withSpl && <Link href={`/ai/spl?explain=${slug}`} className="chip" onClick={close}>Explain its search step by step</Link>}
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
    // "Explain report and SPL": the report and its search, one pipe command at a time.
    withSpl?: boolean;
    className?: string;
};

// "Explain" on a report card or a report page: opens a side panel (a bottom
// sheet on phones, usePanel in components/SidePanel.tsx) with an AI summary of
// the latest run, a plain-statistics look at the results, and ways to dig further.
// With withSpl, it's "Explain report and SPL" under the report page's Copy SPL
// query, and the panel explains the search step by step as well.
const ExplainButton = ({ slug, title, report, withSpl = false, className = 'explain-trigger' }: Props) => {
    const panel = usePanel();
    const headingId = useId();
    const mode = withSpl ? MODES.spl : MODES.report;

    const show = () => {
        panel.show();
        track('report_explained', { slug, withSpl });
    };

    return (
        <>
            <button type="button" className={className} onClick={show} aria-haspopup="dialog">
                <mode.Icon aria-hidden="true" />
                {mode.label}<span className="sr-only"> {title}</span>
            </button>
            <dialog {...panel.dialogProps} className="explain-panel" aria-labelledby={headingId}>
                {panel.open && <ExplainContent slug={slug} title={title} given={report} withSpl={withSpl} headingId={headingId} close={panel.close} />}
            </dialog>
        </>
    )
}

export default ExplainButton
