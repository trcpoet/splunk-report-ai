import { formatList, plural } from '@/lib/format';
import { reportConfig } from '@/lib/report-config';
import { errorMessage, setupHint } from './errors';
import { toBool } from './map';
import type { SyncReports } from './settings';
import { isSyncedSearch } from './sync';
import { isNotFound, SplunkHttpError, type SplunkTransport } from './transport';
import type { HistoryContent, ResultsResponse, SavedSearchContent, SplunkEntry, SplunkFeed } from './types';

// `npm run splunk:check`: tests the connection to Splunk one step at a time,
// reads only, writes nothing, and says what to fix. The first thing to run on
// a new machine, before `npm run sync`. scripts/splunk-check.ts prints it.

export type CheckResult = {
    outcome: 'pass' | 'warn' | 'fail';
    text: string;
    // What to do about a warning or a failure.
    hint?: string;
};

type CheckOptions = {
    // Where Splunk was asked, for the messages.
    where: string;
    syncReports: SyncReports;
};

type CurrentContext = { username?: string; roles?: string[] };

// How many reports to try before saying none has a run to read yet.
const RUNS_TO_TRY = 5;

const hintFor = (error: unknown) => setupHint(error) ?? undefined;

export async function checkSplunk(transport: SplunkTransport, { where, syncReports }: CheckOptions): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const add = (outcome: CheckResult['outcome'], text: string, hint?: string) => {
        results.push({ outcome, text, ...(hint ? { hint } : {}) });
    };

    // 1 and 2. Any HTTP answer means Splunk is there; the answer says whether the token works.
    let context: SplunkFeed<CurrentContext>;
    try {
        context = await transport.get<SplunkFeed<CurrentContext>>('/services/authentication/current-context');
    } catch (error) {
        if (error instanceof SplunkHttpError) {
            add('pass', `Splunk answers at ${where}.`);
            add('fail', `The token doesn't work: ${errorMessage(error)}`, hintFor(error));
        } else {
            add('fail', `Splunk doesn't answer at ${where}: ${errorMessage(error)}`, hintFor(error));
        }
        return results;
    }
    const who = context.entry[0]?.content;
    add('pass', `Splunk answers at ${where}.`);
    add('pass', `The token works: signed in as ${who?.username ?? 'an unnamed user'}, with ${who?.roles?.length ? `roles ${formatList(who.roles)}` : 'no roles'}.`);

    // 3. The scheduled searches the token can see, and how many the sync takes.
    let scheduled: SplunkEntry<SavedSearchContent>[];
    try {
        const searches = await transport.get<SplunkFeed<SavedSearchContent>>('/servicesNS/-/-/saved/searches', { count: 0, search: 'is_scheduled=1' });
        scheduled = searches.entry.filter((entry) => toBool(entry.content.is_scheduled));
    } catch (error) {
        add('fail', `Couldn't list the scheduled searches: ${errorMessage(error)}`, hintFor(error));
        return results;
    }
    const taken = scheduled.filter((entry) => isSyncedSearch(entry, syncReports));
    const seen = `The token can see ${plural(scheduled.length, 'scheduled search', 'scheduled searches')}`;
    if (taken.length === 0) {
        add('fail', `${seen}, and the sync takes none of them (SYNC_REPORTS=${syncReports}).`, syncReports === 'emailed'
            ? "Share the scheduled reports with the service account's role, or add their names to lib/report-config.ts."
            : 'Add the reports to lib/report-config.ts under their exact Splunk names, or use SYNC_REPORTS=emailed.');
        return results;
    }
    add('pass', `${seen}. The sync takes ${taken.length} of them (SYNC_REPORTS=${syncReports}).`);

    // 4. Reports in report-config that this Splunk doesn't have: a typo, or a report not shared with the token.
    const names = new Set(scheduled.map(({ name }) => name));
    const configured = Object.keys(reportConfig);
    const missing = configured.filter((name) => !names.has(name));
    if (missing.length > 0) {
        add('warn', `${missing.length} of the ${configured.length} reports in lib/report-config.ts aren't scheduled searches this token can see: ${formatList(missing)}.`,
            "Names must match Splunk's exactly. If they do, share those reports with the service account's role.");
    } else {
        add('pass', `All ${configured.length} reports in lib/report-config.ts are in Splunk.`);
    }

    // 5. One run's results can be read: the newest run of the first reports that have one.
    for (const entry of taken.slice(0, RUNS_TO_TRY)) {
        const owner = encodeURIComponent(entry.acl?.owner ?? 'nobody');
        const app = encodeURIComponent(entry.acl?.app ?? 'search');
        try {
            const history = await transport.get<SplunkFeed<HistoryContent>>(
                `/servicesNS/${owner}/${app}/saved/searches/${encodeURIComponent(entry.name)}/history`,
                { count: 10 },
            );
            const newest = history.entry.toSorted((a, b) => (b.published ?? '').localeCompare(a.published ?? ''))[0];
            if (!newest) continue;

            const response = await transport.get<ResultsResponse>(`/services/search/v2/jobs/${encodeURIComponent(newest.name)}/results`, { count: 5 });
            add('pass', `Read the results of "${entry.name}"'s newest run: ${plural(response.results?.length ?? 0, 'row', 'rows')} (up to 5 asked for).`);
            return results;
        } catch (error) {
            if (isNotFound(error)) continue;
            add('fail', `Couldn't read "${entry.name}"'s runs: ${errorMessage(error)}`, hintFor(error));
            return results;
        }
    }
    add('warn', `None of the first ${plural(Math.min(taken.length, RUNS_TO_TRY), 'report', 'reports')} has a run whose results can still be read.`,
        "Splunk runs reports on their schedules, and keeps each run's results for two schedule periods. Check again after the next run.");
    return results;
}

// Whether every check passed (warnings are fine).
export const allPassed = (results: CheckResult[]) => results.every(({ outcome }) => outcome !== 'fail');
