const WIDTH = 120;
const HEIGHT = 32;
const PAD = 4;

// Recent values as a small line, oldest first, in the series color, with a
// surface ring around the newest one. Plain SVG, so it renders on the server
// with no JavaScript. The label reads the values out for screen readers.
const Sparkline = ({ values, label }: { values: number[]; label: string }) => {
    if (values.length < 2) return null;

    const low = Math.min(...values);
    const high = Math.max(...values);
    const points = values.map((value, i) => [
        PAD + (i / (values.length - 1)) * (WIDTH - 2 * PAD),
        high === low ? HEIGHT / 2 : HEIGHT - PAD - ((value - low) / (high - low)) * (HEIGHT - 2 * PAD),
    ]);
    const [endX, endY] = points[points.length - 1];

    return (
        <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label}>
            <polyline
                points={points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={endX} cy={endY} r={3} fill="var(--chart-1)" stroke="var(--color-dark-100)" strokeWidth={2} />
        </svg>
    )
}

export default Sparkline
