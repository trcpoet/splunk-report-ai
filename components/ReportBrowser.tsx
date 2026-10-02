'use client';

import { useState } from "react";
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
