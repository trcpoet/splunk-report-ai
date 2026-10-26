'use client';

import { useEffect, useState } from "react";
import ReportCard from "@/components/ReportCard";
import type { ReportCategory, ReportStatus, ReportSummary } from "@/lib/reports";

const STATUS_FILTERS: { label: string; value: ReportStatus | 'all' }[] = [
    { label: 'All statuses', value: 'all' },
    { label: 'Healthy', value: 'success' },
    { label: 'Warning', value: 'warning' },
    { label: 'Failed', value: 'failed' },
];

const ReportBrowser = ({ reports, categories }: { reports: ReportSummary[]; categories: ReportCategory[] }) => {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<ReportStatus | 'all'>('all');
    const [category, setCategory] = useState<ReportCategory | 'all'>('all');

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

    const search = query.trim().toLowerCase();
    const visible = reports.filter((report) => {
        if (status !== 'all' && report.status !== status) return false;
        if (category !== 'all' && report.category !== category) return false;
        if (!search) return true;

        return [report.title, report.description, report.owner, report.index, ...report.tags]
            .some((field) => field.toLowerCase().includes(search));
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="filters">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by report, owner, index or tag"
                    aria-label="Search reports"
                />

                <div className="chips" role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map(({ label, value }) => (
                        <button
                            key={value}
                            type="button"
                            className={status === value ? 'chip chip-active' : 'chip'}
                            aria-pressed={status === value}
                            onClick={() => setStatus(value)}
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
                            onClick={() => setCategory(value)}
                        >
                            {value === 'all' ? 'All categories' : value}
                        </button>
                    ))}
                </div>
            </div>

            <p className="text-light-200 text-sm" aria-live="polite">
                Showing {visible.length} of {reports.length} reports
            </p>

            {visible.length > 0 ? (
                <ul className="reports">
                    {visible.map((report) => (
                        <li key={report.slug} className="list-none">
                            <ReportCard report={report} />
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="empty-state">No reports match these filters.</p>
            )}
        </div>
    )
}

export default ReportBrowser
