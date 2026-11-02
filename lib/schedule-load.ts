import { Cron } from 'croner';
import { plural } from '@/lib/format';
import { median } from '@/lib/insights';
import type { ReportListItem } from '@/lib/reports';

// When the Splunk scheduler is busy: how many of the reports' searches run at
// once, by time of day. For the "When searches run" chart on the home page
// (components/SchedulerLoad.tsx). Pure, so the tests share it.
//
// Each report's runs come from its cron, laid out over a reference month:
// January 2024, which starts on a Monday, so daily, weekly and monthly
// schedules all show. Each run lasts the report's usual run time, in whole
// minutes. The minute-by-minute count is then folded into one day by keeping
// each minute's busiest day, in slots of a few minutes.
//
// Crons are clock times, so they're laid out in UTC: with no daylight-saving
// change, every time zone gives the same times of day. The zone only labels
// the chart. (croner's utcOffset is also far faster than its timezone option.)

export type LoadSlot = {
    // Minutes after midnight.
    minute: number;
    // The most searches running at once in the slot, on its busiest day.
    running: number;
    // The reports running then.
    reports: string[];
};

// A stretch of the day with the same searches running at once.
export type BusyTime = {
    minute: number;
    // Where it ends: a slot later, or more when the next slots match.
    until: number;
    // When it happens, if not every day: "Mondays", "weekdays", "once a month"...
    on: string | null;
    reports: string[];
};

export type BusyTier = {
    running: number;
    times: BusyTime[];
};

export type ScheduleLoad = {
    timeZone: string;
    slotMinutes: number;
    slots: LoadSlot[];
    // The two highest numbers of searches at once (2 or more), most first,
    // each with every time of day it happens.
    busiest: BusyTier[];
    // Reports that only ever start on the hour, of the `total` that run in the
    // reference month.
    onTheHour: number;
    total: number;
};

type Schedule = Pick<ReportListItem, 'title' | 'cron' | 'history'>;
type Placed = { title: string; starts: number[]; length: number };

const DAY_MINUTES = 1440;
const MONTH_DAYS = 31;
const MONTH_MINUTES = MONTH_DAYS * DAY_MINUTES;
const MINUTE_MS = 60_000;
// Midnight at the start of Monday, January 1, 2024.
const MONTH_START = Date.UTC(2024, 0, 1);
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

const sameItems = <T>(a: T[], b: T[]) => a.length === b.length && a.every((item, i) => item === b[i]);

// The days of the month (0 is Monday the 1st) that fall on these weekdays (0 is Monday).
const daysOn = (weekdays: number[]) => Array.from({ length: MONTH_DAYS }, (_, day) => day).filter((day) => weekdays.includes(day % 7));

// How to say which days of the month a time is that busy on; null for every day.
function daysText(days: number[]) {
    if (days.length === MONTH_DAYS) return null;
    if (sameItems(days, daysOn([0, 1, 2, 3, 4]))) return 'weekdays';
    if (sameItems(days, daysOn([5, 6]))) return 'weekends';

    const weekday = WEEKDAYS.findIndex((_, i) => sameItems(days, daysOn([i])));
    if (weekday >= 0) return WEEKDAYS[weekday];

    return days.length === 1 ? 'once a month' : `${plural(days.length, 'day', 'days')} a month`;
}

// The zone's name if the runtime knows it, otherwise UTC.
function knownZone(timeZone: string) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
        return timeZone;
    } catch {
        return 'UTC';
    }
}

// The minutes, from midnight on January 1, when a cron starts in the month or
// the day before, whose late runs can carry on past midnight. null when the
// cron can't be read.
function startMinutes(cron: string): number[] | null {
    try {
        const job = new Cron(cron, { utcOffset: 0, paused: true });
        const from = MONTH_START - DAY_MINUTES * MINUTE_MS;
        const end = MONTH_START + MONTH_MINUTES * MINUTE_MS;
        const minutes: number[] = [];

        for (let next = job.nextRun(new Date(from - 1)); next && next.getTime() < end; next = job.nextRun(next)) {
            minutes.push(Math.round((next.getTime() - MONTH_START) / MINUTE_MS));
        }
        return minutes;
    } catch {
        return null;
    }
}

