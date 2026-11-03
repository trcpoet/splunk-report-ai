'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell as BarCell, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import type { LabelProps } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AXIS_TICK, X_TICK_MARGIN, BAND_CURSOR, CHART_CLASS, GRID_STROKE, LINE_CURSOR, LINE_WIDTH, MAX_BAR_SIZE, METER_TRACK_FILL, OVER_THRESHOLD_FILL, THRESHOLD_LINE, TOOLTIP_CLASS, tooltipTime } from "@/lib/chart-theme";
import { columnLabel, formatCell, formatCompact, formatList, formatNumber, parseNumber, timeAxisLabels } from "@/lib/format";
import { MAX_CHART_BARS, MAX_CHART_POINTS, type Cell, type ReportChart as ChartSpec } from "@/lib/reports";

type Props = {
    chart: ChartSpec;
    columns: string[];
    rows: Cell[][];
};

type Box = { x?: number | string; y?: number | string; width?: number | string; height?: number | string };

const isTimeAxis = ({ x }: ChartSpec) => x === '_time';

// What each row is called along the x-axis.
const axisLabels = (chart: ChartSpec, rows: Cell[][], x: number) => {
    const names = rows.map((row) => String(row[x] ?? ''));
    return isTimeAxis(chart) ? timeAxisLabels(names) : names;
};


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
    const labels = axisLabels(chart, rows, x);
    const data = rows
        .map((row, i) => {
            const cell = row[y];
            return { label: labels[i] ?? '', when: formatCell(row[x]), value: parseNumber(cell) ?? Number.NaN, text: formatCell(cell) };
        })
        .filter((point) => Number.isFinite(point.value));

    if (data.length === 0) return null;

    const { threshold, max } = chart;
    const isBars = chart.type === 'bar' || chart.type === 'column';
    const config = { value: { label: chart.y, color: 'var(--chart-1)' } } satisfies ChartConfig;
    // The first point with the largest value.
    const largest = Math.max(...data.map(({ value }) => value));
    const peak = data.findIndex((point) => point.value === largest);
    const isOver = (value: number) => threshold !== undefined && value > threshold.value;
    const description = `${isBars ? 'Bar' : 'Line'} chart of ${chart.y} by ${chart.x}${threshold ? `, with a line at the ${threshold.label}` : ''}`;

    // Only the largest value and the values past the threshold get a label; the
    // axis, tooltip and table carry the rest.
    const valueLabel = (placement: 'end' | 'top') => function ValueLabel({ index, viewBox }: LabelProps) {
        const point = index === undefined ? undefined : data[index];
        if (!point || (index !== peak && !isOver(point.value))) return null;

        const box = (viewBox ?? {}) as Box;
        const left = Number(box.x);
        const top = Number(box.y);
        const width = Number(box.width);
        const height = Number(box.height);
        const text = point.text;

        return placement === 'end'
            ? <text x={left + width + 6} y={top + height / 2} dominantBaseline="central" className="fill-light-100 text-xs">{text}</text>
            : <text x={left + width / 2} y={top - 6} textAnchor="middle" className="fill-light-100 text-xs">{text}</text>;
    };

    const tooltip = (
        <ChartTooltip
            cursor={isBars ? BAND_CURSOR : LINE_CURSOR}
            content={<ChartTooltipContent className={TOOLTIP_CLASS} {...(isTimeAxis(chart) ? { labelFormatter: tooltipTime } : {})} />}
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
        // Recharts 4 removes Cell for Bar's shape prop. That draws hovered bars
        // differently, so the move is its own change, checked on screen.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        <BarCell key={i} fill={isOver(point.value) ? OVER_THRESHOLD_FILL : 'var(--color-value)'} />
    ));

    const domain = max === undefined ? undefined : [0, max];

    if (chart.type === 'bar') {
        // Wide enough for the longest category label, within reason.
        const labelWidth = Math.min(160, Math.max(...data.map(({ label }) => label.length)) * 7 + 12);
        // Room above the plot for the threshold's label.
        const top = threshold ? 22 : 4;
        // Room after the bars for the longest value label, such as "$18,402,117".
        const right = Math.max(56, ...data.filter((point, i) => i === peak || isOver(point.value)).map(({ text }) => text.length * 7 + 10));

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

// Names sit at the ends of up to this many lines, and the legend covers the rest.
const MAX_LABELED_LINES = 4;
// About how tall the plot is, and how far apart two names need to be to read.
const PLOT_HEIGHT = 230;
const MIN_LABEL_GAP = 16;

type LinePoint = { label: string; when: string } & Record<string, string | number | null>;

// The lines whose names fit at their last points, largest first. Two lines
// that end close together share one spot, so the lower one goes without.
function labeledLines(data: LinePoint[], keys: string[]) {
    if (keys.length < 2 || keys.length > MAX_LABELED_LINES) return new Set<string>();

    const lastValue = (key: string) => Number(data.findLast((point) => point[key] !== null)?.[key] ?? 0);
    const top = Math.max(...data.flatMap((point) => keys.map((key) => Number(point[key] ?? 0))), 1);
    const labeled = new Set<string>();
    let lowest = Number.POSITIVE_INFINITY;

    for (const key of keys.toSorted((a, b) => lastValue(b) - lastValue(a))) {
        const height = (lastValue(key) / top) * PLOT_HEIGHT;
        if (lowest - height < MIN_LABEL_GAP) continue;
        labeled.add(key);
        lowest = height;
    }
    return labeled;
}

// Results over time: one line per series, in the chart colors' fixed order. That
// order is what's validated for color-blind readers (some pairs apart in it are
// hard to tell apart), so a color doesn't come from a series' name, and a series
// can change color when the set of lines changes. The legend and the names carry
// identity. Series past the last color add up to one neutral "Other" line, with
// Splunk's own OTHER and NULL columns. An empty cell is a gap in the line,
// not a zero. The legend names every line; names at the line ends add to it where they fit.
const LineSeriesChart = ({ chart, columns, rows }: Props) => {
    const series = chart.series ?? [chart.y];
    const x = columns.indexOf(chart.x);
    const rest = chart.series ? columns.flatMap((name, i) => (i === x || series.includes(name) ? [] : [i])) : [];

    const otherValue = (row: Cell[]) => {
        const values = rest.flatMap((i) => parseNumber(row[i]) ?? []);
        return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const hasOther = rows.some((row) => otherValue(row) !== null);

    const labels = axisLabels(chart, rows, x);
    const data = rows.map((row, i): LinePoint => ({
        label: labels[i] ?? '',
        when: formatCell(row[x]),
        ...Object.fromEntries(series.map((name, s) => [`s${s}`, parseNumber(row[columns.indexOf(name)])])),
        ...(hasOther ? { other: otherValue(row) } : {}),
    }));

    const config: ChartConfig = Object.fromEntries(series.map((name, s) => [`s${s}`, { label: name, color: `var(--chart-${s + 1})` }]));
    if (hasOther) config.other = { label: 'Other', color: 'var(--color-light-200)' };

    const keys = Object.keys(config);
    // Legend and tooltip follow the lines' order instead of sorting by name.
    const byLine = (item: { dataKey?: unknown }) => keys.indexOf(String(item.dataKey));
    const labeled = labeledLines(data, keys);
    const names = hasOther ? [...series, 'Other'] : series;
    const description = `Line chart of ${formatList(names)} by ${columnLabel(chart.x).toLowerCase()}`;
    const { threshold, max } = chart;

    // The last point of a line gets a ringed dot and, if it fits, the line's
    // name. A point between two gaps has no line, so it needs a dot to show at all.
    const dotFor = (key: string) => {
        const last = data.findLastIndex((point) => point[key] !== null);

        return function LineDot({ cx, cy, index = 0 }: { cx?: number; cy?: number; index?: number }) {
            const alone = data[index - 1]?.[key] == null && data[index + 1]?.[key] == null && data[index]?.[key] != null;
            if (cx === undefined || cy === undefined || (index !== last && !alone)) return <g key={index} />;

            return (
                <g key={index}>
                    <circle cx={cx} cy={cy} r={4} strokeWidth={2} stroke="var(--color-dark-100)" fill={`var(--color-${key})`} />
                    {index === last && labeled.has(key) && (
                        <text x={cx - 8} y={cy - 8} textAnchor="end" className="fill-light-100 text-xs" stroke="var(--color-dark-100)" strokeWidth={3} paintOrder="stroke">
                            {config[key]?.label}
                        </text>
                    )}
                </g>
            );
        };
    };

    return (
        <ChartContainer config={config} className={CHART_CLASS} style={{ height: keys.length > 1 ? 310 : 280 }} aria-label={description}>
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis tickMargin={X_TICK_MARGIN} dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={16} />
                <YAxis domain={max === undefined ? undefined : [0, max]} tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} />
                <ChartTooltip cursor={LINE_CURSOR} itemSorter={byLine} content={<ChartTooltipContent className={TOOLTIP_CLASS} labelFormatter={tooltipTime} />} />
                {keys.length > 1 && <ChartLegend itemSorter={byLine} content={<ChartLegendContent className="flex-wrap gap-y-1 [&>div]:whitespace-nowrap" />} />}
                {keys.map((key) => (
                    <Line key={key} dataKey={key} type="linear" stroke={`var(--color-${key})`} strokeWidth={LINE_WIDTH} connectNulls={false} dot={dotFor(key)} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-dark-100)' }} />
                ))}
                {threshold && (
                    <ReferenceLine
                        y={threshold.value}
                        {...THRESHOLD_LINE}
                        ifOverflow="extendDomain"
                        label={{ value: threshold.label, position: 'insideTopRight', fill: 'var(--color-light-200)', fontSize: 12 }}
                    />
                )}
            </LineChart>
        </ChartContainer>
    );
}

