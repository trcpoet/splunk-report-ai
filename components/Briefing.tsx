import Link from "next/link";
import BriefingSummary from "@/components/BriefingSummary";
import FeedbackButtons from "@/components/FeedbackButtons";
import Sparkline from "@/components/Sparkline";
import StatusBadge from "@/components/StatusBadge";
import { PAGE_TRANSITION } from "@/components/Transitions";
import { aiStatus } from "@/lib/ai/config";
import { briefingKey, flagId } from "@/lib/ai/keys";
import { getSyncInfo, getViewer, getVisibleReports } from "@/lib/dal";
import { getVotes } from "@/lib/feedback";
import { formatDateTime } from "@/lib/format";
import { findUnusualRun, unusualTrend } from "@/lib/insights";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// What needs attention across the reports the viewer can see, shown at once
// from plain statistics: reports that warn or fail, and runs that stand out
// from their recent runs (lib/insights.ts). Then, when AI is on, a two- or
// three-sentence summary. "Worth flagging?" votes teach the ML job in ml/
// which flags people find useful.
//
// On the home page it's a card ('home'); on Ask about reports it sits in the
// side panel ('side').
const Briefing = async ({ variant }: { variant: 'home' | 'side' }) => {
    const [viewer, reports, sync] = await Promise.all([getViewer(), getVisibleReports(), getSyncInfo()]);
    if (reports.length === 0) return null;

    const attention = reports.filter((report) => report.status !== 'success');
    const unusual = reports.flatMap((report) => {
        const run = findUnusualRun(report.history);
        return run ? [{ report, run }] : [];
    });

    const votes = await getVotes(viewer, 'flag', [
        ...attention.map(({ slug, lastRun }) => flagId(slug, lastRun, 'status')),
        ...unusual.map(({ report, run }) => flagId(report.slug, run.runAt, 'unusual')),
    ]);
    const ai = aiStatus(sync?.mode).enabled;
    const chips = Object.fromEntries(reports.map(({ slug, title, status }) => [slug, { slug, title, status }]));

    const parts = [
        ...(attention.length > 0 ? [`${plural(attention.length, 'report needs', 'reports need')} attention`] : []),
        ...(unusual.length > 0 ? [`${plural(unusual.length, 'run looks', 'runs look')} unusual`] : []),
    ];
    const headline = parts.length > 0 ? parts.join(', ') : `All ${plural(reports.length, 'report looks', 'reports look')} healthy`;

    return (
        <section className={`briefing briefing-${variant}`} aria-label="Briefing">
            <div className="briefing-head">
                <h2 className="briefing-headline">{headline}</h2>
                {/* The home page says this above the briefing already. */}
                {variant === 'side' && sync && <p className="briefing-asof">Data as of {formatDateTime(sync.lastSuccessAt)}</p>}
            </div>

            {attention.length > 0 && (
                <div className="briefing-group">
                    <h3>Needs attention</h3>
                    <ul>
                        {attention.map((report) => (
                            <li key={report.slug}>
                                <div className="briefing-item-head">
                                    <Link href={`/reports/${report.slug}`} transitionTypes={PAGE_TRANSITION}>{report.title}</Link>
                                    <StatusBadge status={report.status} />
                                </div>
                                {report.statusMessage && <p>{report.statusMessage}</p>}
                                <div className="briefing-item-actions">
                                    <Link href={`/ai/reports?about=${report.slug}`}>Ask about it</Link>
                                    <FeedbackButtons
                                        kind="flag"
                                        compact
                                        question="Worth flagging?"
                                        targetId={flagId(report.slug, report.lastRun, 'status')}
                                        initial={votes[flagId(report.slug, report.lastRun, 'status')]}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {unusual.length > 0 && (
                <div className="briefing-group">
                    <h3>Unusual runs</h3>
                    <ul>
                        {unusual.map(({ report, run }) => {
                            const trend = unusualTrend(report.history, run);

                            return (
                                <li key={report.slug}>
                                    <div className="briefing-item-head">
                                        <Link href={`/reports/${report.slug}`} transitionTypes={PAGE_TRANSITION}>{report.title}</Link>
                                        <Sparkline values={trend.values} usual={run.usual} highlightLast label={trend.label} />
                                    </div>
                                    <p>{run.message}</p>
                                    <div className="briefing-item-actions">
                                        <Link href={`/ai/reports?about=${report.slug}`}>Ask about it</Link>
                                        <FeedbackButtons
                                            kind="flag"
                                            compact
                                            question="Worth flagging?"
                                            targetId={flagId(report.slug, run.runAt, 'unusual')}
                                            initial={votes[flagId(report.slug, run.runAt, 'unusual')]}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {attention.length === 0 && unusual.length === 0 && (
                <p className="briefing-calm">No report is warning or failing, and every latest run looks like the ones before it.</p>
            )}

            {ai && <BriefingSummary key={briefingKey(reports)} reports={chips} />}
        </section>
    )
}

export default Briefing
