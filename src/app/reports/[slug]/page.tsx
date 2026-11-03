import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ChartBoundary from "@/shared/components/ChartBoundary";
import ExplainButton from "@/ai/components/ExplainButton";
import StatusBadge from "@/reports/components/StatusBadge";
import ResultsTable from "@/reports/components/ResultsTable";
import ReportActions from "@/reports/components/ReportActions";
import ReportCard from "@/reports/components/ReportCard";
import ReportIcon from "@/reports/components/ReportIcon";
import ReportChartView from "@/reports/components/ReportChart";
import ReportScatter from "@/reports/components/ReportScatter";
import RunTrend from "@/reports/components/RunTrend";
import Meter from "@/shared/components/Meter";
import Sparkline from "@/shared/components/Sparkline";
import { ReportSkeleton } from "@/shared/components/Skeletons";
import { PAGE_TRANSITION, PageTransition, Reveal } from "@/shared/components/Transitions";
import { getReportSyncError, getVisibleReport, getVisibleReports } from "@/reports/dal";
import { getSimilarReports, toSummary, type ReportChart } from "@/reports/reports";
import { columnLabel, formatDateTime, formatDuration, formatList, formatNumber } from "@/shared/format";

type Props = { params: Promise<{ slug: string }> };

const STATUS_LABELS = { success: 'Success', warning: 'Warning', failed: 'Failed' } as const;

// What a chart over time draws, for its heading. Columns without a line of their
// own add up to the "Other" line.
const lineNames = ({ y, series }: ReportChart, columns: string[]) =>
    series ? [...series, ...(series.length < columns.length - 1 ? ['other'] : [])] : [y];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const report = await getVisibleReport(slug);

    return {
        title: report ? `${report.title} | SplunkEvents` : 'Report not found | SplunkEvents',
        description: report?.description,
    };
}

const ReportPage = ({ params }: Props) => {
    return (
        <PageTransition>
            <section id="report">
                <Link href="/#reports" className="back-link" transitionTypes={PAGE_TRANSITION}>← All reports</Link>

                <Reveal fallback={<ReportSkeleton />}>
                    <ReportDetails params={params} />
                </Reveal>
            </section>
        </PageTransition>
    )
}

