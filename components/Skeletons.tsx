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

// A paragraph that's still being written: `count` lines, the last one shorter.
// Give it the text size of the paragraph it stands for.
export const SkeletonParagraph = ({ count, className = '' }: { count: number; className?: string }) => (
    <p className={className}>
        {range(count).map((i) => (
            <span key={i}><Line className={i === count - 1 ? 'w-2/3' : 'w-full'} /><br /></span>
        ))}
    </p>
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

// A chart card: its heading, its plot and the "Show as table" line.
const ChartCardSkeleton = ({ height }: { height: number }) => (
    <div className="chart-card">
        <div className="flex flex-col gap-0.5">
            <Line className="chart-heading w-48" />
            <Line className="chart-subtitle w-64" />
        </div>
        <div className="skeleton-block" style={{ height }} />
        <div className="text-sm"><Line className="w-28" /></div>
    </div>
)

// The four tiles, the "Data as of" line, the runs-per-day chart and the run
// health grid side by side, and the "When searches run" chart.
export const OverviewSkeleton = () => (
    <Loading label="Loading the overview…">
        <div className="stats">
            {range(4).map((i) => <StatTile key={i} />)}
        </div>
        <p className="data-freshness"><Line className="w-48" /></p>
        <div className="overview-charts">
            <ChartCardSkeleton height={260} />
            <ChartCardSkeleton height={260} />
        </div>
        <div className="mt-6">
            <ChartCardSkeleton height={220} />
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

// An Ask AI chat, as a new chat looks: the question in the middle, the box to
// type in under it, then the suggestions.
export const ChatSkeleton = () => (
    <Loading label="Loading the chat…" className="chat is-empty">
        <div className="chat-greeting">
            <div className="chat-greeting-title w-full"><Line className="w-3/4" /></div>
            <p className="w-full"><Line className="w-full" /><br /><Line className="w-1/2" /></p>
        </div>
        <div className="composer">
            <div className="skeleton-block h-[58px] rounded-[28px]" />
            <div className="chips suggestions">
                {['w-56', 'w-64', 'w-48'].map((width, i) => <span key={i} className={`skeleton-block h-[34px] rounded-full ${width}`} />)}
            </div>
            <p className="composer-notes"><Line className="w-72" /></p>
        </div>
    </Loading>
)

// The Ask AI sidebar while your chats are read: its two links and a few rows.
export const ChatListSkeleton = () => (
    <Loading label="Loading your chats…" className="ai-sidebar">
        <div className="sidebar-links">
            {['w-20', 'w-28'].map((width, i) => <span key={i} className="sidebar-link"><Line className={width} /></span>)}
        </div>
        <div className="sidebar-group">
            <span className="text-xs"><Line className="w-12" /></span>
            <ul>
                {['w-4/5', 'w-3/5', 'w-2/3', 'w-4/5', 'w-1/2'].map((width, i) => (
                    <li key={i} className="history-row compact"><span className="history-title w-full"><Line className={width} /></span></li>
                ))}
            </ul>
        </div>
    </Loading>
)

// The Searches panel while the reports are read.
export const PanelListSkeleton = () => (
    <Loading label="Loading the searches…" className="ai-panel-list">
        <p><Line className="w-72" /></p>
        <ul>
            {range(6).map((i) => <li key={i} className="text-sm py-2"><Line className="w-4/5" /></li>)}
        </ul>
    </Loading>
)

// The chats page: the search box, the filter chips, the count and a few rows.
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
            <h3><Line className="w-16" /></h3>
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
        <div className="briefing-head">
            <span className="briefing-headline"><Line className="w-64" /></span>
            {variant === 'side' && <span className="briefing-asof"><Line className="w-40" /></span>}
        </div>
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
