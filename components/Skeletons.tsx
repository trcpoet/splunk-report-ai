import type { ReactNode } from "react";

// Loading placeholders for content that streams in. Each one is built from the
// same classes as the content it stands for, so it takes up the same space and
// nothing moves when the content arrives. No fake data: just bars and blocks.

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

// One line of text, as tall as the text it stands for (its parent sets the
// font size), drawn as a bar.
const Line = ({ className = '' }: { className?: string }) => (
    <span className={`skeleton-line ${className}`}>&nbsp;</span>
)

// Screen readers hear the label; the bars have no text for them to read.
const Loading = ({ label, className, children }: { label: string; className?: string; children: ReactNode }) => (
    <div role="status" className={className}>
        <span className="sr-only">{label}</span>
        {children}
    </div>
)

const StatTile = () => (
    <div className="stat-tile">
        <Line className="label w-28" />
        <Line className="value w-16" />
        <Line className="note w-32" />
    </div>
)

// The four tiles, the "Data as of" line and the runs-per-day chart card.
export const OverviewSkeleton = () => (
    <Loading label="Loading the overview…">
        <div className="stats">
            {range(4).map((i) => <StatTile key={i} />)}
        </div>
        <p className="data-freshness"><Line className="w-48" /></p>
        <div className="mt-10">
            <div className="chart-card">
                <div className="flex flex-col gap-0.5">
                    <Line className="chart-heading w-48" />
                    <Line className="chart-subtitle w-64" />
                </div>
                <div className="skeleton-block h-[260px]" />
                <div className="text-sm"><Line className="w-28" /></div>
            </div>
        </div>
    </Loading>
)

const ReportCardSkeleton = () => (
    <li className="list-none">
        <div className="report-card pointer-events-none">
            <div className="flex flex-row items-center justify-between gap-2">
                <span className="skeleton-block h-6 w-24" />
                <span className="skeleton-block h-[22px] w-20 rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5">
                <p className="title"><Line className="w-4/5" /></p>
                <p className="description"><Line className="w-full" /><br /><Line className="w-2/3" /></p>
            </div>
            <div className="meta">
                {range(3).map((i) => <div key={i}><Line className="w-40" /></div>)}
            </div>
            <div className="run-history">
                <Line className="label w-16" />
                {range(7).map((i) => <span key={i} className="run skeleton-block" />)}
            </div>
        </div>
    </li>
)

// The search box, the two rows of filter chips, the count and two rows of cards.
export const ReportsSkeleton = () => (
    <Loading label="Loading reports…" className="flex flex-col gap-6">
        <div className="filters">
            <div className="skeleton-block h-[46px] w-full md:max-w-md" />
            <div className="chips">
                {['w-28', 'w-20', 'w-20', 'w-16'].map((width, i) => <span key={i} className={`skeleton-block h-[34px] rounded-full ${width}`} />)}
            </div>
            <div className="chips">
                {['w-32', 'w-20', 'w-24', 'w-28', 'w-24'].map((width, i) => <span key={i} className={`skeleton-block h-[34px] rounded-full ${width}`} />)}
            </div>
        </div>
        <p className="text-light-200 text-sm"><Line className="w-36" /></p>
        <ul className="reports">
            {range(6).map((i) => <ReportCardSkeleton key={i} />)}
        </ul>
    </Loading>
)

