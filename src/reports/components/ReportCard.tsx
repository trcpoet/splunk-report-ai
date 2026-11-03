'use client';

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { useState } from "react";
import ExplainButton from "@/ai/components/ExplainButton";
import ReportIcon from "@/reports/components/ReportIcon";
import StatusBadge from "@/reports/components/StatusBadge";
import RunHistory from "@/reports/components/RunHistory";
import { PAGE_TRANSITION } from "@/shared/components/Transitions";
import { formatDateTime } from "@/shared/format";
import type { ReportSummary } from "@/reports/reports";

// A thin bar along the card's top edge while the report it opens is still on
// its way (a slow network, or a click before the prefetch finished). It is
// always there and only fades in, so showing it moves nothing.
const PendingBar = () => {
    const { pending } = useLinkStatus();
    return <span className={pending ? 'pending-bar is-pending' : 'pending-bar'} aria-hidden="true" />;
}

const ReportCard = ({ report }: { report: ReportSummary }) => {
    // Every card on screen prefetches the report page's shell. Pointing at a
    // card (hover, keyboard focus or touch) also prefetches that report's
    // content, so it opens at once without a request for every card.
    const [intent, setIntent] = useState(false);
    const prefetchContent = () => setIntent(true);

    // The card is one link, and Explain sits on top of its corner: a button
    // can't go inside a link.
    return (
        <div className="report-card-wrap">
        <Link
            href={`/reports/${report.slug}`}
            prefetch={intent ? true : 'auto'}
            onMouseEnter={prefetchContent}
            onFocus={prefetchContent}
            onTouchStart={prefetchContent}
            transitionTypes={PAGE_TRANSITION}
            className="report-card"
        >
            <PendingBar />

            <div className="flex flex-row items-center justify-between gap-2">
                <div className="flex flex-row items-center gap-2">
                    <ReportIcon name={report.icon} />
                    <span className="pill">{report.category}</span>
                </div>
                <StatusBadge status={report.status} />
            </div>

            <div className="flex flex-col gap-1.5">
                <p className="title">{report.title}</p>
                <p className="description">{report.description}</p>
            </div>

            {/* What the newest results say, such as "Overall error rate 0.93%". */}
            {report.headline && (
                <p className="card-headline">
                    <span className="label">{report.headline.label}</span>
                    <span className="value">{report.headline.value}</span>
                    {report.headline.note && <span className="note">{report.headline.note}</span>}
                    {report.headline.from && <span className="from">From the run at {formatDateTime(report.headline.from)}</span>}
                </p>
            )}

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
        <ExplainButton slug={report.slug} title={report.title} />
        </div>
    )
}

export default ReportCard
