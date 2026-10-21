'use client';

import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, CHART_CLASS, GRID_STROKE, TOOLTIP_CLASS, X_TICK_MARGIN } from "@/lib/chart-theme";
import { formatCompact, formatNumber, parseNumber } from "@/lib/format";
import type { Cell, ChartScatter, ReportChart } from "@/lib/reports";

type Props = {
    chart: ReportChart & { scatter: ChartScatter };
    columns: string[];
    rows: Cell[][];
};

type Point = {
    label: string;
    x: number;
    y: number;
    xText: string;
    yText: string;
    // Only the rows with the largest values get a name next to their dot. On
    // phones, only the key ones do: the top few and the two ends across.
    labeled: boolean;
    keyLabel: boolean;
    // Names go left of the dots near the right edge, so they stay on the chart.
    labelLeft: boolean;
};

// Enough names to read the pattern; the tooltip and the table carry the rest.
const MAX_LABELS = 8;
const MAX_PHONE_LABELS = 3;

const AXIS_LABEL = { fill: 'var(--color-light-200)', fontSize: 12 };

const asText = (cell: Cell) => (typeof cell === 'number' ? formatNumber(cell) : cell);

// 1, 10, 100, ... up to the top of a log axis.
const powersOfTen = (top: number) => Array.from({ length: Math.floor(Math.log10(top)) + 1 }, (_, i) => 10 ** i);

function ScatterTooltip({ active, payload, xName, yName }: { active?: boolean; payload?: { payload?: Point }[]; xName: string; yName: string }) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;

    return (
        <div className={`grid gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl ${TOOLTIP_CLASS}`}>
            <span className="font-medium">{point.label}</span>
            {[[yName, point.yText], [xName, point.xText]].map(([name, value]) => (
                <span key={name} className="flex justify-between gap-4">
                    <span className="text-light-200">{name}</span>
                    <span className="font-mono font-medium tabular-nums">{value}</span>
                </span>
            ))}
        </div>
    );
}

// A dot per row: the chart's measure going up, the scatter's measure going
// across, in one color. A single series needs no legend; the axis titles name
// both measures and the results table below is the table view.
const ReportScatter = ({ chart, columns, rows }: Props) => {
    const { scatter } = chart;
    const [labelAt, xAt, yAt] = [chart.x, scatter.x, chart.y].map((name) => columns.indexOf(name));

    const points = rows
        .map((row) => ({ row, x: parseNumber(row[xAt]) ?? Number.NaN, y: parseNumber(row[yAt]) ?? Number.NaN }))
        // A log axis can't show zero or less.
        .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && (!scatter.log || x > 0));

    if (points.length === 0) return null;

    const minX = Math.min(...points.map(({ x }) => x));
    const maxX = Math.max(...points.map(({ x }) => x));
    // Headroom past the right-most dot, so its name fits, and before the
    // left-most one on a log axis, so it isn't cut in half.
    const top = scatter.log ? maxX * 2 : maxX * 1.1;
    const bottom = scatter.log ? Math.min(1, minX / 1.6) : 0;
    const across = (x: number) => (scatter.log ? Math.log10(x / bottom) / Math.log10(top / bottom) : x / top);

    const byValue = [...points].sort((a, b) => b.y - a.y).map(({ row }) => row);
    const labeledRows = new Set(byValue.slice(0, MAX_LABELS));
    const keyRows = new Set([
        ...byValue.slice(0, MAX_PHONE_LABELS),
        points.find(({ x }) => x === minX)?.row,
        points.find(({ x }) => x === maxX)?.row,
    ]);

    const data: Point[] = points.map(({ row, x, y }) => ({
        label: String(row[labelAt]),
        x,
        y,
        xText: asText(row[xAt]),
        yText: asText(row[yAt]),
        labeled: labeledRows.has(row) || keyRows.has(row),
        keyLabel: keyRows.has(row),
        labelLeft: across(x) > 0.7,
    }));

    const config = { value: { label: chart.y, color: 'var(--chart-1)' } } satisfies ChartConfig;
    const description = `Scatter chart of ${chart.y} against ${scatter.x}${scatter.log ? ' on a log scale' : ''}, one dot per ${chart.x.toLowerCase()}`;

    // An 8px dot with a 2px ring in the surface color, inside a larger
    // transparent hit area for the tooltip.
    const dot = ({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) => {
        if (cx === undefined || cy === undefined || !payload) return <g />;

        return (
            <g>
                <circle cx={cx} cy={cy} r={12} fill="transparent" />
                <circle cx={cx} cy={cy} r={5} fill="var(--color-value)" stroke="var(--color-dark-100)" strokeWidth={2} />
                {payload.labeled && (
                    <text
                        x={payload.labelLeft ? cx - 10 : cx + 10}
                        y={cy}
                        textAnchor={payload.labelLeft ? 'end' : 'start'}
                        dominantBaseline="central"
                        className={`fill-light-100 text-xs ${payload.keyLabel ? '' : 'max-sm:hidden'}`}
                    >
                        {payload.label}
                    </text>
                )}
            </g>
        );
    };

    return (
        <ChartContainer config={config} className={CHART_CLASS} style={{ height: 320 }} aria-label={description}>
            <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID_STROKE} />
                <XAxis
                    type="number"
                    dataKey="x"
                    name={scatter.x}
                    {...(scatter.log
                        ? { scale: 'log' as const, domain: [bottom, top], ticks: powersOfTen(top), allowDataOverflow: true }
                        : { domain: [0, 'auto'] })}
                    tickFormatter={formatCompact}
                    tickMargin={X_TICK_MARGIN}
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS_TICK}
                    height={44}
                    label={{ value: scatter.x, position: 'insideBottom', ...AXIS_LABEL }}
                />
                <YAxis
                    type="number"
                    dataKey="y"
                    name={chart.y}
                    domain={[0, 'auto']}
                    tickFormatter={formatCompact}
                    tickLine={false}
                    axisLine={false}
                    tick={AXIS_TICK}
                    width={64}
                    label={{ value: chart.y, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, ...AXIS_LABEL }}
                />
                <ChartTooltip cursor={false} content={<ScatterTooltip xName={scatter.x} yName={chart.y} />} />
                <Scatter data={data} fill="var(--color-value)" shape={dot} />
            </ScatterChart>
        </ChartContainer>
    );
}

export default ReportScatter
