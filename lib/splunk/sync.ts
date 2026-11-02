import connectDB from '@/lib/mongodb';
import { Report, ReportRun, SyncState, SYNC_STATE_ID } from '@/database';
import { reportConfig, type ReportConfig } from '@/lib/report-config';
import { deriveReportFields, isFailed, isFinished, mapResults, mapRun, mapSavedSearch, toBool, type ReportMeta, type ResultTable, type RunFacts } from './map';
import { isNotFound, type SplunkTransport } from './transport';
import type { AppContent, HistoryContent, JobContent, ResultsResponse, SavedSearchContent, SplunkEntry, SplunkFeed } from './types';

// Copies Splunk scheduled reports and their runs into MongoDB.
// - Reads only what the scheduler already ran. It never dispatches searches, so
//   it doesn't compete for the scheduler's concurrency limit.
// - Idempotent: reports upsert by slug and runs by sid, so running it again only
//   adds runs it hasn't seen.
// - One failing report doesn't stop the others.
// - Splunk deletes a run's results after dispatch.ttl (two schedule periods by
//   default), so sync more often than that. MongoDB keeps the long-term history.

// How many of each report's newest jobs to ask Splunk about.
const HISTORY_LOOKBACK = 50;
// How many runs the report document keeps for the run-history dots and table.
const HISTORY_SIZE = 7;
const MAX_ROWS = Number(process.env.SYNC_MAX_ROWS) || 5_000;

type ScheduledReport = {
    entry: SplunkEntry<SavedSearchContent>;
    meta: ReportMeta;
    config?: ReportConfig;
};

type Log = (message: string) => void;

// Saved searches can share a name: in two apps, or as someone's private copy.
// They'd get the same slug and overwrite each other, and a private copy would
// take on the shared report's groups. So one stays, the shared one if there is
// one, and the rest are left out and logged.
function oneReportPerSlug(reports: ScheduledReport[], log: Log) {
    const where = ({ entry }: ScheduledReport) => `${entry.acl?.app ?? 'search'}/${entry.acl?.owner ?? 'nobody'}`;
    const isPrivate = ({ entry }: ScheduledReport) => (entry.acl?.sharing === 'user' ? 1 : 0);
    const kept = new Map<string, ScheduledReport>();

    for (const report of reports.toSorted((a, b) => isPrivate(a) - isPrivate(b) || where(a).localeCompare(where(b)))) {
        const first = kept.get(report.meta.slug);
        if (first) log(`⚠ Skipped "${report.entry.name}" in ${where(report)}: ${where(first)} has a report with the same name.`);
        else kept.set(report.meta.slug, report);
    }
    return [...kept.values()];
}

// Scheduled searches that email their results, plus any listed in report-config.
export async function listScheduledReports(transport: SplunkTransport, timeZone: string, now: Date, log: Log = () => {}): Promise<ScheduledReport[]> {
    const [apps, searches] = await Promise.all([
        transport.get<SplunkFeed<AppContent>>('/services/apps/local', { count: 0 }),
        transport.get<SplunkFeed<SavedSearchContent>>('/servicesNS/-/-/saved/searches', { count: 0, search: 'is_scheduled=1' }),
    ]);
    const appLabels = Object.fromEntries(apps.entry.map((app) => [app.name, app.content.label ?? app.name]));

    const reports = searches.entry
        .filter((entry) => toBool(entry.content.is_scheduled) && entry.content.cron_schedule)
        .filter((entry) => reportConfig[entry.name] || toBool(entry.content['action.email']))
        .map((entry) => {
            const config = reportConfig[entry.name];
            return { entry, config, meta: mapSavedSearch(entry, { config, appLabels, timeZone, now }) };
        });

    return oneReportPerSlug(reports, log);
}

type NewRuns = {
    runs: RunFacts[];
    // Jobs Splunk answered 404 for: they expired, or the token can't read them.
    unreadable: number;
    // What stopped the fetch early. The runs fetched before it are still good.
    failure?: unknown;
};

