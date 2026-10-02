import ExploreBtn from "@/components/ExploreBtn";
import ReportBrowser from "@/components/ReportBrowser";
import { categories, getReportStats, reports, toSummary } from "@/lib/reports";
import { formatNumber } from "@/lib/format";

const Page = () => {
    const stats = getReportStats();

    const tiles = [
        { label: 'Scheduled reports', value: formatNumber(stats.total) },
        { label: 'Need attention', value: formatNumber(stats.needsAttention), tone: stats.needsAttention > 0 ? 'warning' : undefined },
        { label: 'Report emails / week', value: formatNumber(stats.emailsPerWeek), note: 'No longer sent' },
        { label: 'Distribution lists', value: formatNumber(stats.recipients), note: 'That used to get these emails' },
    ];

    return (
        <section id="home">
            <h1 className="text-center">Splunk Reports, <br /> Without the Inbox</h1>
            <p className="subheading">Every scheduled Splunk report your team used to get by email, now searchable and up to date in one place.</p>

            <ExploreBtn />

            <div className="stats">
                {tiles.map(({ label, value, tone, note }) => (
                    <div key={label} className="stat-tile">
                        <span className="label">{label}</span>
                        <span className={tone === 'warning' ? 'value text-amber-300' : 'value'}>{value}</span>
                        {note && <span className="note">{note}</span>}
                    </div>
                ))}
            </div>

            <div id="reports" className="mt-20 space-y-7 scroll-mt-24">
                <h3>All Reports</h3>

                <ReportBrowser reports={reports.map(toSummary)} categories={categories} />
            </div>
        </section>
    )
}

export default Page;
