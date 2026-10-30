import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { MlReportScore, MlRunScore, Report, ReportRun, SyncState, SYNC_STATE_ID, UserAccess, type IMlReportScore, type IMlRunScore, type IReport } from '@/database';
import { canView, type Viewer } from '@/lib/access';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import type { Cell, ChartThreshold, ModelRun, ReportChart, ReportHighlight, ReportListItem, RunHealth, RunOutcomeDay, SplunkReport, SyncInfo } from '@/lib/reports';
import { lastDays, runHealthRows, totalsByDay, type RunCount } from '@/lib/run-health';
import { scheduleLoad, type ScheduleLoad } from '@/lib/schedule-load';

// The data access layer: pages and API routes get report data only from here,
// and every exported function checks who is asking. proxy.ts merely redirects
// visitors without a session cookie; it isn't what keeps data private.
//
// The cached loaders below aren't exported. They hold every report, shared by
// all viewers, and the exported functions filter them for the signed-in user.
// The sync worker clears them through /api/revalidate (tag 'reports').

// ---------------------------------------------------------------------------
// Who is asking

// The signed-in user and the groups that decide what they see, or null.
//
// 'use cache: private' keeps the result in this user's browser for a few
// minutes and never stores it on the server. That lets the page shells Next
// prefetches carry the user's own reports, so moving between pages shows them
// at once. Signing in or out reloads the page, which clears it.
export async function getViewerOrNull(): Promise<Viewer | null> {
    'use cache: private';
    cacheLife('minutes');

    // The app's connection opens while Better Auth looks up the session, so a
    // cold start waits for one connection setup instead of two in a row. It's
    // awaited only once there is a session: signed-out visitors don't need it.
    const connected = connectDB();
    connected.catch(() => {});
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;

    await connected;
    const access = await UserAccess.findOne({ email: session.user.email.toLowerCase() }).lean();

    // No access record means no groups: the user sees nothing until one is added.
    return {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: access?.role ?? 'viewer',
        groups: access?.groups ?? [],
    };
}

// For pages: sends signed-out visitors to /login.
export const getViewer = cache(async (): Promise<Viewer> => {
    const viewer = await getViewerOrNull();
    if (!viewer) redirect('/login');
    return viewer;
});

// ---------------------------------------------------------------------------
// Cached loaders (not exported)

type StoredReport = {
    report: ReportListItem;
    allowedGroups: string[];
    resultsSid: string | null;
};

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : '');

// Only the fields that are set, as plain values.
const toHighlight = ({ label, value, note, meter, trend }: ReportHighlight): ReportHighlight => ({
    label,
    value,
    ...(note ? { note } : {}),
    ...(typeof meter === 'number' ? { meter } : {}),
    ...(trend && trend.length > 0 ? { trend: [...trend] } : {}),
});

const toThreshold = ({ value, label }: ChartThreshold): ChartThreshold => ({ value, label });

const toChart = ({ type, x, y, threshold, max, panels, scatter }: ReportChart): ReportChart => ({
    type,
    x,
    y,
    ...(threshold ? { threshold: toThreshold(threshold) } : {}),
    ...(typeof max === 'number' ? { max } : {}),
    ...(panels && panels.length > 0
        ? { panels: panels.map((panel) => ({ y: panel.y, ...(panel.threshold ? { threshold: toThreshold(panel.threshold) } : {}) })) }
        : {}),
    ...(scatter ? { scatter: { x: scatter.x, caption: scatter.caption, ...(scatter.log ? { log: true } : {}) } } : {}),
});

// What the ML job (ml/score.py) said about each report's newest run, and what
// it learned from the votes, by slug. Both are empty until the job has run.
type ModelScores = { runs: Map<string, IMlRunScore>; attention: Map<string, number> };

async function loadModelScores(docs: IReport[]): Promise<ModelScores> {
    const newest = docs.flatMap((doc) => (doc.latest ? [{ reportSlug: doc.slug, runAt: doc.latest.runAt }] : []));
    const [runs, reports] = await Promise.all([
        newest.length > 0 ? MlRunScore.find({ $or: newest }).lean<IMlRunScore[]>() : [],
        MlReportScore.find({}).lean<IMlReportScore[]>(),
    ]);
    return {
        runs: new Map(runs.map((run) => [run.reportSlug, run])),
        attention: new Map(reports.map((report) => [report._id, report.attention])),
    };
}

const toModelRun = ({ score, unusual, reason, measure }: IMlRunScore): ModelRun => ({
    score,
    unusual,
    reason,
    measure: measure === 'results' || measure === 'duration' ? measure : null,
});

// Plain values only: cached results can't hold ObjectIds or other class instances.
function toListItem(doc: IReport, model: ModelScores): ReportListItem {
    const modelRun = model.runs.get(doc.slug);
    const attention = model.attention.get(doc.slug);

    return {
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        app: doc.splunk.appLabel,
        owner: doc.splunk.owner,
        schedule: doc.schedule,
        cron: doc.cron,
        runsPerWeek: doc.runsPerWeek,
        timeRange: doc.timeRange,
        index: doc.index,
        lastRun: iso(doc.latest?.runAt),
        nextRun: iso(doc.nextRun),
        status: doc.latest?.status ?? 'success',
        statusMessage: doc.latest?.statusMessage || undefined,
        resultCount: doc.results?.resultCount ?? 0,
        recipients: [...doc.recipients],
        tags: [...doc.tags],
        spl: doc.spl,
        highlights: doc.highlights.map(toHighlight),
        chart: doc.chart ? toChart(doc.chart) : null,
        resultsRunAt: doc.results ? iso(doc.results.runAt) : null,
        history: doc.history.map(({ runAt, status, durationSec, resultCount }) => ({ runAt: iso(runAt), status, durationSec, resultCount })),
        ...(modelRun ? { modelRun: toModelRun(modelRun) } : {}),
        ...(attention !== undefined ? { attention } : {}),
    };
}

