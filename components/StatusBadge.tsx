import type { ReportHealth } from "@/lib/reports";

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

export default StatusBadge
