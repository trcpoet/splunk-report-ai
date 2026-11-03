import { ClockAlert } from "lucide-react";
import { lateDue, type ReportHealth } from "@/reports/reports";

const LABELS: Record<ReportHealth, string> = {
    success: 'Healthy',
    warning: 'Warning',
    failed: 'Failed',
    none: 'No runs yet',
};

const StatusBadge = ({ status }: { status: ReportHealth }) => (
    <span className={`status-badge status-${status}`}>
        <span className="dot" aria-hidden="true" />
        {LABELS[status]}
    </span>
)

// Beside the status when a run that should be here hasn't arrived
// (lateSince). The status is still the newest run's; this says it's old. The
// tooltip is extra: the report page and the briefing say the same in words.
export const LateBadge = ({ since }: { since: string }) => (
    <span className="status-badge status-late" title={lateDue(since)}>
        <ClockAlert aria-hidden="true" />
        Late
    </span>
)

export default StatusBadge
