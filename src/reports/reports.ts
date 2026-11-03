import { formatDateTime } from '@/shared/format';
import type { IconName } from '@/reports/icons';

// Report types and pure helpers shared by the app and the sync worker. Report
// data comes from MongoDB through src/reports/dal.ts; the dummy data the sync loads in
// fixture mode lives in src/splunk/fixtures/reports.ts.

export type ReportStatus = 'success' | 'warning' | 'failed';

// What a report shows: its newest run's status, or 'none' until a run is stored.
export type ReportHealth = ReportStatus | 'none';

// 'Other' is for scheduled searches found in Splunk that have no card in config/report-cards.yaml yet.
export type ReportCategory = 'Security' | 'Operations' | 'Infrastructure' | 'Business' | 'Compliance' | 'Other';

export type RunRecord = {
    runAt: string;
    status: ReportStatus;
    durationSec: number;
    resultCount: number;
};

export type ReportHighlight = {
    label: string;
    value: string;
    note?: string;
    // How much of a limit is used, where 1 is the limit (more is over it). Shown as a meter.
    meter?: number;
    // Recent values, oldest first. Shown as a sparkline.
    trend?: number[];
};

// One cell of a results table. Splunk sends strings; numbers are converted.
export type Cell = string | number;

export type ChartType = 'bar' | 'column' | 'line' | 'area';

// The most a chart draws; the results table has every row. Beyond this many
// bars can't be read, and 5,000 rows would make a chart 180,000px tall.
export const MAX_CHART_BARS = 25;
export const MAX_CHART_POINTS = 500;

// The most lines on a chart: the validated chart colors (--chart-1 to --chart-5).
export const MAX_CHART_SERIES = 5;

// A limit drawn across a chart, such as an error budget. Values past it are highlighted.
export type ChartThreshold = {
    value: number;
    label: string;
};

// One small chart among several, each plotting another measure of the same rows.
export type ChartPanel = {
    y: string;
    threshold?: ChartThreshold;
};

// A dot per row, placed by the chart's measure (up) and another measure
// (across), and labeled with the chart's x column. It shows what one measure
// can't, such as many failures coming from a single source.
export type ChartScatter = {
    x: string;
    // A log scale across, for a measure that runs from 1 into the thousands.
    log?: boolean;
    // How to read the dots.
    caption: string;
};

// x and y are column names from the report's results.
export type ReportChart = {
    type: ChartType;
    x: string;
    y: string;
    threshold?: ChartThreshold;
    // The most the measure can be, such as 100 for a percentage. Bars then fill
    // a track up to it, like meters.
    max?: number;
    // Small multiples: one small chart per measure, with the rows in the same
    // order in each, in place of the single chart. Never one chart with two y-axes.
    panels?: ChartPanel[];
    // A second chart, drawn below the first.
    scatter?: ChartScatter;
    // Over time with several measures (Splunk's `timechart ... BY host`): one
    // line per column here, in the results' order. Any other numeric columns add
    // up to one "Other" line.
    series?: string[];
};

export type SplunkReport = {
    slug: string;
    title: string;
    description: string;
    category: ReportCategory;
    // The card's icon, or the app's guess (src/reports/icons.ts).
    icon: IconName;
    app: string;
    owner: string;
    schedule: string;
    cron: string;
    runsPerWeek: number;
    timeRange: string;
    index: string;
    // From the card: a link to what to do when it warns or fails, and who to ask.
    runbook?: string;
    contact?: string;
    // Empty until the report's first run is synced.
    lastRun: string;
    nextRun: string;
    status: ReportHealth;
    statusMessage?: string;
    // Results of the run whose rows are shown (it can be more than the rows).
    resultCount: number;
    recipients: string[];
    tags: string[];
    spl: string;
    highlights: ReportHighlight[];
    // null shows the results as a table only.
    chart: ReportChart | null;
    // When the shown rows were produced. Older than lastRun if the last run failed.
    resultsRunAt: string | null;
    columns: string[];
    rows: Cell[][];
    // The newest runs, oldest first.
    history: RunRecord[];
    // What the ML job (ml/score.py) said about the newest run, once it has scored it.
    modelRun?: ModelRun;
    // Learned by the ML job from the "Worth flagging?" votes, once there are
    // enough: the chance that a flag on this report is worth someone's attention.
    attention?: number;
};

// The ML job's view of one run. See docs/ml.md.
export type ModelRun = {
    // 0 is a typical run, 1 the most unusual of all the runs the job scored.
    score: number;
    // Among the 5% of runs that differ most.
    unusual: boolean;
    // How it compares with its usual, in plain words.
    reason: string;
    // The measure that stands out more. Null for a failed run, or one with too
    // few earlier runs to compare with.
    measure: 'results' | 'duration' | null;
};

// A report without its result rows, for lists.
export type ReportListItem = Omit<SplunkReport, 'columns' | 'rows'>;

// Runs per day by outcome, for the overview chart. day is YYYY-MM-DD (UTC).
export type RunOutcomeDay = {
    day: string;
    success: number;
    warning: number;
    failed: number;
};

export type OutcomeCounts = Omit<RunOutcomeDay, 'day'>;

// One report in the run health grid: its runs by outcome on each day, or null
// for a day it didn't run.
export type RunHealthRow = {
    slug: string;
    title: string;
    cells: (OutcomeCounts | null)[];
};

// The run health grid on the home page. days are YYYY-MM-DD (UTC), oldest first.
export type RunHealth = {
    days: string[];
    rows: RunHealthRow[];
};

