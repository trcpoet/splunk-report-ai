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

export type ScheduledReport = {
    entry: SplunkEntry<SavedSearchContent>;
    meta: ReportMeta;
    config?: ReportConfig;
};

// Scheduled searches that email their results, plus any listed in report-config.
export async function listScheduledReports(transport: SplunkTransport, timeZone: string, now: Date): Promise<ScheduledReport[]> {
    const [apps, searches] = await Promise.all([
        transport.get<SplunkFeed<AppContent>>('/services/apps/local', { count: 0 }),
        transport.get<SplunkFeed<SavedSearchContent>>('/servicesNS/-/-/saved/searches', { count: 0, search: 'is_scheduled=1' }),
    ]);
    const appLabels = Object.fromEntries(apps.entry.map((app) => [app.name, app.content.label ?? app.name]));

    return searches.entry
        .filter((entry) => toBool(entry.content.is_scheduled) && entry.content.cron_schedule)
        .filter((entry) => reportConfig[entry.name] || toBool(entry.content['action.email']))
        .map((entry) => {
            const config = reportConfig[entry.name];
            return { entry, config, meta: mapSavedSearch(entry, { config, appLabels, timeZone, now }) };
        });
}

// Runs in the report's Splunk history that aren't in `knownSids` yet. Jobs still
// running are skipped; the next sync picks them up.
export async function fetchNewRuns(transport: SplunkTransport, { entry, meta, config }: ScheduledReport, knownSids: Set<string>): Promise<RunFacts[]> {
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

    for (const sid of sids) {
        let job: SplunkEntry<JobContent> | undefined;
        try {
            job = (await transport.get<SplunkFeed<JobContent>>(`/services/search/jobs/${encodeURIComponent(sid)}`)).entry[0];
        } catch (error) {
            // The job expired between listing the history and asking for it.
            if (isNotFound(error)) continue;
            throw error;
        }
        if (!job || !isFinished(job.content)) continue;

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

        runs.push(mapRun({ reportSlug: meta.slug, job, results, resultsExpired, rule: config?.statusRule }));
    }

    return runs;
}

async function syncReport(transport: SplunkTransport, report: ScheduledReport, now: Date) {
    const { meta, config } = report;
    const known = await ReportRun.find({ reportSlug: meta.slug }).distinct('sid');
    const runs = await fetchNewRuns(transport, report, new Set(known));

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

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type SyncOptions = {
    transport: SplunkTransport;
    mode: 'fixture' | 'live';
    timeZone?: string;
    now?: Date;
    refreshApp?: boolean;
    log?: (message: string) => void;
};

export type SyncSummary = {
    reports: number;
    newRuns: number;
    errors: number;
};

export async function syncAll({ transport, mode, timeZone = 'UTC', now = new Date(), refreshApp = true, log = console.log }: SyncOptions): Promise<SyncSummary> {
    await connectDB();
    await SyncState.updateOne({ _id: SYNC_STATE_ID }, { $set: { mode, lastStartedAt: now } }, { upsert: true });

    const summary: SyncSummary = { reports: 0, newRuns: 0, errors: 0 };

    try {
        const scheduled = await listScheduledReports(transport, timeZone, now);

        for (const report of scheduled) {
            try {
                const newRuns = await syncReport(transport, report, now);
                summary.reports++;
                summary.newRuns += newRuns;
                log(`✓ ${report.meta.slug}: ${newRuns} new run${newRuns === 1 ? '' : 's'}`);
            } catch (error) {
                summary.errors++;
                await Report.updateOne({ slug: report.meta.slug }, { $set: { syncError: errorMessage(error) } });
                log(`✗ ${report.meta.slug}: ${errorMessage(error)}`);
            }
        }

        // Reports that are no longer scheduled in Splunk drop out of the app.
        // Their runs stay until the retention period ends.
        await Report.updateMany({ slug: { $nin: scheduled.map(({ meta }) => meta.slug) } }, { $set: { disabled: true } });

        // A sync where single reports failed still refreshed the others; those
        // reports carry their own syncError.
        const finishedAt = new Date();
        await SyncState.updateOne({ _id: SYNC_STATE_ID }, {
            $set: {
                lastFinishedAt: finishedAt,
                lastSuccessAt: finishedAt,
                timeZone,
                lastError: summary.errors > 0 ? `${summary.errors} report${summary.errors === 1 ? '' : 's'} failed to sync` : null,
                counts: summary,
            },
        });
    } catch (error) {
        await SyncState.updateOne({ _id: SYNC_STATE_ID }, { $set: { lastFinishedAt: new Date(), lastError: errorMessage(error) } });
        throw error;
    }

    if (refreshApp) await refreshAppCache(log);
    return summary;
}
