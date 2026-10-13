'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import type { LabelProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, X_TICK_MARGIN, BAND_CURSOR, CHART_CLASS, GRID_STROKE, LINE_CURSOR, LINE_WIDTH, MAX_BAR_SIZE, TOOLTIP_CLASS } from "@/lib/chart-theme";
import { formatCompact, formatNumber } from "@/lib/format";
import type { Cell, ReportChart as ChartSpec } from "@/lib/reports";

type Props = {
    chart: ChartSpec;
    columns: string[];
    rows: Cell[][];
};

type Box = { x?: number | string; y?: number | string; width?: number | string; height?: number | string };

// One measure from the latest results, in one color. A single series needs no
// legend: the heading names what is plotted, and the results table below the
// chart is its table view.
const ReportChart = ({ chart, columns, rows }: Props) => {
    const x = columns.indexOf(chart.x);
    const y = columns.indexOf(chart.y);
    const data = rows
        .map((row) => ({ label: String(row[x]), value: Number(row[y]) }))
        .filter((point) => Number.isFinite(point.value));

    if (data.length === 0) return null;

    const config = { value: { label: chart.y, color: 'var(--chart-1)' } } satisfies ChartConfig;
    const peak = data.reduce((best, point, i) => (point.value > data[best].value ? i : best), 0);
    const description = `${chart.type === 'bar' || chart.type === 'column' ? 'Bar' : 'Line'} chart of ${chart.y} by ${chart.x}`;

    // Only the largest value gets a label; the axis, tooltip and table carry the rest.
    const peakLabel = (placement: 'end' | 'top') => function PeakLabel({ index, value, viewBox }: LabelProps) {
        if (index !== peak) return null;

        const box = (viewBox ?? {}) as Box;
        const [left, top, width, height] = [box.x, box.y, box.width, box.height].map(Number);
        const text = formatNumber(Number(value));

        return placement === 'end'
            ? <text x={left + width + 6} y={top + height / 2} dominantBaseline="central" className="fill-light-100 text-xs">{text}</text>
            : <text x={left + width / 2} y={top - 6} textAnchor="middle" className="fill-light-100 text-xs">{text}</text>;
    };

    const tooltip = (
        <ChartTooltip
            cursor={chart.type === 'bar' || chart.type === 'column' ? BAND_CURSOR : LINE_CURSOR}
            content={<ChartTooltipContent className={TOOLTIP_CLASS} />}
        />
    );

    if (chart.type === 'bar') {
        // Wide enough for the longest category label, within reason.
        const labelWidth = Math.min(160, Math.max(...data.map(({ label }) => label.length)) * 7 + 12);

        return (
            <ChartContainer config={config} className={CHART_CLASS} style={{ height: data.length * 36 + 40 }} aria-label={description}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                    <XAxis tickMargin={X_TICK_MARGIN} type="number" tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="label" width={labelWidth} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    {tooltip}
                    <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={MAX_BAR_SIZE}>
                        <LabelList dataKey="value" content={peakLabel('end')} />
                    </Bar>
                </BarChart>
            </ChartContainer>
        );
    }

    const common = (
        <>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis tickMargin={X_TICK_MARGIN} dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} />
            {tooltip}
        </>
    );

    if (chart.type === 'column') {
        return (
            <ChartContainer config={config} className={CHART_CLASS} style={{ height: 280 }} aria-label={description}>
                <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }}>
                    {common}
                    <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={MAX_BAR_SIZE}>
                        <LabelList dataKey="value" content={peakLabel('top')} />
                    </Bar>
                </BarChart>
            </ChartContainer>
        );
    }

    // Line and area: for time series (Splunk timechart), with a dot at the end.
    const endDot = { r: 4, strokeWidth: 2, stroke: 'var(--color-dark-100)', fill: 'var(--color-value)' };
    const lastDot = (props: { cx?: number; cy?: number; index?: number }) =>
        props.index === data.length - 1 ? <circle key="end" cx={props.cx} cy={props.cy} {...endDot} /> : <g key={props.index} />;

    return (
        <ChartContainer config={config} className={CHART_CLASS} style={{ height: 280 }} aria-label={description}>
            {chart.type === 'area' ? (
                <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                    {common}
                    <Area dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={LINE_WIDTH} fill="var(--color-value)" fillOpacity={0.1} dot={lastDot} activeDot={endDot} />
                </AreaChart>
            ) : (
                <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                    {common}
                    <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={LINE_WIDTH} dot={lastDot} activeDot={endDot} />
                </LineChart>
            )}
        </ChartContainer>
    );
}

export default ReportChart
