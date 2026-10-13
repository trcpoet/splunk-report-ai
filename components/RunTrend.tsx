'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, X_TICK_MARGIN, CHART_CLASS, GRID_STROKE, LINE_CURSOR, LINE_WIDTH, TOOLTIP_CLASS } from "@/lib/chart-theme";
import { formatCompact, formatDateTime, formatDay, formatTime } from "@/lib/format";
import type { RunRecord } from "@/lib/reports";

const config = { results: { label: 'Results', color: 'var(--chart-1)' } } satisfies ChartConfig;

const endDot = { r: 4, strokeWidth: 2, stroke: 'var(--color-dark-100)', fill: 'var(--color-results)' };

// Result count for each stored run, oldest to newest. One series, so no legend.
// Skipped runs are gaps in the line, not zeros. The run history table below is
// the table view.
const RunTrend = ({ runs }: { runs: RunRecord[] }) => {
    const sameDay = new Set(runs.map(({ runAt }) => runAt.slice(0, 10))).size === 1;
    const data = runs.map((run) => ({
        label: sameDay ? formatTime(run.runAt) : formatDay(run.runAt),
        when: formatDateTime(run.runAt),
        results: run.status === 'failed' ? null : run.resultCount,
    }));
    const last = data.findLastIndex((point) => point.results !== null);

    if (last === -1) return null;

    // A ringed dot marks the newest value; its number sits next to it.
    const lastDot = (props: { cx?: number; cy?: number; index?: number; value?: number }) =>
        props.index === last ? (
            <g key="end">
                <circle cx={props.cx} cy={props.cy} {...endDot} />
                <text x={(props.cx ?? 0) + 10} y={props.cy} dominantBaseline="central" className="fill-light-100 text-xs">
                    {formatCompact(Number(props.value))}
                </text>
            </g>
        ) : <g key={props.index} />;

    return (
        <ChartContainer config={config} className={CHART_CLASS} style={{ height: 200 }} aria-label="Line chart of results per run">
            <LineChart data={data} margin={{ top: 16, right: 40, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis tickMargin={X_TICK_MARGIN} dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} allowDecimals={false} />
                <ChartTooltip
                    cursor={LINE_CURSOR}
                    content={<ChartTooltipContent className={TOOLTIP_CLASS} labelFormatter={(_, payload) => payload?.[0]?.payload?.when} />}
                />
                <Line dataKey="results" type="linear" stroke="var(--color-results)" strokeWidth={LINE_WIDTH} connectNulls={false} dot={lastDot} activeDot={endDot} />
            </LineChart>
        </ChartContainer>
    )
}

export default RunTrend
