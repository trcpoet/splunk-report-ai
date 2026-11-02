import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import { formatCell, formatDuration, formatNumber, parseNumber } from '@/lib/format';
import type { ReportConfig, ResultSet, StatusRule } from '@/lib/report-config';
import { MAX_CHART_BARS, MAX_CHART_SERIES, type Cell, type ChartPanel, type ChartScatter, type ChartThreshold, type ChartType, type ReportCategory, type ReportChart, type ReportHighlight, type ReportStatus } from '@/lib/reports';
import type { JobContent, ResultsResponse, SavedSearchContent, SplunkBool, SplunkEntry } from './types';

// Pure functions that turn Splunk REST JSON into SplunkEvents' models. No I/O,
// so everything here can be unit tested.

export const toBool = (value: SplunkBool | undefined) => value === true || value === 1 || value === '1' || value === 'true';

// ---------------------------------------------------------------------------
// Results

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

// Splunk sends every value as a string, and multivalue fields as arrays.
// Strings like "007" or "192.0.2.1" stay strings.
export function toCell(value: unknown): Cell {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(String).join(', ');

    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return NUMBER.test(text) ? Number(text) : text;
}

export type ResultTable = { columns: string[]; rows: Cell[][] };

// Keeps _time and drops Splunk's other internal fields (_raw, _cd, _bkt, ...).
export function mapResults(response: ResultsResponse): ResultTable {
    const results = response.results ?? [];
    const names = response.fields?.length
        ? response.fields.map((field) => (typeof field === 'string' ? field : field.name))
        : Object.keys(results[0] ?? {});
    const columns = names.filter((name) => name === '_time' || !name.startsWith('_'));

    return { columns, rows: results.map((result) => columns.map((column) => toCell(result[column]))) };
}

// ---------------------------------------------------------------------------
// Schedules and time ranges

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

const isNumber = (field: string) => /^\d+$/.test(field);
const stepOf = (field: string) => field.match(/^\*\/(\d+)$/)?.[1];
const pad = (field: string) => field.padStart(2, '0');

// Short phrasing for the schedules Splunk users pick most often, cronstrue for the rest.
export function describeCron(cron: string, timeZone = 'UTC') {
    const fields = cron.trim().split(/\s+/);
    // With exactly five fields, none of these defaults is used.
    const [minute = '', hour = '', dayOfMonth, month, dayOfWeek = ''] = fields;

    if (fields.length === 5 && dayOfMonth === '*' && month === '*') {
        const at = `${pad(hour)}:${pad(minute)} ${timeZone}`;
        const minuteStep = stepOf(minute);
        const hourStep = stepOf(hour);

        if (dayOfWeek === '*') {
            if (isNumber(minute) && isNumber(hour)) return `Daily at ${at}`;
            if (hour === '*' && minuteStep) return minuteStep === '1' ? 'Every minute' : `Every ${minuteStep} minutes`;
            if (hour === '*' && minute === '0') return 'Every hour';
            if (hour === '*' && isNumber(minute)) return `Every hour at :${pad(minute)}`;
            if (minute === '0' && hourStep) return hourStep === '1' ? 'Every hour' : `Every ${hourStep} hours`;
        } else if (isNumber(dayOfWeek) && isNumber(minute) && isNumber(hour)) {
            return `Weekly on ${DAYS[Number(dayOfWeek) % 7]} at ${at}`;
        }
    }

    try {
        return `${cronstrue.toString(cron, { use24HourTimeFormat: true })} (${timeZone})`;
    } catch {
        return cron;
    }
}

const WEEK_MS = 7 * 86_400_000;
// A fixed Monday, so the count doesn't depend on when the sync runs.
const WEEK_START = Date.UTC(2024, 0, 1);

export function runsPerWeek(cron: string, timeZone = 'UTC') {
    try {
        const job = new Cron(cron, { timezone: timeZone, paused: true });
        let count = 0;

        for (let next = job.nextRun(new Date(WEEK_START - 1)); next && next.getTime() < WEEK_START + WEEK_MS; next = job.nextRun(next)) {
            count++;
        }

        return count;
    } catch {
        return 0;
    }
}

