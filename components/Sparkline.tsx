const WIDTH = 120;
const HEIGHT = 32;
const PAD = 4;

type Props = {
    values: number[];
    label: string;
    // A run that stands out: the earlier runs step back into muted ink, the
    // newest takes the accent, and a dashed line marks the usual value.
    usual?: number;
    highlightLast?: boolean;
};

// Recent values as a small line, oldest first, in the series color, with a
// surface ring around the newest one. Plain SVG, so it renders on the server
// with no JavaScript. The label reads the values out for screen readers, and
// shows as a tooltip on hover.
const Sparkline = ({ values, label, usual, highlightLast = false }: Props) => {
    if (values.length < 2) return null;

    const low = Math.min(...values, usual ?? Infinity);
    const high = Math.max(...values, usual ?? -Infinity);
    const y = (value: number) => (high === low ? HEIGHT / 2 : HEIGHT - PAD - ((value - low) / (high - low)) * (HEIGHT - 2 * PAD));
    const points = values.map((value, i) => [PAD + (i / (values.length - 1)) * (WIDTH - 2 * PAD), y(value)]);
    const [endX, endY] = points[points.length - 1];

    return (
        <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label}>
            <title>{label}</title>
            {usual !== undefined && (
                <line x1={PAD} x2={WIDTH - PAD} y1={y(usual)} y2={y(usual)} stroke="var(--color-light-200)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" />
            )}
            <polyline
                points={points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={highlightLast ? 'var(--color-light-200)' : 'var(--chart-1)'}
                strokeOpacity={highlightLast ? 0.55 : 1}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={endX} cy={endY} r={highlightLast ? 4 : 3} fill="var(--chart-1)" stroke="var(--color-dark-100)" strokeWidth={2} />
        </svg>
    )
}

export default Sparkline