// Charts keep the first rows, which a report sorts to put what matters on top.
// A line over time instead runs oldest to newest, whatever order Splunk sent,
// and keeps the newest. Rows with no time, such as a totals row, aren't points on it.
function shownRows(chart: ChartSpec, columns: string[], rows: Cell[][]) {
    const isBars = chart.type === 'bar' || chart.type === 'column';
    const limit = isBars ? MAX_CHART_BARS : MAX_CHART_POINTS;
    if (isBars || !isTimeAxis(chart)) return { limit, which: 'first', total: rows.length, shown: rows.slice(0, limit) };

    const x = columns.indexOf(chart.x);
    const time = (row: Cell[]) => Date.parse(String(row[x]));
    const timed = rows.filter((row) => Number.isFinite(time(row))).toSorted((a, b) => time(a) - time(b));
    return { limit, which: 'newest', total: timed.length, shown: timed.slice(-limit) };
}

// With panels, one small chart per measure (small multiples). Each keeps the
// rows in the results order, so a category sits in the same place in every chart.
function ChartBody({ chart, columns, rows }: Props) {
    if (chart.series || (isTimeAxis(chart) && chart.type === 'line')) return <LineSeriesChart chart={chart} columns={columns} rows={rows} />;
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

const ReportChart = ({ chart, columns, rows }: Props) => {
    const { limit, which, total, shown } = shownRows(chart, columns, rows);

    return (
        <>
            <ChartBody chart={chart} columns={columns} rows={shown} />
            {shown.length < total && (
                <p className="chart-subtitle">Showing the {which} {limit} of {formatNumber(total)} rows.</p>
            )}
        </>
    );
}

export default ReportChart