function nextRunFromCron(cron: string, timeZone: string, after: Date) {
    try {
        return new Cron(cron, { timezone: timeZone, paused: true }).nextRun(after);
    } catch {
        return null;
    }
}

// Splunk formats times like "2026-10-03 06:00:00 UTC".
export function parseSplunkTime(value: string | undefined): Date | null {
    if (!value) return null;

    const direct = Date.parse(value);
    if (!Number.isNaN(direct)) return new Date(direct);

    const utc = Date.parse(value.replace(' ', 'T').replace(/ UTC$/, 'Z'));
    return Number.isNaN(utc) ? null : new Date(utc);
}

const TIME_UNITS: Record<string, [singular: string, plural: string]> = {
    s: ['second', 'seconds'],
    m: ['minute', 'minutes'],
    min: ['minute', 'minutes'],
    h: ['hour', 'hours'],
    d: ['day', 'days'],
    w: ['week', 'weeks'],
    mon: ['month', 'months'],
    y: ['year', 'years'],
};

// dispatch.earliest_time / dispatch.latest_time → "Last 24 hours", "Yesterday", ...
export function describeTimeRange(earliest = '', latest = '') {
    const untilNow = latest === '' || latest === 'now';

    if (earliest === '-1d@d' && latest === '@d') return 'Yesterday';
    if (earliest === '@d' && untilNow) return 'Today';
    if ((earliest === '' || earliest === '0') && untilNow) return 'All time';

    const [, amount, unitName = ''] = earliest.match(/^-(\d+)([a-z]+)$/) ?? [];
    const unit = TIME_UNITS[unitName];
    if (amount && unit && untilNow) return `Last ${amount} ${amount === '1' ? unit[0] : unit[1]}`;

    return `${earliest} to ${latest || 'now'}`;
}

const valuesOf = (spl: string, field: string) =>
    [...spl.matchAll(new RegExp(`\\b${field}\\s*=\\s*("[^"]*"|[^\\s|)]+)`, 'gi'))].map(([, value = '']) => value.replace(/^"|"$/g, ''));

// "index=web sourcetype=access_combined" → "web (access_combined)".
export function describeIndexes(spl: string) {
    const indexes = [...new Set(valuesOf(spl, 'index'))];
    const sourcetypes = [...new Set(valuesOf(spl, 'sourcetype'))];

    if (indexes.length === 0) return '';
    if (indexes.includes('*')) return 'All indexes';
    if (indexes.length === 1 && sourcetypes.length === 1) return `${indexes[0]} (${sourcetypes[0]})`;
    return indexes.join(', ');
}

// ---------------------------------------------------------------------------
// Recipients and access

