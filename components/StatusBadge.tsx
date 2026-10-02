import type { ReportStatus } from "@/lib/reports";

const LABELS: Record<ReportStatus, string> = {
    success: 'Healthy',
    warning: 'Warning',
    failed: 'Failed',
};

const StatusBadge = ({ status }: { status: ReportStatus }) => (
    <span className={`status-badge status-${status}`}>
        <span className="dot" aria-hidden="true" />
        {LABELS[status]}
    </span>
)

export default StatusBadge
