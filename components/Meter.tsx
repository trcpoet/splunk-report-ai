// How much of a limit is used, as a thin bar: 1 fills it. At or past the limit
// the fill takes the warning color; the tile's text says what the limit is.
const Meter = ({ value, label }: { value: number; label: string }) => {
    const percent = Math.round(value * 100);

    return (
        <div
            className="meter"
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.max(100, percent)}
            aria-valuenow={percent}
            aria-valuetext={`${percent}% of the limit`}
        >
            <div className={value >= 1 ? 'fill over' : 'fill'} style={{ width: `${Math.min(value, 1) * 100}%` }} />
        </div>
    )
}

export default Meter