// The report header, highlight tiles, the results chart and table, and the
// sidebar with the details and delivery cards.
export const ReportSkeleton = () => (
    <Loading label="Loading the report…" className="flex flex-col gap-8">
        <div className="header">
            <div className="flex flex-row flex-wrap items-center gap-2">
                <span className="skeleton-block h-6 w-20" />
                <span className="skeleton-block h-[22px] w-20 rounded-full" />
            </div>
            <div className="text-4xl font-semibold max-sm:text-3xl w-full"><Line className="w-3/4" /></div>
            <p className="w-full"><Line className="w-full" /><br /><Line className="w-1/2" /></p>
        </div>

        <div className="highlights">
            {range(3).map((i) => <StatTile key={i} />)}
        </div>

        <div className="details">
            <div className="content">
                <div className="flex-col-gap-3">
                    <div className="text-2xl font-bold"><Line className="w-48" /></div>
                    <div className="chart-card">
                        <div className="flex flex-col gap-0.5">
                            <Line className="chart-heading w-56" />
                            <Line className="chart-subtitle w-72" />
                        </div>
                        <div className="skeleton-block h-[280px]" />
                    </div>
                    <div className="table-wrap">
                        <div className="flex flex-col gap-4 p-4">
                            {range(5).map((i) => <div key={i} className="text-sm"><Line className="w-full" /></div>)}
                        </div>
                    </div>
                </div>
            </div>

            <div className="sidebar">
                <div className="side-card">
                    <div className="text-2xl font-bold"><Line className="w-40" /></div>
                    <div className="flex flex-col gap-3 text-sm">
                        {range(7).map((i) => (
                            <div key={i} className="flex flex-row justify-between gap-4">
                                <Line className="w-20" />
                                <Line className="w-28" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="side-card">
                    <div className="text-2xl font-bold"><Line className="w-28" /></div>
                    <p className="text-sm"><Line className="w-full" /><br /><Line className="w-3/4" /></p>
                    <div className="flex flex-col gap-3">
                        <div className="skeleton-block h-11" />
                        <div className="skeleton-block h-11" />
                    </div>
                </div>
            </div>
        </div>
    </Loading>
)

// An Ask AI tab: the chat's heading, its intro and suggestions, the box to
// type in, and the side panel.
export const ChatSkeleton = () => (
    <Loading label="Loading the chat…" className="ai-workspace">
        <div className="chat">
            <div className="chat-head">
                <span className="chat-title"><Line className="w-28" /></span>
            </div>
            <div className="chat-intro">
                <p><Line className="w-full" /><br /><Line className="w-2/3" /></p>
                <div className="chips">
                    {['w-56', 'w-64', 'w-48'].map((width, i) => <span key={i} className={`skeleton-block h-[34px] rounded-full ${width}`} />)}
                </div>
            </div>
            <div className="composer">
                <div className="skeleton-block h-[58px] rounded-[10px]" />
                <p className="composer-notes"><Line className="w-72" /></p>
            </div>
        </div>
        <div className="ai-side">
            <span className="text-lg font-semibold"><Line className="w-40" /></span>
            <p><Line className="w-full" /><br /><Line className="w-1/2" /></p>
            <ul>
                {range(6).map((i) => <li key={i} className="text-sm py-2"><Line className="w-4/5" /></li>)}
            </ul>
        </div>
    </Loading>
)

// The History tab: the search box, the filter chips, the count and a few rows.
export const HistorySkeleton = () => (
    <Loading label="Loading your chats…" className="history">
        <div className="filters">
            <div className="skeleton-block h-[46px] w-full md:max-w-md" />
            <div className="chips">
                {['w-24', 'w-36', 'w-24'].map((width, i) => <span key={i} className={`skeleton-block h-[34px] rounded-full ${width}`} />)}
            </div>
        </div>
        <p className="text-light-200 text-sm"><Line className="w-36" /></p>
        <section className="history-group">
            <h2><Line className="w-16" /></h2>
            <ul>
                {range(4).map((i) => (
                    <li key={i} className="history-row">
                        <span className="history-icon skeleton-block" />
                        <span className="history-link">
                            <span className="history-title"><Line className="w-2/3" /></span>
                            <span className="history-preview"><Line className="w-full" /></span>
                            <span className="history-meta"><Line className="w-40" /></span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    </Loading>
)

// The briefing: its headline, a few flagged reports and the summary.
export const BriefingSkeleton = ({ variant = 'home' }: { variant?: 'home' | 'side' }) => (
    <Loading label="Loading the briefing…" className={`briefing briefing-${variant}`}>
        <span className="briefing-headline"><Line className="w-64" /></span>
        <div className="briefing-group">
            <span className="text-sm"><Line className="w-28" /></span>
            <ul>
                {range(2).map((i) => (
                    <li key={i}>
                        <span className="text-sm"><Line className="w-3/4" /></span>
                        <span className="text-sm"><Line className="w-full" /></span>
                    </li>
                ))}
            </ul>
        </div>
    </Loading>
)

// Holds the user menu's place in the navbar while the session is read, so the
// links next to it don't jump. Hidden on the sign-in page, which has no menu.
export const UserMenuSkeleton = () => (
    <div className="user-menu user-menu-placeholder" aria-hidden="true">
        <div className="who">
            <Line className="name w-24" />
            <Line className="groups w-28" />
        </div>
        <span className="sign-out text-transparent">Sign out</span>
    </div>
)