async function ReportDetails({ params }: Props) {
    const { slug } = await params;
    const report = await getVisibleReport(slug);

    // Hidden reports get the same answer as missing ones.
    if (!report) notFound();

    // Summaries only: the cards are client components, so this is what the browser gets.
    const similarReports = getSimilarReports(report, await getVisibleReports()).map(toSummary);
    const syncError = await getReportSyncError(slug);
    const details = [
        { label: 'Schedule', value: report.schedule, code: report.cron },
        { label: 'Time range', value: report.timeRange },
        { label: 'Index', value: report.index },
        { label: 'Splunk app', value: report.app },
        { label: 'Owner', value: report.owner },
        { label: 'Last run', value: formatDateTime(report.lastRun) },
        { label: 'Next run', value: formatDateTime(report.nextRun) },
    ];
    const runs = [...report.history].reverse();
    const historyRows = runs.map((run) => [
        formatDateTime(run.runAt),
        STATUS_LABELS[run.status],
        run.status === 'failed' ? 'Skipped' : formatDuration(run.durationSec),
        run.resultCount,
    ]);
    // Formatted times and durations don't sort as text, so sort them by these.
    const historySortValues = {
        'Run time': runs.map((run) => run.runAt),
        Duration: runs.map((run) => (run.status === 'failed' ? -1 : run.durationSec)),
    };

    return (
        <>
            <div className="header">
                <div className="flex flex-row flex-wrap items-center gap-2">
                    <ReportIcon name={report.icon} size="large" />
                    <span className="pill">{report.category}</span>
                    <StatusBadge status={report.status} />
                </div>
                <h1 className="text-4xl max-sm:text-3xl">{report.title}</h1>
                <p>{report.description}</p>
                <ExplainButton slug={report.slug} title={report.title} report={report} className="btn-secondary btn-small" />
            </div>

            {report.statusMessage && (
                <div className={`status-callout status-${report.status}`} role="status">
                    {report.statusMessage}
                </div>
            )}

            {syncError && (
                <div className="status-callout status-warning" role="status">
                    The last sync couldn&apos;t refresh this report: {syncError}
                </div>
            )}

            {report.highlights.length > 0 && (
                <div className="highlights">
                    {report.highlights.map(({ label, value, note, meter, trend }) => (
                        <div key={label} className="stat-tile">
                            <span className="label">{label}</span>
                            <div className="value-row">
                                <span className="value">{value}</span>
                                {trend && (
                                    <Sparkline values={trend} label={`${label} in the last ${trend.length} runs: ${trend.map((count) => formatNumber(count)).join(', ')}`} />
                                )}
                            </div>
                            {meter !== undefined && <Meter value={meter} label={`${label}: ${value}${note ? ` ${note}` : ''}`} />}
                            {note && <span className="note">{note}</span>}
                        </div>
                    ))}
                </div>
            )}

            <div className="details">
                <div className="content">
                    <section className="flex-col-gap-3">
                        <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                            <h2>Latest results</h2>
                            {report.resultsRunAt && (
                                <span className="text-light-200 text-sm">{report.timeRange} · run {formatDateTime(report.resultsRunAt)}</span>
                            )}
                        </div>
                        {report.chart && report.rows.length > 0 && (
                            <figure className="chart-card">
                                <figcaption className="flex flex-col gap-0.5">
                                    {report.chart.panels ? (
                                        <>
                                            <span className="chart-heading">
                                                {formatList(report.chart.panels.map(({ y }) => y))} by {report.chart.x}
                                            </span>
                                            <span className="chart-subtitle">
                                                One chart per measure, with the bars in the same order in each. The largest value in each is labeled, and values past a dashed line are highlighted. Every value is in the table below.
                                            </span>
                                        </>
                                    ) : report.chart.x === '_time' ? (
                                        <>
                                            <span className="chart-heading">{formatList(lineNames(report.chart, report.columns))} over time</span>
                                            <span className="chart-subtitle">
                                                Times are in UTC. {report.chart.series && 'One line per series. '}A gap means no value for that time. Every value is in the table below.
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="chart-heading">{report.chart.y} by {columnLabel(report.chart.x)}</span>
                                            <span className="chart-subtitle">
                                                {report.chart.threshold
                                                    ? `Values past the dashed line (${report.chart.threshold.label}) are highlighted and labeled. Every value is in the table below.`
                                                    : 'The largest value is labeled. Every value is in the table below.'}
                                            </span>
                                        </>
                                    )}
                                </figcaption>
                                <ChartBoundary>
                                    <ReportChartView chart={report.chart} columns={report.columns} rows={report.rows} />
                                </ChartBoundary>
                            </figure>
                        )}
                        {report.chart?.scatter && report.rows.length > 0 && (
                            <figure className="chart-card">
                                <figcaption className="flex flex-col gap-0.5">
                                    <span className="chart-heading">{report.chart.y} vs. {report.chart.scatter.x}</span>
                                    <span className="chart-subtitle">{report.chart.scatter.caption}</span>
                                </figcaption>
                                <ChartBoundary>
                                    <ReportScatter chart={{ ...report.chart, scatter: report.chart.scatter }} columns={report.columns} rows={report.rows} />
                                </ChartBoundary>
                            </figure>
                        )}
                        {report.columns.length > 0 ? (
                            <ResultsTable columns={report.columns} rows={report.rows} filterable />
                        ) : (
                            <p className="empty-state">No results yet. They appear after the next scheduled run is synced.</p>
                        )}
                        {report.resultCount > report.rows.length && (
                            <p className="text-light-200 text-sm">
                                Showing the top {formatNumber(report.rows.length)} of {formatNumber(report.resultCount)} results.
                            </p>
                        )}
                    </section>

                    <section className="flex-col-gap-3">
                        <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                            <h2>Search query (SPL)</h2>
                            <Link href={`/ai/spl?explain=${report.slug}`} className="text-sm text-primary hover:underline" transitionTypes={PAGE_TRANSITION}>
                                Explain it step by step
                            </Link>
                        </div>
                        {/* Focusable, so the keyboard can scroll a long line sideways. */}
                        <pre className="spl" tabIndex={0} role="region" aria-label="Search query (SPL)"><code>{report.spl}</code></pre>
                    </section>

                    <section className="flex-col-gap-3">
                        <h2>Run history</h2>
                        {report.history.length > 1 && (
                            <figure className="chart-card">
                                <figcaption className="flex flex-col gap-0.5">
                                    <span className="chart-heading">Results per run</span>
                                    <span className="chart-subtitle">Skipped runs show as gaps.</span>
                                </figcaption>
                                <ChartBoundary>
                                    <RunTrend runs={report.history} />
                                </ChartBoundary>
                            </figure>
                        )}
                        {historyRows.length > 0 ? (
                            <ResultsTable columns={['Run time', 'Status', 'Duration', 'Results']} rows={historyRows} sortValues={historySortValues} />
                        ) : (
                            <p className="empty-state">No runs stored yet.</p>
                        )}
                    </section>

                    <div className="flex flex-row flex-wrap gap-1.5">
                        {report.tags.map((tag) => (
                            <span key={tag} className="pill">#{tag}</span>
                        ))}
                    </div>
                </div>

                {/* A labelled section, not an <aside>: an aside inside <main> isn't a
                    top-level landmark, which screen readers expect of it. */}
                <section className="sidebar" aria-label="Report details and delivery">
                    <div className="side-card">
                        <h2>Report details</h2>
                        <dl>
                            {details.map(({ label, value, code }) => (
                                <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>
                                        {value}
                                        {code && <code>{code}</code>}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>

                    <div className="side-card">
                        <h2>Delivery</h2>
                        {report.recipients.length > 0 ? (
                            <p>
                                Until now, this report was emailed to {report.recipients.length} distribution lists,
                                about {formatNumber(report.runsPerWeek * report.recipients.length)} emails a week.
                                Now it lives here, where anyone with access can look it up.
                            </p>
                        ) : (
                            <p>This report isn&apos;t emailed to anyone. It lives here, where anyone with access can look it up.</p>
                        )}
                        <ul className="recipients">
                            {report.recipients.map((recipient) => (
                                <li key={recipient}>{recipient}</li>
                            ))}
                        </ul>
                        <ReportActions
                            slug={report.slug}
                            lastRun={report.resultsRunAt ?? report.lastRun}
                            spl={report.spl}
                            columns={report.columns}
                            rows={report.rows}
                            explain={<ExplainButton slug={report.slug} title={report.title} report={report} withSpl className="btn-secondary" />}
                        />
                    </div>
                </section>
            </div>

            {similarReports.length > 0 && (
                <div className="flex w-full flex-col gap-4 pt-20">
                    <h2>Related reports</h2>
                    <div className="reports">
                        {similarReports.map((similarReport) => (
                            <ReportCard key={similarReport.slug} report={similarReport} />
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

export default ReportPage
