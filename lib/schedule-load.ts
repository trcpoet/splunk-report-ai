import { Cron } from 'croner';
import { median } from '@/lib/insights';
import type { ReportListItem } from '@/lib/reports';

// When the Splunk scheduler is busy: how many of the reports' searches run at
// once, by time of day. For the "When searches run" chart on the home page
// (components/SchedulerLoad.tsx). Pure, so the tests share it.
//
// Each report's runs come from its cron, laid out over a reference month:
// January 2024 starts on a Monday and has no daylight-saving change in most
// time zones, so daily, weekly and monthly schedules all show. Each run lasts
// the report's usual run time, in whole minutes. The minute-by-minute count is
// then folded into one day by keeping each minute's busiest day, in slots of a
// few minutes.

export type LoadSlot = {
    // Minutes after midnight, in the schedules' time zone.
    minute: number;
    // The most searches running at once in the slot, on its busiest day.
    running: number;
    // The reports running then.
    reports: string[];
};

// A stretch of the day with the same number of searches at once.
export type BusyTime = {
    minute: number;
    // Where it ends: a slot later, or more when the next slots are as busy.
    until: number;
    // When it happens, if not every day: "Mondays", or "5 days a month".
    on: string | null;
    // The reports running at its start.
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
    // Reports with a run that starts on the hour, of the `total` whose cron could be read.
    onTheHour: number;
    total: number;
};

type Schedule = Pick<ReportListItem, 'title' | 'cron' | 'history'>;
type Placed = { title: string; starts: number[]; length: number };

const DAY_MINUTES = 1440;
const MONTH_DAYS = 31;
const MONTH_MINUTES = MONTH_DAYS * DAY_MINUTES;
const MINUTE_MS = 60_000;
// Midnight at the start of Monday, January 1, 2024, read as UTC.
const MONTH_START = Date.UTC(2024, 0, 1);
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

// How far the time zone's clocks are ahead of UTC in January.
function offsetMs(timeZone: string) {
    const at = MONTH_START + 14 * DAY_MINUTES * MINUTE_MS;
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
            .formatToParts(new Date(at))
            .map(({ type, value }) => [type, Number(value)]),
    );
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at;
}

// The minutes of the month, from midnight on the 1st, when a cron starts.
// January's fixed offset stands in for the time zone: the same runs, about 30
// times faster than croner's timezone option. null when the cron can't be read.
function startMinutes(cron: string, offset: number): number[] | null {
    try {
        const job = new Cron(cron, { utcOffset: offset / MINUTE_MS, paused: true });
        const start = MONTH_START - offset;
        const end = start + MONTH_MINUTES * MINUTE_MS;
        const minutes: number[] = [];

        for (let next = job.nextRun(new Date(start - 1)); next && next.getTime() < end; next = job.nextRun(next)) {
            minutes.push(Math.round((next.getTime() - start) / MINUTE_MS));
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
    let zone = timeZone;
    let offset = 0;
    try {
        offset = offsetMs(zone);
    } catch {
        zone = 'UTC';
    }

    const placed: Placed[] = reports.flatMap(({ title, cron, history }) => {
        const starts = startMinutes(cron, offset);
        return starts ? [{ title, starts, length: usualMinutes(history) }] : [];
    });

    // Searches running in each minute of the month: +1 where a run starts,
    // -1 where it ends, then a running total.
    const change = new Int32Array(MONTH_MINUTES + 1);
    for (const { starts, length } of placed) {
        for (const start of starts) {
            change[start] += 1;
            change[Math.min(start + length, MONTH_MINUTES)] -= 1;
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
        const days = Array.from({ length: MONTH_DAYS }, (_, day) => day).filter((day) => running[day * DAY_MINUTES + minute] === most);
        if (days.length === MONTH_DAYS) return null;

        const weekdays = new Set(days.map((day) => day % 7));
        return weekdays.size === 1 && days.length >= 4 ? WEEKDAYS[days[0] % 7] : `${days.length} days a month`;
    };

    const counts = [...new Set(slots.map(({ running: most }) => most).filter((most) => most >= 2))].sort((a, b) => b - a).slice(0, 2);
    const busiest = counts.map((count) => {
        const times: BusyTime[] = [];
        slots.forEach((slot, i) => {
            if (slot.running !== count) return;

            const last = times.at(-1);
            if (last && last.until === slot.minute) {
                last.until += slotMinutes;
            } else {
                times.push({ minute: slot.minute, until: slot.minute + slotMinutes, on: on(peaks[i].at, count), reports: slot.reports });
            }
        });
        return { running: count, times };
    });

    return {
        timeZone: zone,
        slotMinutes,
        slots,
        busiest,
        onTheHour: placed.filter(({ starts }) => starts.some((start) => start % 60 === 0)).length,
        total: placed.length,
    };
}
