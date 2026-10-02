import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import ResultsTable from "@/components/ResultsTable";
import ReportActions from "@/components/ReportActions";
import ReportCard from "@/components/ReportCard";
import { getReportBySlug, getSimilarReports, reports } from "@/lib/reports";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

const STATUS_LABELS = { success: 'Success', warning: 'Warning', failed: 'Failed' } as const;

export function generateStaticParams() {
    return reports.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const report = getReportBySlug(slug);

    return {
        title: report ? `${report.title} | SplunkEvents` : 'Report not found | SplunkEvents',
        description: report?.description,
    };
}

const ReportPage = async ({ params }: Props) => {
    const { slug } = await params;
    const report = getReportBySlug(slug);

    if (!report) notFound();

    const similarReports = getSimilarReports(report);
    const details = [
        { label: 'Schedule', value: report.schedule, code: report.cron },
        { label: 'Time range', value: report.timeRange },
        { label: 'Index', value: report.index },
        { label: 'Splunk app', value: report.app },
        { label: 'Owner', value: report.owner },
        { label: 'Last run', value: formatDateTime(report.lastRun) },
        { label: 'Next run', value: formatDateTime(report.nextRun) },
    ];
    const historyRows = [...report.history].reverse().map((run) => [
        formatDateTime(run.runAt),
        STATUS_LABELS[run.status],
        run.status === 'failed' ? 'Skipped' : formatDuration(run.durationSec),
        run.resultCount,
    ]);

    return (
        <section id="report">
            <Link href="/#reports" className="back-link">← All reports</Link>

            <div className="header">
                <div className="flex flex-row flex-wrap items-center gap-2">
                    <span className="pill">{report.category}</span>
                    <StatusBadge status={report.status} />
                </div>
                <h1 className="text-4xl max-sm:text-3xl">{report.title}</h1>
                <p>{report.description}</p>
            </div>

            {report.statusMessage && (
                <div className={`status-callout status-${report.status}`} role="status">
                    {report.statusMessage}
                </div>
            )}

            <div className="highlights">
                {report.highlights.map(({ label, value, note }) => (
                    <div key={label} className="stat-tile">
                        <span className="label">{label}</span>
                        <span className="value">{value}</span>
                        {note && <span className="note">{note}</span>}
                    </div>
                ))}
            </div>

            <div className="details">
                <div className="content">
                    <section className="flex-col-gap-3">
                        <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                            <h2>Latest results</h2>
                            <span className="text-light-200 text-sm">{report.timeRange} · run {formatDateTime(report.lastRun)}</span>
                        </div>
                        <ResultsTable columns={report.columns} rows={report.rows} />
                        {report.resultCount > report.rows.length && (
                            <p className="text-light-200 text-sm">
                                Showing the top {report.rows.length} of {formatNumber(report.resultCount)} results.
                            </p>
                        )}
                    </section>

                    <section className="flex-col-gap-3">
                        <h2>Search query (SPL)</h2>
                        <pre className="spl"><code>{report.spl}</code></pre>
                    </section>

                    <section className="flex-col-gap-3">
                        <h2>Run history</h2>
                        <ResultsTable columns={['Run time', 'Status', 'Duration', 'Results']} rows={historyRows} />
                    </section>

                    <div className="flex flex-row flex-wrap gap-1.5">
                        {report.tags.map((tag) => (
                            <span key={tag} className="pill">#{tag}</span>
                        ))}
                    </div>
                </div>

                <aside className="sidebar">
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
                        <p>
                            Until now, this report was emailed to {report.recipients.length} distribution lists,
                            about {formatNumber(report.runsPerWeek * report.recipients.length)} emails a week.
                            Now it lives here, where anyone with access can look it up.
                        </p>
                        <ul className="recipients">
                            {report.recipients.map((recipient) => (
                                <li key={recipient}>{recipient}</li>
                            ))}
                        </ul>
                        <ReportActions
                            slug={report.slug}
                            lastRun={report.lastRun}
                            spl={report.spl}
                            columns={report.columns}
                            rows={report.rows}
                        />
                    </div>
                </aside>
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
        </section>
    )
}

export default ReportPage