// One job's facts and results, or null while it's still running.
async function fetchRun(transport: SplunkTransport, { meta, config }: ScheduledReport, sid: string): Promise<RunFacts | null> {
    const job = (await transport.get<SplunkFeed<JobContent>>(`/services/search/jobs/${encodeURIComponent(sid)}`)).entry[0];
    if (!job || !isFinished(job.content)) return null;

    let results: ResultTable | null = null;
    let resultsExpired = false;

    if (!isFailed(job.content)) {
        try {
            results = mapResults(await transport.get<ResultsResponse>(
                `/services/search/v2/jobs/${encodeURIComponent(sid)}/results`,
                { count: MAX_ROWS },
            ));
        } catch (error) {
            if (!isNotFound(error)) throw error;
            // Splunk already deleted the results. Keep the run without rows.
            resultsExpired = true;
        }
    }

    return mapRun({ reportSlug: meta.slug, job, results, resultsExpired, rule: config?.statusRule });
}

// Runs in the report's Splunk history that aren't in `knownSids` yet. Jobs still
// running are skipped; the next sync picks them up.
export async function fetchNewRuns(transport: SplunkTransport, report: ScheduledReport, knownSids: Set<string>): Promise<NewRuns> {
    const { entry } = report;
    const owner = encodeURIComponent(entry.acl?.owner ?? 'nobody');
    const app = encodeURIComponent(entry.acl?.app ?? 'search');
    const history = await transport.get<SplunkFeed<HistoryContent>>(
        `/servicesNS/${owner}/${app}/saved/searches/${encodeURIComponent(entry.name)}/history`,
        { count: HISTORY_LOOKBACK },
    );

    const sids = history.entry
        .filter((job) => job.content.isScheduled === undefined || toBool(job.content.isScheduled))
        .map((job) => job.name)
        .filter((sid) => !knownSids.has(sid));

    const runs: RunFacts[] = [];
    let unreadable = 0;

    for (const sid of sids) {
        try {
            const run = await fetchRun(transport, report, sid);
            if (run) runs.push(run);
        } catch (error) {
            if (isNotFound(error)) unreadable++;
            else return { runs, unreadable, failure: error };
        }
    }

    return { runs, unreadable };
}

async function syncReport(transport: SplunkTransport, report: ScheduledReport, now: Date, log: Log) {
    const { meta, config } = report;
    const known = await ReportRun.find({ reportSlug: meta.slug }).distinct('sid');
    const { runs, unreadable, failure } = await fetchNewRuns(transport, report, new Set(known));

    if (unreadable > 0) log(`⚠ ${meta.slug}: Splunk answered 404 for ${unreadable} job${unreadable === 1 ? '' : 's'}. They expired, or the token can't read them.`);

    if (runs.length > 0) {
        await ReportRun.bulkWrite(
            runs.map((run) => ({ updateOne: { filter: { sid: run.sid }, update: { $setOnInsert: run }, upsert: true } })),
            { ordered: false },
        );
    }

    // Recompute the derived fields from what's stored, so config changes apply
    // even when there are no new runs.
    const [recent, resultsRun] = await Promise.all([
        ReportRun.find({ reportSlug: meta.slug }).sort({ runAt: -1 }).limit(HISTORY_SIZE).select('-rows -columns').lean(),
        ReportRun.findOne({ reportSlug: meta.slug, hasResults: true }).sort({ runAt: -1 }).lean(),
    ]);

    const { chartType, ...fields } = meta;
    await Report.updateOne(
        { slug: meta.slug },
        {
            $set: {
                ...fields,
                ...deriveReportFields({ recent, resultsRun, chartType, config }),
                syncedAt: now,
                syncError: null,
            },
        },
        { upsert: true },
    );

    // After the runs are saved, so the next sync doesn't have to fetch them again.
    if (failure) throw failure;
    return runs.length;
}

// A page that was still reading the old data when the app dropped its cache
// can put that old data back. So the app is asked twice: now, and again a
// moment later, once any such reads have finished.
const SECOND_REFRESH_MS = 3_000;

