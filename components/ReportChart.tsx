'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell as BarCell, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import type { LabelProps } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, X_TICK_MARGIN, BAND_CURSOR, CHART_CLASS, GRID_STROKE, LINE_CURSOR, LINE_WIDTH, MAX_BAR_SIZE, METER_TRACK_FILL, OVER_THRESHOLD_FILL, THRESHOLD_LINE, TOOLTIP_CLASS } from "@/lib/chart-theme";
import { formatCompact, formatNumber, parseNumber } from "@/lib/format";
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
//
// A threshold adds a dashed line at the limit, and the values past it take the
// warning color. A max turns bars into meters: each one fills a track up to it.
const SingleChart = ({ chart, columns, rows }: Props) => {
    const x = columns.indexOf(chart.x);
    const y = columns.indexOf(chart.y);
    // Text such as "$18,402,117" is plotted as its number and labeled as written.
    const data = rows
        .map((row) => {
            const cell = row[y];
            return { label: String(row[x]), value: parseNumber(cell) ?? Number.NaN, text: typeof cell === 'number' ? formatNumber(cell) : cell };
        })
        .filter((point) => Number.isFinite(point.value));

    if (data.length === 0) return null;

    const { threshold, max } = chart;
    const isBars = chart.type === 'bar' || chart.type === 'column';
    const config = { value: { label: chart.y, color: 'var(--chart-1)' } } satisfies ChartConfig;
    const peak = data.reduce((best, point, i) => (point.value > data[best].value ? i : best), 0);
    const isOver = (value: number) => threshold !== undefined && value > threshold.value;
    const description = `${isBars ? 'Bar' : 'Line'} chart of ${chart.y} by ${chart.x}${threshold ? `, with a line at the ${threshold.label}` : ''}`;

    // Only the largest value and the values past the threshold get a label; the
    // axis, tooltip and table carry the rest.
    const valueLabel = (placement: 'end' | 'top') => function ValueLabel({ index, viewBox }: LabelProps) {
        if (index === undefined || (index !== peak && !isOver(data[index].value))) return null;

        const box = (viewBox ?? {}) as Box;
        const [left, top, width, height] = [box.x, box.y, box.width, box.height].map(Number);
        const text = data[index].text;

        return placement === 'end'
            ? <text x={left + width + 6} y={top + height / 2} dominantBaseline="central" className="fill-light-100 text-xs">{text}</text>
            : <text x={left + width / 2} y={top - 6} textAnchor="middle" className="fill-light-100 text-xs">{text}</text>;
    };

    const tooltip = (
        <ChartTooltip
            cursor={isBars ? BAND_CURSOR : LINE_CURSOR}
            content={<ChartTooltipContent className={TOOLTIP_CLASS} />}
        />
    );

    // Horizontal bars get a vertical line labeled above the plot; the other
    // charts get a horizontal line labeled at its right end. extendDomain keeps
    // the line on the chart even when every value is below it.
    const thresholdLine = threshold && (
        <ReferenceLine
            {...(chart.type === 'bar' ? { x: threshold.value } : { y: threshold.value })}
            {...THRESHOLD_LINE}
            ifOverflow="extendDomain"
            label={{ value: threshold.label, position: chart.type === 'bar' ? 'top' : 'insideTopRight', fill: 'var(--color-light-200)', fontSize: 12 }}
        />
    );

    const barFills = threshold && data.map((point, i) => (
        <BarCell key={i} fill={isOver(point.value) ? OVER_THRESHOLD_FILL : 'var(--color-value)'} />
    ));

    const domain = max === undefined ? undefined : [0, max];

    if (chart.type === 'bar') {
        // Wide enough for the longest category label, within reason.
        const labelWidth = Math.min(160, Math.max(...data.map(({ label }) => label.length)) * 7 + 12);
        // Room above the plot for the threshold's label.
        const top = threshold ? 22 : 4;
        // Room after the bars for the longest value label, such as "$18,402,117".
        const right = Math.max(56, ...data.filter((point, i) => i === peak || isOver(point.value)).map(({ text }) => String(text).length * 7 + 10));

        return (
            <ChartContainer config={config} className={CHART_CLASS} style={{ height: data.length * 36 + 36 + top }} aria-label={description}>
                <BarChart data={data} layout="vertical" margin={{ top, right, bottom: 4, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                    <XAxis tickMargin={X_TICK_MARGIN} type="number" domain={domain} tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    <YAxis type="category" dataKey="label" width={labelWidth} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                    {tooltip}
                    <Bar
                        dataKey="value"
                        fill="var(--color-value)"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={MAX_BAR_SIZE}
                        background={domain && { fill: METER_TRACK_FILL, radius: 4 }}
                    >
                        {barFills}
                        <LabelList dataKey="value" content={valueLabel('end')} />
                    </Bar>
                    {thresholdLine}
                </BarChart>
            </ChartContainer>
        );
    }

    const common = (
        <>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis tickMargin={X_TICK_MARGIN} dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={16} />
            <YAxis domain={domain} tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} />
            {tooltip}
        </>
    );

    if (chart.type === 'column') {
        return (
            <ChartContainer config={config} className={CHART_CLASS} style={{ height: 280 }} aria-label={description}>
                <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }}>
                    {common}
                    <Bar
                        dataKey="value"
                        fill="var(--color-value)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={MAX_BAR_SIZE}
                        background={domain && { fill: METER_TRACK_FILL, radius: 4 }}
                    >
                        {barFills}
                        <LabelList dataKey="value" content={valueLabel('top')} />
                    </Bar>
                    {thresholdLine}
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
                    {thresholdLine}
                </AreaChart>
            ) : (
                <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                    {common}
                    <Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={LINE_WIDTH} dot={lastDot} activeDot={endDot} />
                    {thresholdLine}
                </LineChart>
            )}
        </ChartContainer>
    );
}

// With panels, one small chart per measure (small multiples). Each keeps the
// rows in the results order, so a category sits in the same place in every chart.
const ReportChart = ({ chart, columns, rows }: Props) => {
    if (!chart.panels) return <SingleChart chart={chart} columns={columns} rows={rows} />;

    return (
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {chart.panels.map(({ y, threshold }) => (
                <div key={y} className="flex min-w-0 flex-col gap-1">
                    <span className="text-light-100 text-sm font-semibold">{y}</span>
                    <SingleChart chart={{ type: chart.type, x: chart.x, y, ...(threshold ? { threshold } : {}) }} columns={columns} rows={rows} />
                </div>
            ))}
        </div>
    );
}

export default ReportChart