async function loadReports(): Promise<StoredReport[]> {
    'use cache';
    cacheTag('reports');
    cacheLife('minutes');

    await connectDB();
    const docs = await Report.find({ disabled: false }).sort({ title: 1 }).lean<IReport[]>();
    const model = await loadModelScores(docs);

    return docs.map((doc) => ({ report: toListItem(doc, model), allowedGroups: [...doc.allowedGroups], resultsSid: doc.results?.sid ?? null }));
}

async function loadResults(sid: string): Promise<{ columns: string[]; rows: Cell[][] } | null> {
    'use cache';
    cacheTag('reports');
    cacheLife('minutes');

    await connectDB();
    const run = await ReportRun.findOne({ sid }, { columns: 1, rows: 1 }).lean();

    return run ? { columns: [...run.columns], rows: run.rows } : null;
}

async function loadRunCounts(): Promise<RunCount[]> {
    'use cache';
    cacheTag('reports');
    cacheLife('minutes');

    await connectDB();
    const groups = await ReportRun.aggregate<{ _id: Omit<RunCount, 'count'>; count: number }>([
        {
            $group: {
                _id: { slug: '$reportSlug', day: { $dateToString: { format: '%Y-%m-%d', date: '$runAt' } }, status: '$status' },
                count: { $sum: 1 },
            },
        },
    ]);

    return groups.map(({ _id, count }) => ({ ..._id, count }));
}

async function loadSyncInfo(): Promise<SyncInfo | null> {
    'use cache';
    cacheTag('reports');
    cacheLife('minutes');

    await connectDB();
    const state = await SyncState.findById(SYNC_STATE_ID).lean();

    return state?.lastSuccessAt
        ? { mode: state.mode, lastSuccessAt: iso(state.lastSuccessAt), lastError: state.lastError, timeZone: state.timeZone || 'UTC' }
        : null;
}

// Lays out a month of runs, so it's worth keeping until the reports change.
async function loadScheduleLoad(schedules: Pick<ReportListItem, 'title' | 'cron' | 'history'>[], timeZone: string): Promise<ScheduleLoad> {
    'use cache';
    cacheTag('reports');
    cacheLife('minutes');

    return scheduleLoad(schedules, timeZone);
}

// ---------------------------------------------------------------------------
// What the signed-in user may see

// Wrapped in React cache(): the home page's parts each ask for the reports,
// and one request filters them once.
export const getVisibleReports = cache(async (): Promise<ReportListItem[]> => {
    const viewer = await getViewer();

    return (await loadReports())
        .filter(({ allowedGroups }) => canView(viewer, allowedGroups))
        .map(({ report }) => report);
});

// A report the viewer may not see comes back as null, the same as a missing
// one, so its name doesn't leak.
export async function getVisibleReport(slug: string): Promise<SplunkReport | null> {
    const viewer = await getViewer();
    const stored = (await loadReports()).find(({ report }) => report.slug === slug);
    if (!stored || !canView(viewer, stored.allowedGroups)) return null;

    const results = stored.resultsSid ? await loadResults(stored.resultsSid) : null;
    return { ...stored.report, columns: results?.columns ?? [], rows: results?.rows ?? [] };
}

// Every report the viewer may see, each with its latest results, for the AI's
// context (lib/ai/context.ts). The results come from the same cache as the
// report pages.
export async function getVisibleReportsWithResults(): Promise<SplunkReport[]> {
    const viewer = await getViewer();
    const visible = (await loadReports()).filter(({ allowedGroups }) => canView(viewer, allowedGroups));

    return Promise.all(visible.map(async ({ report, resultsSid }) => {
        const results = resultsSid ? await loadResults(resultsSid) : null;
        return { ...report, columns: results?.columns ?? [], rows: results?.rows ?? [] };
    }));
}

// The run counts of the viewer's reports, once per request for both views below.
const visibleRunCounts = cache(async (): Promise<{ reports: ReportListItem[]; counts: RunCount[] }> => {
    const reports = await getVisibleReports();
    const visible = new Set(reports.map(({ slug }) => slug));

    return { reports, counts: (await loadRunCounts()).filter(({ slug }) => visible.has(slug)) };
});

// Runs per day by outcome across the viewer's reports, for the days up to the newest run.
export async function getRunOutcomes(days = 7): Promise<RunOutcomeDay[]> {
    const { counts } = await visibleRunCounts();

    return totalsByDay(counts, lastDays(counts, days));
}

// The same days, per report: the home page's run health grid.
export async function getRunHealth(days = 7): Promise<RunHealth> {
    const { reports, counts } = await visibleRunCounts();
    const shown = lastDays(counts, days);

    return { days: shown, rows: runHealthRows(reports, counts, shown) };
}

// When the viewer's reports run, by time of day, in the schedules' time zone.
export async function getScheduleLoad(): Promise<ScheduleLoad> {
    const [reports, sync] = await Promise.all([getVisibleReports(), getSyncInfo()]);

    return loadScheduleLoad(reports.map(({ title, cron, history }) => ({ title, cron, history })), sync?.timeZone ?? 'UTC');
}

export async function getSyncInfo(): Promise<SyncInfo | null> {
    await getViewer();
    return loadSyncInfo();
}