// Tells the web app to drop its cached report data. Skipped if the app isn't running.
async function refreshAppCache(log: (message: string) => void) {
    const appUrl = process.env.APP_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (!appUrl || !secret) {
        log('APP_URL or REVALIDATE_SECRET is not set, so the app cache was not refreshed.');
        return;
    }

    const refresh = () => fetch(new URL('/api/revalidate', appUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(5_000),
    });

    try {
        const response = await refresh();
        if (!response.ok) {
            log(`The app refused the cache refresh (${response.status}).`);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, SECOND_REFRESH_MS));
        await refresh();
        log('Refreshed the app cache.');
    } catch {
        log(`The app isn't reachable at ${appUrl}. It will show the new data when its cache expires.`);
    }
}

// fetch itself only says "fetch failed". The reason, such as a certificate it
// couldn't verify or a refused connection, is in its cause.
export function errorMessage(error: unknown) {
    if (!(error instanceof Error)) return String(error);

    // For a refused connection, Node's cause has a code and an empty message.
    const { cause } = error;
    const reason = cause instanceof Error ? cause.message || (cause as NodeJS.ErrnoException).code : undefined;
    return reason ? `${error.message}: ${reason}` : error.message;
}

type SyncOptions = {
    transport: SplunkTransport;
    mode: 'fixture' | 'live';
    timeZone?: string;
    now?: Date;
    refreshApp?: boolean;
    log?: (message: string) => void;
};

type SyncSummary = {
    reports: number;
    newRuns: number;
    errors: number;
};

export async function syncAll({ transport, mode, timeZone = 'UTC', now = new Date(), refreshApp = true, log = console.log }: SyncOptions): Promise<SyncSummary> {
    await connectDB();
    await SyncState.updateOne({ _id: SYNC_STATE_ID }, { $set: { mode, lastStartedAt: now } }, { upsert: true });

    const summary: SyncSummary = { reports: 0, newRuns: 0, errors: 0 };

    try {
        const scheduled = await listScheduledReports(transport, timeZone, now, log);

        for (const report of scheduled) {
            try {
                const newRuns = await syncReport(transport, report, now, log);
                summary.reports++;
                summary.newRuns += newRuns;
                log(`✓ ${report.meta.slug}: ${newRuns} new run${newRuns === 1 ? '' : 's'}`);
            } catch (error) {
                summary.errors++;
                await Report.updateOne({ slug: report.meta.slug }, { $set: { syncError: errorMessage(error) } });
                log(`✗ ${report.meta.slug}: ${errorMessage(error)}`);
            }
        }

        // An empty list from live Splunk is more likely a token that lost its
        // access than every report being unscheduled at once, so nothing is hidden.
        const nothingListed = mode === 'live' && scheduled.length === 0;
        if (nothingListed) {
            summary.errors++;
            log('Splunk listed no scheduled reports, so the app keeps the ones it has. Check what the token can read.');
        } else {
            // Reports that are no longer scheduled in Splunk drop out of the app.
            // Their runs stay until the retention period ends.
            await Report.updateMany({ slug: { $nin: scheduled.map(({ meta }) => meta.slug) } }, { $set: { disabled: true } });
        }

        // A sync where single reports failed still refreshed the others; those
        // reports carry their own syncError.
        const failed = `${summary.errors} report${summary.errors === 1 ? '' : 's'} failed to sync`;
        const finishedAt = new Date();
        await SyncState.updateOne({ _id: SYNC_STATE_ID }, {
            $set: {
                lastFinishedAt: finishedAt,
                // A sync that read nothing brought no new data, so "Data as of" stays put.
                ...(summary.reports > 0 ? { lastSuccessAt: finishedAt } : {}),
                timeZone,
                lastError: nothingListed ? 'Splunk listed no scheduled reports. Check what the token can read.' : summary.errors > 0 ? failed : null,
                counts: summary,
            },
        });
    } catch (error) {
        await SyncState.updateOne({ _id: SYNC_STATE_ID }, { $set: { lastFinishedAt: new Date(), lastError: errorMessage(error) } });
        // So the app can say the sync failed, instead of showing old data as current.
        if (refreshApp) await refreshAppCache(log);
        throw error;
    }

    if (refreshApp) await refreshAppCache(log);
    return summary;
}