// How long a report's search usually runs: the median of the runs that
// finished, in whole minutes, at least 1.
function usualMinutes(history: Schedule['history']) {
    const durations = history.filter((run) => run.status !== 'failed').map((run) => run.durationSec);
    return durations.length > 0 ? Math.max(1, Math.ceil(median(durations) / 60)) : 1;
}

// Whether a run of the report covers the minute. Its runs start in order and
// last the same time, so only the last start before the minute can.
function runsAt({ starts, length }: Placed, minute: number) {
    let low = 0;
    let high = starts.length - 1;
    let last = -1;

    while (low <= high) {
        const middle = (low + high) >> 1;
        if (starts[middle] <= minute) {
            last = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return last >= 0 && minute < starts[last] + length;
}

export function scheduleLoad(reports: Schedule[], timeZone = 'UTC', slotMinutes = 5): ScheduleLoad {
    // A schedule that never runs in January (yearly, or only in other months)
    // has nothing to place, so it isn't counted.
    const placed: Placed[] = reports.flatMap(({ title, cron, history }) => {
        const starts = startMinutes(cron);
        return starts?.some((start) => start >= 0) ? [{ title, starts, length: usualMinutes(history) }] : [];
    });

    // Searches running in each minute of the month: +1 where a run starts,
    // -1 where it ends, then a running total. A run from the day before counts
    // from midnight; one that would run past the month's end stops there.
    const change = new Int32Array(MONTH_MINUTES + 1);
    for (const { starts, length } of placed) {
        for (const start of starts) {
            const from = Math.max(start, 0);
            const to = Math.min(start + length, MONTH_MINUTES);
            if (to <= from) continue;

            change[from] += 1;
            change[to] -= 1;
        }
    }

    const running = new Int32Array(MONTH_MINUTES);
    let now = 0;
    for (let minute = 0; minute < MONTH_MINUTES; minute++) {
        now += change[minute];
        running[minute] = now;
    }

    // Each slot's busiest minute of the month, and the reports running then.
    const peaks = Array.from({ length: DAY_MINUTES / slotMinutes }, (_, slot) => {
        let most = 0;
        let at = -1;
        for (let minute = slot * slotMinutes; minute < (slot + 1) * slotMinutes; minute++) {
            for (let day = 0; day < MONTH_DAYS; day++) {
                const value = running[day * DAY_MINUTES + minute];
                if (value > most) {
                    most = value;
                    at = day * DAY_MINUTES + minute;
                }
            }
        }
        return { minute: slot * slotMinutes, running: most, at };
    });

    const slots = peaks.map(({ minute, running: most, at }) => ({
        minute,
        running: most,
        reports: at < 0 ? [] : placed.filter((report) => runsAt(report, at)).map(({ title }) => title),
    }));

    // The days of the month that reach the peak at that minute of the day.
    const on = (at: number, most: number) => {
        const minute = at % DAY_MINUTES;
        return daysText(Array.from({ length: MONTH_DAYS }, (_, day) => day).filter((day) => running[day * DAY_MINUTES + minute] === most));
    };

    const counts = [...new Set(slots.map(({ running: most }) => most).filter((most) => most >= 2))].sort((a, b) => b - a).slice(0, 2);
    const busiest = counts.map((count) => {
        const times: BusyTime[] = [];
        slots.forEach((slot, i) => {
            if (slot.running !== count) return;

            const when = on(peaks[i].at, count);
            const last = times.at(-1);
            // Joined only when it's the same searches, on the same days.
            if (last && last.until === slot.minute && last.on === when && sameItems(last.reports, slot.reports)) {
                last.until += slotMinutes;
            } else {
                times.push({ minute: slot.minute, until: slot.minute + slotMinutes, on: when, reports: slot.reports });
            }
        });
        return { running: count, times };
    });

    return {
        timeZone: knownZone(timeZone),
        slotMinutes,
        slots,
        busiest,
        // Only reports that always start on the hour: moving those spreads the
        // load. One that runs every few minutes reaches :00 wherever it starts.
        onTheHour: placed.filter(({ starts }) => starts.filter((start) => start >= 0).every((start) => start % 60 === 0)).length,
        total: placed.length,
    };
}
