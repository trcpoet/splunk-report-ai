'use client';

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Pager from "@/reports/components/Pager";
import ReportCard from "@/reports/components/ReportCard";
import { filtersToSearch, parseFilters, STATUS_FILTERS, type Filters } from "@/reports/filters";
import { formatNumber } from "@/shared/format";
import { paginate, sortByLastRun, type ReportCategory, type ReportSummary } from "@/reports/reports";

// The home page's report list: search and filters, newest last run first,
// REPORTS_PER_PAGE cards a page. The filters live in the address too
// (src/reports/filters.ts), so a filtered list can be shared, and coming back
// from a report finds it as it was.

// How long typing pauses before the address catches up. Browsers limit how
// often a page may change its address (Safari: 100 times in 10 seconds).
const TYPING_DELAY_MS = 300;

// The filters as their part of the address, to tell whether two agree.
const keyOf = (filters: Filters) => filtersToSearch('', filters);

const ReportBrowser = ({ reports, categories }: { reports: ReportSummary[]; categories: ReportCategory[] }) => {
    // The list keeps the filters in its own state, so a keystroke shows at
    // once, and writes them to the address (apply, below).
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState(() => parseFilters(searchParams, categories));
    const { query, status, category, page } = filters;
    const list = useRef<HTMLUListElement>(null);
    const pendingWrite = useRef<ReturnType<typeof setTimeout>>(undefined);

    // When something else changes the address (a link to /#reports, or Back),
    // the list follows it. What the list just wrote itself (`written`) isn't
    // followed, so an address update arriving late can't undo a keystroke.
    // Only on the list's own page: Next keeps this page, hidden, while a
    // report is open, and its address (with no filters) mustn't clear the
    // list that Back will show again.
    const pathname = usePathname();
    const [ownPath] = useState(pathname);
    const fromAddress = parseFilters(searchParams, categories);
    const addressKey = keyOf(fromAddress);
    const [seen, setSeen] = useState(addressKey);
    const [written, setWritten] = useState<string | null>(addressKey);
    if (pathname === ownPath && addressKey !== seen) {
        setSeen(addressKey);
        // A write of its own is ignored once, when the address shows it, so
        // Back to that address later still brings its filters back.
        setWritten(null);
        if (addressKey !== written && addressKey !== keyOf(filters)) setFilters(fromAddress);
    }

    // No address change after the list is gone: it would land on the next page.
    useEffect(() => () => clearTimeout(pendingWrite.current), []);
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

    // The address, replaced rather than pushed: typing a search shouldn't fill
    // the history, and Back from a report still comes back to this list as it
    // was. Next keeps useSearchParams in step. If the browser refuses (too
    // many changes too fast), the address catches up at the next change.
    const writeAddress = (next: Filters) => {
        const { pathname, search, hash } = window.location;
        // A write that waited for typing to pause, after a report was opened.
        if (pathname !== ownPath) return;
        const wanted = filtersToSearch(search, next);
        if (wanted === search) return;
        try {
            window.history.replaceState(null, '', `${pathname}${wanted}${hash}`);
            setWritten(keyOf(next));
        } catch {
            // Keep the list as it is; only the address lags.
        }
    };

    // The state at once; the address at once too, or after a pause in typing.
    const apply = (next: Filters, { typing = false } = {}) => {
        setFilters(next);
        clearTimeout(pendingWrite.current);
        if (typing) pendingWrite.current = setTimeout(() => writeAddress(next), TYPING_DELAY_MS);
        else writeAddress(next);
    };

    // A new search or filter starts again at the first page.
    const filterBy = (change: Partial<Omit<Filters, 'page'>>, options?: { typing?: boolean }) =>
        apply({ ...filters, ...change, page: 0 }, options);

    // Another page starts at the top of the list, with the keyboard focus on
    // its first card. "Showing 21 to 40 of 312 reports" is read out by itself
    // (aria-live), so focusing it would read it twice.
    const goTo = (next: number) => {
        flushSync(() => apply({ ...filters, page: next }));
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
    // "Late" and "No runs yet" only when some report is, or when the address
    // asked for one: its chip shows as chosen, so it can be turned off.
    const statuses = STATUS_FILTERS.filter(({ value }) =>
        value === status
        || (value === 'late' ? reports.some((report) => report.lateSince)
            : value !== 'none' || reports.some((report) => report.status === 'none')));

    return (
        <div className="flex flex-col gap-6">
            <div className="filters">
                <input
                    type="search"
                    value={query}
                    onChange={(e) => filterBy({ query: e.target.value }, { typing: true })}
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
                            onClick={() => filterBy({ status: value })}
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
                            onClick={() => filterBy({ category: value })}
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
