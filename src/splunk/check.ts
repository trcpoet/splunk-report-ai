import { formatList, formatNumber, plural } from '@/shared/format';
import { columnsUsed } from '@/reports/cards/columns';
import { reportCards, reportConfig } from '@/reports/report-config';
import { errorMessage, setupHint } from './errors';
import { toBool } from './map';
import type { SyncReports } from './settings';
import { newestFinishedRun } from './preview';
import { fetchRun, listScheduledReports, scheduledRunSids, type ScheduledReport } from './sync';
import { isNotFound, SplunkHttpError, SplunkNotJsonError, type SplunkTransport } from './transport';
import type { SavedSearchContent, SplunkFeed } from './types';

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
        if (error instanceof SplunkNotJsonError) {
            add('fail', `Something answers at ${where}, but it isn't Splunk's REST API: ${errorMessage(error)}`, hintFor(error));
        } else if (error instanceof SplunkHttpError) {
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

    // 3. The scheduled searches the token can see, and the ones the sync takes:
    // the sync's own list, so the two never disagree.
    let names: string[];
    let taken: ScheduledReport[];
    try {
        const searches = await transport.get<SplunkFeed<SavedSearchContent>>('/servicesNS/-/-/saved/searches', { count: 0, search: 'is_scheduled=1' });
        names = searches.entry.filter((entry) => toBool(entry.content.is_scheduled)).map(({ name }) => name);
        taken = await listScheduledReports(transport, 'UTC', new Date(), () => {}, syncReports);
    } catch (error) {
        add('fail', `Couldn't list the scheduled searches: ${errorMessage(error)}`, hintFor(error));
        return results;
    }
    const seen = `The token can see ${plural(names.length, 'scheduled search', 'scheduled searches')}`;
    if (taken.length === 0) {
        add('fail', `${seen}, and the sync takes none of them (SYNC_REPORTS=${syncReports}).`, syncReports === 'emailed'
            ? "Share the scheduled reports with the service account's role, or give them cards in config/report-cards.yaml."
            : 'Give the reports cards in config/report-cards.yaml, under their exact Splunk names, or use SYNC_REPORTS=emailed.');
        return results;
    }
    add('pass', `${seen}. The sync takes ${taken.length} of them (SYNC_REPORTS=${syncReports}).`);

    // 4. Cards for reports this Splunk doesn't have: a typo, or a report not shared with the token.
    const configured = Object.keys(reportConfig());
    const missing = configured.filter((name) => !names.includes(name));
    if (missing.length > 0) {
        add('warn', `${missing.length} of the ${configured.length} cards in config/report-cards.yaml are for reports this token can't see as scheduled searches: ${formatList(missing)}.`,
            "Names must match Splunk's exactly. If they do, share those reports with the service account's role.");
    } else {
        add('pass', `All ${configured.length} cards in config/report-cards.yaml are for reports in Splunk.`);
    }

    // 5. A run's results can be read: the newest finished run, read the way the
    // sync reads it (src/splunk/sync.ts), of the first reports that have one.
    for (const report of taken.slice(0, RUNS_TO_TRY)) {
        try {
            for (const sid of await scheduledRunSids(transport, report, RUNS_TO_TRY)) {
                const run = await fetchRun(transport, report, sid);
                // Still running, failed, or its results already expired: try an older one.
                if (!run || run.status === 'failed' || run.resultsExpired) continue;
                add('pass', `Read the newest finished run of "${report.entry.name}": ${plural(run.rows.length, 'row', 'rows')}, of ${formatNumber(run.resultCount)} results.`);
                return [...results, ...(await checkCardColumns(transport, taken))];
            }
        } catch (error) {
            if (isNotFound(error)) continue;
            add('fail', `Couldn't read "${report.entry.name}"'s runs: ${errorMessage(error)}`, hintFor(error));
            return results;
        }
    }
    add('warn', `None of the first ${plural(Math.min(taken.length, RUNS_TO_TRY), 'report', 'reports')} has a finished run whose results can still be read.`,
        "Splunk runs reports on their schedules, and keeps each run's results for two schedule periods. Check again after the next run.");
    return results;
}

// How many reports with a card to check against their newest run.
const CARDS_TO_CHECK = 50;

// 6. Every column a card names is in its report's newest results: a card
// written for a tile, before its report had run, may guess a column's name.
async function checkCardColumns(transport: SplunkTransport, taken: ScheduledReport[]): Promise<CheckResult[]> {
    const cards = reportCards();
    const carded = taken.filter(({ entry }) => entry.name in cards).slice(0, CARDS_TO_CHECK);
    const found: CheckResult[] = [];
    let checked = 0;
    for (const report of carded) {
        const card = cards[report.entry.name];
        const run = card ? await newestFinishedRun(transport, report).catch(() => null) : null;
        if (!card || !run) continue;
        checked++;
        const unknown = columnsUsed(card).filter((column) => !run.columns.includes(column));
        if (unknown.length > 0) {
            found.push({
                outcome: 'fail',
                text: `"${report.entry.name}"'s card names ${unknown.map((column) => `"${column}"`).join(', ')}, which its results don't have. They have: ${run.columns.join(', ')}.`,
                hint: 'Fix the names in config/report-cards.yaml, then try npm run card:preview on the report.',
            });
        }
    }
    if (checked > 0 && found.length === 0) found.push({ outcome: 'pass', text: `The ${plural(checked, 'card', 'cards')} checked name only columns their reports' results have.` });
    return found;
}

// Whether every check passed (warnings are fine).
export const allPassed = (results: CheckResult[]) => results.every(({ outcome }) => outcome !== 'fail');
