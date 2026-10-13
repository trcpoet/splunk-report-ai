import { Suspense } from "react";
import ExploreBtn from "@/components/ExploreBtn";
import ReportBrowser from "@/components/ReportBrowser";
import RunOutcomes from "@/components/RunOutcomes";
import { getRunOutcomes, getSyncInfo, getVisibleReports } from "@/lib/dal";
import { getCategories, getReportStats, toSummary } from "@/lib/reports";
import { formatDateTime, formatNumber } from "@/lib/format";

const Page = () => {
    return (
        <section id="home">
            <h1 className="text-center">Splunk Reports, <br /> Without the Inbox</h1>
            <p className="subheading">Every scheduled Splunk report your team used to get by email, now searchable and up to date in one place.</p>

            <ExploreBtn />

            <Suspense fallback={<StatsSkeleton />}>
                <Overview />
            </Suspense>

            <div id="reports" className="mt-20 space-y-7 scroll-mt-24">
                <h3>All Reports</h3>

                <Suspense fallback={<ReportsSkeleton />}>
                    <Reports />
                </Suspense>
            </div>
        </section>
    )
}

// Only the reports the signed-in user may see.
async function Overview() {
    const [reports, outcomes, sync] = await Promise.all([getVisibleReports(), getRunOutcomes(), getSyncInfo()]);
    const stats = getReportStats(reports);

    const tiles = [
        { label: 'Scheduled reports', value: formatNumber(stats.total) },
        { label: 'Need attention', value: formatNumber(stats.needsAttention), tone: stats.needsAttention > 0 ? 'warning' : undefined },
        { label: 'Report emails / week', value: formatNumber(stats.emailsPerWeek), note: 'No longer sent' },
        { label: 'Distribution lists', value: formatNumber(stats.recipients), note: 'That used to get these emails' },
    ];

    return (
        <>
            <div className="stats">
                {tiles.map(({ label, value, tone, note }) => (
                    <div key={label} className="stat-tile">
                        <span className="label">{label}</span>
                        <span className={tone === 'warning' ? 'value text-amber-300' : 'value'}>{value}</span>
                        {note && <span className="note">{note}</span>}
                    </div>
                ))}
            </div>

            {sync && (
                <p className="data-freshness">
                    Data as of {formatDateTime(sync.lastSuccessAt)}
                    {sync.mode === 'fixture' && ' · demo data'}
                </p>
            )}

            {outcomes.length > 0 && (
                <div className="mt-10">
                    <RunOutcomes days={outcomes} />
                </div>
            )}
        </>
    )
}

async function Reports() {
    const reports = await getVisibleReports();

    if (reports.length === 0) {
        return <p className="empty-state">No reports are shared with your groups yet. Ask an admin for access.</p>;
    }

    return <ReportBrowser reports={reports.map(toSummary)} categories={getCategories(reports)} />;
}

const StatsSkeleton = () => (
    <div className="stats" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="stat-tile skeleton-tile" />)}
    </div>
)

const ReportsSkeleton = () => (
    <div className="reports" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="report-card skeleton-card" />)}
    </div>
)

export default Page;
