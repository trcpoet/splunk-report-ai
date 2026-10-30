'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import ChartBoundary from "@/components/ChartBoundary";
import ResultsTable from "@/components/ResultsTable";
import { AXIS_TICK, CHART_CLASS, GRID_STROKE, LINE_CURSOR, LINE_WIDTH, TOOLTIP_CLASS, X_TICK_MARGIN } from "@/lib/chart-theme";
import { formatClock, formatList, plural } from "@/lib/format";
import type { BusyTime, LoadSlot, ScheduleLoad } from "@/lib/schedule-load";

// One series, so one color, the accent: not a status color, since a busy
// minute isn't a failure.
const config = {
    running: { label: 'Running at once', color: 'var(--color-primary)' },
} satisfies ChartConfig;

const DAY_MINUTES = 1440;

// Every 3 hours, from midnight to midnight.
const TICKS = Array.from({ length: 9 }, (_, i) => i * 180);

const ACTIVE_DOT = { r: 4, strokeWidth: 2, stroke: 'var(--color-dark-100)', fill: 'var(--color-running)' };

// Report names and busy times listed before "and N more".
const MAX_NAMES = 5;
const MAX_TIMES = 8;

// "a, b, and c"; past `max`, "a, b, and 3 more".
const listed = (items: string[], max: number, more: (count: number) => string) =>
    formatList(items.length > max ? [...items.slice(0, max), more(items.length - max)] : items);

const names = (reports: string[]) => listed(reports, MAX_NAMES, (count) => `${count} more`);

// The closing point at midnight shows as the last slot.
const slotTime = (minute: number, slotMinutes: number) => {
    const start = Math.min(minute, DAY_MINUTES - slotMinutes);
    return `${formatClock(start)}–${formatClock(start + slotMinutes)}`;
};

// "08:00 on Mondays", or "06:00–06:15" when the next slots are as busy.
const busyTime = ({ minute, until, on }: BusyTime, slotMinutes: number) =>
    `${until - minute > slotMinutes ? `${formatClock(minute)}–${formatClock(until)}` : formatClock(minute)}${on ? ` on ${on}` : ''}`;

const atOnce = (running: number) => `${plural(running, 'search', 'searches')} at once`;

function LoadTooltip({ active, payload, slotMinutes }: { active?: boolean; payload?: { payload?: LoadSlot }[]; slotMinutes: number }) {
    const slot = payload?.[0]?.payload;
    if (!active || !slot) return null;

    return (
        <div className={`grid max-w-72 gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl ${TOOLTIP_CLASS}`}>
            <span className="font-medium">{slotTime(slot.minute, slotMinutes)}</span>
            <span>{slot.running > 0 ? atOnce(slot.running) : 'Nothing running'}</span>
            {slot.reports.length > 0 && <span className="text-light-200">{names(slot.reports)}</span>}
        </div>
    );
}

// How many of the reports' searches run at once through the day, from their
// schedules and usual run times (lib/schedule-load.ts). The busiest times and
// the table spell out what the step line shows.
const SchedulerLoad = ({ load }: { load: ScheduleLoad }) => {
    const { slots, slotMinutes, busiest, onTheHour, total, timeZone } = load;
    const busy = slots.filter(({ running }) => running > 0);
    const timeColumn = `Time (${timeZone})`;
    // A step runs from its point to the next one, so the last slot needs a
    // closing point at midnight to be drawn.
    const data = [...slots, { ...slots[slots.length - 1], minute: DAY_MINUTES }];

    return (
        <figure className="chart-card">
            <figcaption className="flex flex-col gap-0.5">
                <span className="chart-heading">When searches run</span>
                <span className="chart-subtitle">The most searches running at once, by time of day ({timeZone})</span>
            </figcaption>

            <ChartBoundary>
                <ChartContainer config={config} className={CHART_CLASS} style={{ height: 220 }} aria-label="Step chart of how many searches run at once through the day">
                    <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                        <XAxis
                            dataKey="minute"
                            type="number"
                            domain={[0, DAY_MINUTES]}
                            ticks={TICKS}
                            tickFormatter={formatClock}
                            interval="preserveStartEnd"
                            minTickGap={8}
                            tickMargin={X_TICK_MARGIN}
                            tickLine={false}
                            axisLine={false}
                            tick={AXIS_TICK}
                        />
                        <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={32} allowDecimals={false} />
                        <ChartTooltip cursor={LINE_CURSOR} content={<LoadTooltip slotMinutes={slotMinutes} />} />
                        <Area
                            dataKey="running"
                            type="stepAfter"
                            stroke="var(--color-running)"
                            strokeWidth={LINE_WIDTH}
                            fill="var(--color-running)"
                            fillOpacity={0.1}
                            dot={false}
                            activeDot={ACTIVE_DOT}
                        />
                    </AreaChart>
                </ChartContainer>
            </ChartBoundary>

            <div className="load-notes">
                {busiest.length > 0 ? (
                    <ul>
                        {busiest.map(({ running, times }) => (
                            <li key={running}>
                                <span className="when">
                                    {listed(times.map((time) => busyTime(time, slotMinutes)), MAX_TIMES, (count) => `${count} more times`)}
                                </span>
                                {': '}{atOnce(running)}
                                {times.length === 1 && ` (${names(times[0].reports)})`}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>No two searches run at the same time.</p>
                )}

                {onTheHour >= 3 && onTheHour * 2 >= total && (
                    <p>
                        {onTheHour} of {total} reports start on the hour. Moving some to other minutes, or giving them a
                        schedule window in Splunk, spreads the load.
                    </p>
                )}

                <p className="quiet">Counts only the reports in this app. The search head&apos;s limit counts every scheduled search.</p>
            </div>

            <details>
                <summary>Show as table</summary>
                <ResultsTable
                    columns={[timeColumn, 'At once', 'Reports']}
                    rows={busy.map(({ minute, running, reports }) => [slotTime(minute, slotMinutes), running, reports.join(', ')])}
                    sortValues={{ [timeColumn]: busy.map(({ minute }) => minute) }}
                />
            </details>
        </figure>
    );
};

export default SchedulerLoad;
