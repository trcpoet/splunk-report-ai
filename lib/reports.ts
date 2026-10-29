// Report types and pure helpers shared by the app and the sync worker. Report
// data comes from MongoDB through lib/dal.ts; the dummy data the sync loads in
// fixture mode lives in lib/splunk/fixtures/reports.ts.

export type ReportStatus = 'success' | 'warning' | 'failed';

// 'Other' is for scheduled searches found in Splunk that lib/report-config.ts doesn't list yet.
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
};

export type SplunkReport = {
    slug: string;
    title: string;
    description: string;
    category: ReportCategory;
    app: string;
    owner: string;
    schedule: string;
    cron: string;
    runsPerWeek: number;
    timeRange: string;
    index: string;
    // Empty until the report's first run is synced.
    lastRun: string;
    nextRun: string;
    status: ReportStatus;
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

export type SyncInfo = {
    mode: 'fixture' | 'live';
    lastSuccessAt: string;
    lastError: string | null;
};

export type ReportSummary = Pick<
    SplunkReport,
    'slug' | 'title' | 'description' | 'category' | 'status' | 'schedule' | 'lastRun' | 'recipients' | 'history' | 'tags' | 'owner' | 'index'
>;

export const toSummary = ({ slug, title, description, category, status, schedule, lastRun, recipients, history, tags, owner, index }: ReportListItem): ReportSummary => ({
    slug, title, description, category, status, schedule, lastRun, recipients, history, tags, owner, index,
});

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

export const getReportStats = (reports: ReportListItem[]) => ({
    total: reports.length,
    needsAttention: reports.filter((report) => report.status !== 'success').length,
    emailsPerWeek: reports.reduce((sum, report) => sum + report.runsPerWeek * report.recipients.length, 0),
    recipients: new Set(reports.flatMap((report) => report.recipients)).size,
});
