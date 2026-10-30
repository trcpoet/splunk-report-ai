import Link from "next/link";
import { Check, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { PAGE_TRANSITION } from "@/components/Transitions";
import { formatDay, plural } from "@/lib/format";
import type { OutcomeCounts, ReportStatus, RunHealth, RunHealthRow } from "@/lib/reports";
import { worstStatus } from "@/lib/run-health";

// Reports shown before "Show N more reports".
const VISIBLE_ROWS = 10;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// For the narrowest phones, where three letters don't fit a column.
const SHORT_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// The reserved status colors, always with an icon and words, never color alone.
const MARKS: Record<ReportStatus, { label: string; Icon: LucideIcon }> = {
    success: { label: 'Healthy', Icon: Check },
    warning: { label: 'Warning', Icon: TriangleAlert },
    failed: { label: 'Failed', Icon: X },
};

// days are YYYY-MM-DD (UTC).
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);
const dayLabel = (day: string) => formatDay(`${day}T00:00:00Z`);

// "Oct 2: 3 healthy, 3 warnings, 1 failed", or "Oct 2: no runs".
function cellText(day: string, cell: OutcomeCounts | null) {
    const parts = cell
        ? [
            cell.success > 0 ? `${cell.success} healthy` : '',
            cell.warning > 0 ? plural(cell.warning, 'warning', 'warnings') : '',
            cell.failed > 0 ? `${cell.failed} failed` : '',
        ].filter(Boolean)
        : [];

    return `${dayLabel(day)}: ${parts.length > 0 ? parts.join(', ') : 'no runs'}`;
}

function HealthCell({ day, cell, end }: { day: string; cell: OutcomeCounts | null; end: boolean }) {
    const status = cell ? worstStatus(cell) : null;
    const text = cellText(day, cell);
    const mark = status ? MARKS[status] : null;

    return (
        <td>
            <span className={`health-cell health-${status ?? 'none'} ${end ? 'tip-end' : ''}`} data-tip={text}>
                {mark && <mark.Icon aria-hidden="true" />}
                <span className="sr-only">{text}</span>
            </span>
        </td>
    );
}

// The second table, behind "Show N more reports", repeats the day headings for
// screen readers only. The columns line up because both tables size them the same.
function HealthTable({ rows, days, label, quietHead = false }: { rows: RunHealthRow[]; days: string[]; label: string; quietHead?: boolean }) {
    return (
        <table className="health-grid" aria-label={label}>
            <colgroup>
                <col />
                {days.map((day) => <col key={day} className="day" />)}
            </colgroup>
            <thead className={quietHead ? 'sr-only' : undefined}>
                <tr>
                    <th scope="col"><span className="sr-only">Report</span></th>
                    {days.map((day) => {
                        const date = dateOf(day);
                        return (
                            <th key={day} scope="col">
                                <span aria-hidden="true">
                                    <span className="max-[360px]:hidden">{WEEKDAYS[date.getUTCDay()]}</span>
                                    <span className="hidden max-[360px]:inline">{SHORT_WEEKDAYS[date.getUTCDay()]}</span>
                                    <br />{date.getUTCDate()}
                                </span>
                                <span className="sr-only">{WEEKDAYS[date.getUTCDay()]}, {dayLabel(day)}</span>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.slug}>
                        <th scope="row">
                            <Link href={`/reports/${row.slug}`} title={row.title} transitionTypes={PAGE_TRANSITION}>{row.title}</Link>
                        </th>
                        {row.cells.map((cell, i) => (
                            <HealthCell key={days[i]} day={days[i]} cell={cell} end={i >= days.length - 3} />
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// Each report's last days at a glance: the worst outcome of its runs each day.
// The "Scheduled runs per day" chart beside it counts the same runs.
const RunHealthGrid = ({ health }: { health: RunHealth }) => {
    const { days, rows } = health;
    if (days.length === 0 || rows.length === 0) return null;

    const more = rows.slice(VISIBLE_ROWS);

    return (
        <figure className="chart-card">
            <figcaption className="flex flex-col gap-0.5">
                <span className="chart-heading">Run health by report</span>
                <span className="chart-subtitle">Worst outcome each day, {dayLabel(days[0])} to {dayLabel(days.at(-1)!)} (UTC)</span>
            </figcaption>

            <HealthTable rows={rows.slice(0, VISIBLE_ROWS)} days={days} label="Run health by report" />

            {more.length > 0 && (
                <details>
                    <summary>Show {plural(more.length, 'more report', 'more reports')}</summary>
                    <HealthTable rows={more} days={days} label="Run health, more reports" quietHead />
                </details>
            )}

            <ul className="health-legend">
                {(['success', 'warning', 'failed'] as const).map((status) => {
                    const { label, Icon } = MARKS[status];
                    return (
                        <li key={status}>
                            <span className={`health-cell health-${status}`}><Icon aria-hidden="true" /></span>
                            {label}
                        </li>
                    );
                })}
                <li><span className="health-cell health-none" />No runs</li>
            </ul>
        </figure>
    );
};

export default RunHealthGrid;
