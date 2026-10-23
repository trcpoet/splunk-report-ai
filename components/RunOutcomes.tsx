'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import ChartBoundary from "@/components/ChartBoundary";
import ResultsTable from "@/components/ResultsTable";
import { AXIS_TICK, X_TICK_MARGIN, BAND_CURSOR, CHART_CLASS, GRID_STROKE, MAX_BAR_SIZE, TOOLTIP_CLASS } from "@/lib/chart-theme";
import { formatDay } from "@/lib/format";
import type { RunOutcomeDay } from "@/lib/reports";

// Bottom to top. The colors are the reserved status colors, always shown with a
// text label (legend, tooltip, table), never as color alone.
const OUTCOMES = ['success', 'warning', 'failed'] as const;
type Outcome = (typeof OUTCOMES)[number];

const config = {
    success: { label: 'Healthy', color: 'var(--status-success)' },
    warning: { label: 'Warning', color: 'var(--status-warning)' },
    failed: { label: 'Failed', color: 'var(--status-failed)' },
} satisfies ChartConfig;

const GAP = 2;
const RADIUS = 4;

// Legend and tooltip follow the stack order instead of sorting alphabetically.
const byOutcome = (item: { dataKey?: unknown }) => OUTCOMES.indexOf(item.dataKey as Outcome);

// One stacked segment. A 2px surface gap separates it from the segment above,
// and only the top of the stack gets the rounded data end.
function StackSegment({ x, y, width, height, fill, payload, outcome }: BarShapeProps & { outcome: Outcome }) {
    if (!height || height <= 0) return <g />;

    const hasAbove = OUTCOMES.slice(OUTCOMES.indexOf(outcome) + 1).some((key) => payload?.[key] > 0);
    const top = hasAbove ? y + GAP : y;
    const h = Math.max(0, height - (hasAbove ? GAP : 0));
    const r = hasAbove ? 0 : Math.min(RADIUS, h, width / 2);

    const path = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`;
    return <path d={path} fill={fill} />;
}

// Scheduled runs per day by outcome, across the reports the viewer can see.
const RunOutcomes = ({ days }: { days: RunOutcomeDay[] }) => {
    const data = days.map((day) => ({ ...day, label: formatDay(`${day.day}T00:00:00Z`) }));
    const first = data[0]?.label;
    const last = data.at(-1)?.label;

    return (
        <figure className="chart-card">
            <figcaption className="flex flex-col gap-0.5">
                <span className="chart-heading">Scheduled runs per day</span>
                <span className="chart-subtitle">By outcome, {first} to {last} (UTC)</span>
            </figcaption>

            <ChartBoundary>
                <ChartContainer config={config} className={CHART_CLASS} style={{ height: 260 }} aria-label="Stacked bar chart of scheduled runs per day by outcome">
                    <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                        <XAxis tickMargin={X_TICK_MARGIN} dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                        <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={32} allowDecimals={false} />
                        <ChartTooltip cursor={BAND_CURSOR} itemSorter={byOutcome} content={<ChartTooltipContent className={TOOLTIP_CLASS} />} />
                        <ChartLegend itemSorter={byOutcome} content={<ChartLegendContent />} />
                        {OUTCOMES.map((outcome) => (
                            <Bar
                                key={outcome}
                                dataKey={outcome}
                                stackId="runs"
                                fill={`var(--color-${outcome})`}
                                maxBarSize={MAX_BAR_SIZE}
                                shape={(props: BarShapeProps) => <StackSegment {...props} outcome={outcome} />}
                            />
                        ))}
                    </BarChart>
                </ChartContainer>
            </ChartBoundary>

            <details>
                <summary>Show as table</summary>
                <ResultsTable
                    columns={['Day (UTC)', 'Healthy', 'Warning', 'Failed']}
                    rows={data.map(({ label, success, warning, failed }) => [label, success, warning, failed])}
                    sortValues={{ 'Day (UTC)': data.map(({ day }) => day) }}
                />
            </details>
        </figure>
    )
}

export default RunOutcomes
