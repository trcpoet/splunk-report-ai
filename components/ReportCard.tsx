import Link from "next/link";
import Image from "next/image";
import StatusBadge from "@/components/StatusBadge";
import RunHistory from "@/components/RunHistory";
import { formatDateTime } from "@/lib/format";
import type { ReportSummary } from "@/lib/reports";

const ReportCard = ({ report }: { report: ReportSummary }) => (
    <Link href={`/reports/${report.slug}`} className="report-card">
        <div className="flex flex-row items-center justify-between gap-2">
            <span className="pill">{report.category}</span>
            <StatusBadge status={report.status} />
        </div>

        <div className="flex flex-col gap-1.5">
            <p className="title">{report.title}</p>
            <p className="description">{report.description}</p>
        </div>

        <div className="meta">
            <div>
                <Image src="/icons/clock.svg" alt="" width={14} height={14} />
                <span>{report.schedule}</span>
            </div>
            <div>
                <Image src="/icons/calendar.svg" alt="" width={14} height={14} />
                <span>Last run {formatDateTime(report.lastRun)}</span>
            </div>
            <div>
                <Image src="/icons/audience.svg" alt="" width={14} height={14} />
                <span>{report.recipients.length} recipients</span>
            </div>
        </div>

        <RunHistory runs={report.history} />
    </Link>
)

export default ReportCard
