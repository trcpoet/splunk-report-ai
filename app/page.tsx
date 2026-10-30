import Briefing from "@/components/Briefing";
import ExploreBtn from "@/components/ExploreBtn";
import ReportBrowser from "@/components/ReportBrowser";
import RunHealthGrid from "@/components/RunHealthGrid";
import RunOutcomes from "@/components/RunOutcomes";
import SchedulerLoad from "@/components/SchedulerLoad";
import { BriefingSkeleton, OverviewSkeleton, ReportsSkeleton } from "@/components/Skeletons";
import { PageTransition, Reveal } from "@/components/Transitions";
import { getRunHealth, getRunOutcomes, getScheduleLoad, getSyncInfo, getVisibleReports } from "@/lib/dal";
import { getCategories, getReportStats, toSummary } from "@/lib/reports";
import { formatDateTime, formatNumber } from "@/lib/format";

const Page = () => {
    return (
        <PageTransition>
            <section id="home">
                <h1 className="text-center">Splunk Reports, <br /> Without the Inbox</h1>
                <p className="subheading">Every scheduled Splunk report your team used to get by email, now searchable and up to date in one place.</p>

                <ExploreBtn />

                <Reveal fallback={<OverviewSkeleton />}>
                    <Overview />
                </Reveal>

                <div id="reports" className="mt-20 space-y-7 scroll-mt-24">
                    <h3>All Reports</h3>

                    <Reveal fallback={<ReportsSkeleton />}>
                        <Reports />
                    </Reveal>
                </div>
            </section>
        </PageTransition>
    )
}

// Only the reports the signed-in user may see.
async function Overview() {
    const [reports, outcomes, health, load, sync] = await Promise.all([
        getVisibleReports(),
        getRunOutcomes(),
        getRunHealth(),
        getScheduleLoad(),
        getSyncInfo(),
    ]);
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

            {/* Headline numbers, then what needs attention, then the runs per day
                and per report, then when searches run, then the list. */}
            <div className="mt-10">
                <Reveal fallback={<BriefingSkeleton />}>
                    <Briefing variant="home" />
                </Reveal>
            </div>

            {outcomes.length > 0 && (
                <div className="overview-charts">
                    <RunOutcomes days={outcomes} />
                    <RunHealthGrid health={health} />
                </div>
            )}

            {load.total > 0 && (
                <div className="mt-6">
                    <SchedulerLoad load={load} />
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

export default Page;
