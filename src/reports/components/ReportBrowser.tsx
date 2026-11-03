'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Pager from "@/reports/components/Pager";
import ReportCard from "@/reports/components/ReportCard";
import { formatNumber } from "@/shared/format";
import { paginate, sortByLastRun, type ReportCategory, type ReportHealth, type ReportSummary } from "@/reports/reports";

// The home page's report list: search and filters, newest last run first,
// REPORTS_PER_PAGE cards a page.

// 'late' isn't a status: a late report keeps its newest run's status too, so
// it shows under both.
type StatusFilter = ReportHealth | 'late' | 'all';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
    { label: 'All statuses', value: 'all' },
    { label: 'Healthy', value: 'success' },
    { label: 'Warning', value: 'warning' },
    { label: 'Failed', value: 'failed' },
    { label: 'Late', value: 'late' },
    { label: 'No runs yet', value: 'none' },
];

const ReportBrowser = ({ reports, categories }: { reports: ReportSummary[]; categories: ReportCategory[] }) => {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [category, setCategory] = useState<ReportCategory | 'all'>('all');
    const [page, setPage] = useState(0);
    const list = useRef<HTMLUListElement>(null);
    // Sorted once, not on every keystroke in the search box.
    const sorted = useMemo(() => sortByLastRun(reports), [reports]);

    // Links to /#reports ("All Reports", "← All reports") should land on this
    // list. Next scrolls to it once, when the page appears, but the list can
    // arrive later (it streams in, and a page kept from an earlier visit is
    // shown a moment after the address changes), and the scroll is lost. This
    // runs when the list appears, including when a kept page is shown again.
    useEffect(() => {
        const list = window.location.hash === '#reports' ? document.getElementById('reports') : null;
        if (!list) return;

        // Already at the list, or partway down it (say, after the back button): stay put.
        const { top, bottom } = list.getBoundingClientRect();
        if (top <= parseFloat(getComputedStyle(list).scrollMarginTop) + 24 && bottom > 0) return;

        list.scrollIntoView({ behavior: 'instant' });
    }, []);

    // A new search or filter starts again at the first page.
    const filterBy = <T,>(set: (value: T) => void) => (value: T) => {
        set(value);
        setPage(0);
    };

    // Another page starts at the top of the list, with the keyboard focus on
    // its first card. "Showing 21 to 40 of 312 reports" is read out by itself
    // (aria-live), so focusing it would read it twice.
    const goTo = (next: number) => {
        flushSync(() => setPage(next));
        document.getElementById('reports')?.scrollIntoView({ behavior: 'instant' });
        list.current?.querySelector<HTMLElement>('.report-card')?.focus({ preventScroll: true });
    };

    const search = query.trim().toLowerCase();
    const visible = sorted.filter((report) => {
        if (status === 'late' ? !report.lateSince : status !== 'all' && report.status !== status) return false;
        if (category !== 'all' && report.category !== category) return false;
        if (!search) return true;

        return [report.title, report.description, report.owner, report.index, ...report.tags]
            .some((field) => field.toLowerCase().includes(search));
    });
    const shown = paginate(visible, page);
    // "Late" and "No runs yet" only when some report is.
    const statuses = STATUS_FILTERS.filter(({ value }) =>
        value === 'late' ? reports.some((report) => report.lateSince)
            : value !== 'none' || reports.some((report) => report.status === 'none'));

    return (
        <div className="flex flex-col gap-6">
            <div className="filters">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => filterBy(setQuery)(e.target.value)}
                    placeholder="Search by report, owner, index or tag"
                    aria-label="Search reports"
                />

                <div className="chips" role="group" aria-label="Filter by status">
                    {statuses.map(({ label, value }) => (
                        <button
                            key={value}
                            type="button"
                            className={status === value ? 'chip chip-active' : 'chip'}
                            aria-pressed={status === value}
                            onClick={() => filterBy(setStatus)(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="chips" role="group" aria-label="Filter by category">
                    {(['all', ...categories] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            className={category === value ? 'chip chip-active' : 'chip'}
                            aria-pressed={category === value}
                            onClick={() => filterBy(setCategory)(value)}
                        >
                            {value === 'all' ? 'All categories' : value}
                        </button>
                    ))}
                </div>
            </div>

            <p className="text-light-200 text-sm" aria-live="polite">
                {shown.pages > 1
                    ? `Showing ${formatNumber(shown.first)} to ${formatNumber(shown.last)} of ${formatNumber(visible.length)} ${visible.length < reports.length ? 'matching ' : ''}reports, newest run first`
                    : `Showing ${formatNumber(visible.length)} of ${formatNumber(reports.length)} reports`}
            </p>

            {shown.items.length > 0 ? (
                <ul ref={list} className="reports">
                    {shown.items.map((report) => (
                        <li key={report.slug} className="list-none">
                            <ReportCard report={report} />
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="empty-state">No reports match these filters.</p>
            )}

            {shown.pages > 1 && (
                <Pager
                    label="Report pages"
                    status={`Page ${shown.page + 1} of ${shown.pages}`}
                    announce={false}
                    canPrevious={shown.page > 0}
                    canNext={shown.page < shown.pages - 1}
                    onPrevious={() => goTo(shown.page - 1)}
                    onNext={() => goTo(shown.page + 1)}
                />
            )}
        </div>
    )
}

export default ReportBrowser