export const parseRecipients = (to = '') =>
    [...new Set(to.split(/[,;\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];

// The email lists a report went to are the groups that may see it:
// secops@example.com → secops.
export const groupsFromRecipients = (recipients: string[]) =>
    [...new Set(recipients.map((email) => email.split('@')[0] ?? '').filter(Boolean))];

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Saved searches

const CHART_TYPES: Record<string, ChartType> = { bar: 'bar', column: 'column', line: 'line', area: 'area' };

// The chart the report's author picked in Splunk, or null for a table.
// Other Splunk chart types (pie, scatter, ...) fall back to columns.
function chartTypeFromDisplay(content: SavedSearchContent): ChartType | null {
    if (content['display.general.type'] !== 'visualizations') return null;
    if (content['display.visualizations.show'] !== undefined && !toBool(content['display.visualizations.show'])) return null;
    if ((content['display.visualizations.type'] ?? 'charting') !== 'charting') return null;

    return CHART_TYPES[content['display.visualizations.charting.chart'] ?? ''] ?? 'column';
}

export type ReportMeta = {
    slug: string;
    splunk: { name: string; app: string; appLabel: string; owner: string; sharing: string; readRoles: string[] };
    title: string;
    description: string;
    spl: string;
    cron: string;
    schedule: string;
    runsPerWeek: number;
    timeRange: string;
    index: string;
    recipients: string[];
    category: ReportCategory;
    tags: string[];
    allowedGroups: string[];
    chartType: ChartType | null;
    nextRun: Date | null;
    disabled: boolean;
};

type SavedSearchOptions = {
    config?: ReportConfig;
    appLabels: Record<string, string>;
    timeZone: string;
    now: Date;
};

export function mapSavedSearch(entry: SplunkEntry<SavedSearchContent>, { config, appLabels, timeZone, now }: SavedSearchOptions): ReportMeta {
    const { content, acl } = entry;
    const cron = content.cron_schedule ?? '';
    const recipients = parseRecipients(content['action.email.to']);
    const app = acl?.app ?? 'search';

    return {
        slug: config?.slug ?? slugify(entry.name),
        splunk: {
            name: entry.name,
            app,
            appLabel: appLabels[app] ?? app,
            owner: acl?.owner ?? 'nobody',
            sharing: acl?.sharing ?? 'user',
            readRoles: acl?.perms?.read ?? [],
        },
        title: entry.name,
        description: content.description ?? '',
        spl: content.search.trim(),
        cron,
        schedule: describeCron(cron, timeZone),
        runsPerWeek: runsPerWeek(cron, timeZone),
        timeRange: describeTimeRange(content['dispatch.earliest_time'], content['dispatch.latest_time']),
        index: config?.index ?? describeIndexes(content.search),
        recipients,
        category: config?.category ?? 'Other',
        tags: config?.tags ?? [],
        // Reports missing from report-config are admin-only until someone adds
        // them. So is a private search with a configured name: its owner decides
        // what it runs, so it can't take on the report's groups.
        allowedGroups: config && acl?.sharing !== 'user' ? (config.groups ?? groupsFromRecipients(recipients)) : [],
        chartType: config?.chart === 'none' ? null : (config?.chart?.type ?? chartTypeFromDisplay(content)),
        nextRun: parseSplunkTime(content.next_scheduled_time) ?? nextRunFromCron(cron, timeZone, now),
        disabled: toBool(content.disabled),
    };
}

// ---------------------------------------------------------------------------
// Runs

export type RunFacts = {
    sid: string;
    reportSlug: string;
    runAt: Date;
    dispatchState: string;
    status: ReportStatus;
    statusMessage?: string;
    durationSec: number;
    resultCount: number;
    hasResults: boolean;
    resultsExpired: boolean;
    truncated: boolean;
    columns: string[];
    rows: Cell[][];
};

export const isFinished = (job: JobContent) => toBool(job.isDone) || job.dispatchState === 'DONE' || job.dispatchState === 'FAILED';

export const isFailed = (job: JobContent) => toBool(job.isFailed) || job.dispatchState === 'FAILED';

function jobMessages(messages: JobContent['messages'], types: string[]) {
    if (!messages) return [];

    const list = Array.isArray(messages)
        ? messages
        : Object.entries(messages).flatMap(([type, texts]) => texts.map((text) => ({ type, text })));

    return list.filter((message) => types.includes(message.type.toUpperCase())).map((message) => message.text);
}

// A run's status comes from, in order: the job's state, the report's status
// rule (only when its results are available), then any warnings on the job.
export function runStatus(job: JobContent, results: ResultSet | null, rule?: StatusRule): { status: ReportStatus; statusMessage?: string } {
    if (isFailed(job)) {
        return { status: 'failed', statusMessage: jobMessages(job.messages, ['FATAL', 'ERROR']).join(' ') || 'The search failed.' };
    }

    const ruled = results && rule ? rule(results) : null;
    if (ruled) return { status: ruled.status, statusMessage: ruled.message };

    const warnings = jobMessages(job.messages, ['WARN', 'ERROR']);
    if (warnings.length > 0) return { status: 'warning', statusMessage: warnings.join(' ') };

    return { status: 'success' };
}

// Scheduled sids end in "_at_<epoch seconds>_<n>": the time the scheduler ran it.
function runTime(sid: string, published?: string) {
    const scheduled = sid.match(/_at_(\d+)_\d+$/)?.[1];
    if (scheduled) return new Date(Number(scheduled) * 1000);

    const time = published ? Date.parse(published) : Number.NaN;
    return Number.isNaN(time) ? null : new Date(time);
}

type RunInput = {
    reportSlug: string;
    job: SplunkEntry<JobContent>;
    results: ResultTable | null;
    resultsExpired: boolean;
    rule?: StatusRule;
};

export function mapRun({ reportSlug, job, results, resultsExpired, rule }: RunInput): RunFacts {
    const sid = job.content.sid ?? job.name;
    const resultCount = Number(job.content.resultCount) || 0;

    return {
        sid,
        reportSlug,
        runAt: runTime(sid, job.published) ?? new Date(),
        dispatchState: job.content.dispatchState,
        ...runStatus(job.content, results && { ...results, resultCount }, rule),
        durationSec: Math.round(Number(job.content.runDuration) || 0),
        resultCount,
        hasResults: results !== null,
        resultsExpired,
        truncated: results !== null && results.rows.length < resultCount,
        columns: results?.columns ?? [],
        rows: results?.rows ?? [],
    };
}

// ---------------------------------------------------------------------------
// Fields derived from stored runs

type RunSummary = Pick<RunFacts, 'sid' | 'runAt' | 'status' | 'statusMessage' | 'durationSec' | 'resultCount'>;
type ResultsRun = RunSummary & Pick<RunFacts, 'columns' | 'rows'>;

const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

type ChartOptions = { y?: string; threshold?: ChartThreshold; max?: number; panels?: ChartPanel[]; scatter?: ChartScatter };

// At least 80% of the column's filled cells read as numbers, including text such
// as "$1,234". Live results have gaps: a timechart leaves a host's quiet hours empty.
const isNumericColumn = (table: ResultTable, column: string) => {
    const index = table.columns.indexOf(column);
    if (index < 0) return false;

    const filled = table.rows.map((row) => row[index]).filter((cell) => cell !== '');
    return filled.length > 0 && filled.filter((cell) => parseNumber(cell) !== null).length / filled.length >= 0.8;
};

const columnTotal = (table: ResultTable, column: string) => {
    const index = table.columns.indexOf(column);
    return table.rows.reduce((total, row) => total + (parseNumber(row[index]) ?? 0), 0);
};

// What timechart calls the series past its limit, and events with no value.
// They aren't hosts, so they join the "Other" line instead of taking a color.
const SPLUNK_ROLLUPS = new Set(['OTHER', 'NULL']);

// The columns that get a line: all of them, or if there are too many, the
// largest, leaving room for the "Other" line. They stay in the results' order.
function chartSeries(table: ResultTable, measures: string[]) {
    const named = measures.filter((measure) => !SPLUNK_ROLLUPS.has(measure));
    if (named.length === 0) return measures;
    if (named.length === measures.length && named.length <= MAX_CHART_SERIES) return named;

    const largest = [...named].sort((a, b) => columnTotal(table, b) - columnTotal(table, a)).slice(0, MAX_CHART_SERIES - 1);
    return named.filter((measure) => largest.includes(measure));
}

// x is the first column; y is the configured measure or the first numeric
// column. A configured threshold and max carry over unchanged. Panels and the
// scatter are kept only when their measures are numeric columns of this run.
//
// Results over time (Splunk's timechart) draw as lines when they have several
// measures, or more points than bars can show, whatever chart the search saved.
export function resolveChart(type: ChartType | null, table: ResultTable, { y, threshold, max, panels, scatter }: ChartOptions = {}): ReportChart | null {
    const x = table.columns[0];
    if (!type || x === undefined || table.columns.length < 2 || table.rows.length === 0) return null;

    const measures = table.columns.slice(1).filter((column) => isNumericColumn(table, column));
    const measure = y && table.columns.includes(y) ? y : measures[0];
    if (!measure) return null;

    const overTime = x === '_time';
    const series = overTime && !y && measures.length > 1 ? chartSeries(table, measures) : undefined;
    const tooManyBars = overTime && (type === 'bar' || type === 'column') && table.rows.length > MAX_CHART_BARS;
    const shownPanels = panels?.filter((panel) => isNumericColumn(table, panel.y)) ?? [];
    const showScatter = scatter && isNumericColumn(table, scatter.x) && isNumericColumn(table, measure);

    return {
        type: series || tooManyBars ? 'line' : type,
        x,
        y: measure,
        ...(threshold ? { threshold } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(shownPanels.length > 0 ? { panels: shownPanels } : {}),
        ...(showScatter ? { scatter } : {}),
        ...(series ? { series } : {}),
    };
}

type HighlightInput = ResultSet & {
    previousResultCount?: number;
    // Result counts of the recent runs that finished, oldest first.
    resultTrend?: number[];
    durationSec: number;
    chart: ReportChart | null;
};

const changeNote = (delta: number) =>
    delta === 0 ? 'Same as the previous run' : `${delta > 0 ? '+' : '-'}${formatNumber(Math.abs(delta))} vs. previous run`;

// Result count with the change since the previous run and a sparkline of the
// recent runs, the top row by the charted measure, and how long the search took.
function defaultHighlights({ columns, rows, resultCount, previousResultCount, resultTrend, durationSec, chart }: HighlightInput): ReportHighlight[] {
    const highlights: ReportHighlight[] = [{
        label: 'Results',
        value: formatNumber(resultCount),
        note: previousResultCount === undefined ? undefined : changeNote(resultCount - previousResultCount),
        ...(resultTrend && resultTrend.length > 1 ? { trend: resultTrend } : {}),
    }];

    // The busiest moment of a time series isn't a "top" row worth a tile.
    if (chart && chart.x !== '_time') {
        const x = columns.indexOf(chart.x);
        const y = columns.indexOf(chart.y);
        const value = (row: Cell[]) => parseNumber(row[y]) ?? Number.NEGATIVE_INFINITY;
        const top = rows.reduce<Cell[] | undefined>((max, row) => (!max || value(row) > value(max) ? row : max), undefined);

        if (top) highlights.push({ label: `Top ${lowerFirst(chart.x)}`, value: String(top[x] ?? ''), note: `${chart.y}: ${formatCell(top[y])}` });
    }

    highlights.push({ label: 'Search time', value: formatDuration(durationSec) });
    return highlights;
}

type DeriveInput = {
    // Newest first.
    recent: RunSummary[];
    resultsRun: ResultsRun | null;
    chartType: ChartType | null;
    config?: ReportConfig;
};

export function deriveReportFields({ recent, resultsRun, chartType, config }: DeriveInput) {
    const summary = ({ sid, runAt, status, durationSec, resultCount }: RunSummary) => ({ sid, runAt, status, durationSec, resultCount });
    const latest = recent[0];

    if (!resultsRun) {
        return {
            latest: latest ? { ...summary(latest), statusMessage: latest.statusMessage } : null,
            history: recent.map(summary).reverse(),
            results: null,
            chart: null,
            highlights: [],
        };
    }

    const chart = resolveChart(chartType, resultsRun, config?.chart === 'none' ? undefined : config?.chart);
    const previous = recent.find((run) => run.runAt < resultsRun.runAt && run.status !== 'failed');
    const resultTrend = recent.filter((run) => run.status !== 'failed').map((run) => run.resultCount).reverse();
    const highlightRule: (input: HighlightInput) => ReportHighlight[] = config?.highlights ?? defaultHighlights;

    return {
        latest: latest ? { ...summary(latest), statusMessage: latest.statusMessage } : null,
        history: recent.map(summary).reverse(),
        results: { sid: resultsRun.sid, runAt: resultsRun.runAt, resultCount: resultsRun.resultCount },
        chart,
        highlights: highlightRule({
            columns: resultsRun.columns,
            rows: resultsRun.rows,
            resultCount: resultsRun.resultCount,
            previousResultCount: previous?.resultCount,
            resultTrend,
            durationSec: resultsRun.durationSec,
            chart,
        }),
    };
}