export type SyncInfo = {
    mode: 'fixture' | 'live';
    // Empty until a sync has finished.
    lastSuccessAt: string;
    lastError: string | null;
    // The time zone the schedules run in: the sync worker's SPLUNK_TZ.
    timeZone: string;
};

// A report card's headline: the report's first highlight from its newest
// results, such as "Overall error rate 0.93%, Budget: 2%". `from` is set when
// those results are older than the last run (it failed, or its results
// expired), so the card can say the number is from an earlier run.
export type ReportHeadline = Pick<ReportHighlight, 'label' | 'value' | 'note'> & { from?: string };

export type ReportSummary = Pick<
    SplunkReport,
    'slug' | 'title' | 'description' | 'category' | 'icon' | 'status' | 'schedule' | 'lastRun' | 'recipients' | 'history' | 'tags' | 'owner' | 'index'
> & {
    // null until the report has results.
    headline: ReportHeadline | null;
};

const headlineOf = ({ highlights, resultsRunAt, lastRun }: Pick<ReportListItem, 'highlights' | 'resultsRunAt' | 'lastRun'>): ReportHeadline | null => {
    const [first] = highlights;
    if (!first) return null;
    return {
        label: first.label,
        value: first.value,
        ...(first.note ? { note: first.note } : {}),
        ...(resultsRunAt && resultsRunAt !== lastRun ? { from: resultsRunAt } : {}),
    };
};

export const toSummary = (report: ReportListItem): ReportSummary => {
    const { slug, title, description, category, icon, status, schedule, lastRun, recipients, history, tags, owner, index } = report;
    return { slug, title, description, category, icon, status, schedule, lastRun, recipients, history, tags, owner, index, headline: headlineOf(report) };
};

// The newest last run first, reports with no run yet last, and reports that
// ran at the same time by title. This is the order of the report list.
export function sortByLastRun<T extends Pick<ReportListItem, 'lastRun' | 'title'>>(reports: T[]): T[] {
    const time = ({ lastRun }: T) => {
        const at = Date.parse(lastRun);
        return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
    };
    return reports.toSorted((a, b) => (time(a) === time(b) ? a.title.localeCompare(b.title) : time(b) - time(a)));
}

// How many report cards a page of the list shows.
export const REPORTS_PER_PAGE = 20;

// One page of a list, where page 0 is the first. A page past the end shows the
// last one, so a filter that shortens the list never leaves an empty page.
// first and last count from 1, for "Showing 21 to 40 of 312".
export function paginate<T>(items: T[], page: number, size = REPORTS_PER_PAGE) {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const index = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
    const start = index * size;
    return {
        items: items.slice(start, start + size),
        page: index,
        pages,
        first: start + 1,
        last: Math.min(start + size, items.length),
        total: items.length,
    };
}

const CATEGORY_ORDER: ReportCategory[] = ['Security', 'Operations', 'Infrastructure', 'Business', 'Compliance', 'Other'];

// The categories in use, in a fixed order so the filter chips don't move around.
export const getCategories = (reports: ReportListItem[]): ReportCategory[] =>
    CATEGORY_ORDER.filter((category) => reports.some((report) => report.category === category));

// Reports in the same category or sharing a tag, most overlap first. Pass only
// the reports the viewer may see.
export const getSimilarReports = (report: ReportListItem, reports: ReportListItem[], limit = 3) =>
    reports
        .filter((other) => other.slug !== report.slug)
        .map((other) => ({
            other,
            score: (other.category === report.category ? 2 : 0) + other.tags.filter((tag) => report.tags.includes(tag)).length,
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ other }) => other);

// A report needs attention when its latest run warns or failed. The home
// page's count, the briefing and Ask AI's Reports button all use this.
export const needsAttention = (report: Pick<ReportListItem, 'status'>) => report.status === 'warning' || report.status === 'failed';

// A card's runbook as a link the page can draw: only an http(s) address. The
// cards schema already refuses anything else; this keeps a javascript: link
// that reached the database some other way from becoming a link.
export function webLink(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const { protocol, href } = new URL(url);
        return protocol === 'https:' || protocol === 'http:' ? href : undefined;
    } catch {
        return undefined;
    }
}

// A contact that is just an email address, which the page turns into a mail
// link. Anything else ("SRE on-call, #sre-alerts") is shown as text. Plain
// address characters only, so nothing can add ?subject= or other mail fields.
export const contactEmail = (contact: string | undefined): string | undefined =>
    contact && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(contact) ? contact : undefined;

const HOUR_MS = 3_600_000;

// Why the reports may be out of date, for the home page. Dummy data doesn't
// change, so only live data can go stale. On the default 15-minute schedule, 2
// hours means several syncs in a row didn't happen. Slower schedules set their
// own limit (SYNC_STALE_HOURS).
export function syncProblem({ mode, lastSuccessAt, lastError }: SyncInfo, now: number, staleHours = 2): string | null {
    if (lastError) return 'The last sync had problems, so some reports may be out of date.';
    if (mode === 'live' && lastSuccessAt && now - Date.parse(lastSuccessAt) > staleHours * HOUR_MS) {
        return `No new data since ${formatDateTime(lastSuccessAt)}. The sync may have stopped.`;
    }
    return null;
}

export const getReportStats = (reports: ReportListItem[]) => ({
    total: reports.length,
    needsAttention: reports.filter(needsAttention).length,
    emailsPerWeek: reports.reduce((sum, report) => sum + report.runsPerWeek * report.recipients.length, 0),
    recipients: new Set(reports.flatMap((report) => report.recipients)).size,
});
