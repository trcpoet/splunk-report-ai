// Shared chart chrome, following the dataviz rules: recessive axes, solid
// hairline gridlines one step off the surface, and text in text colors (never
// the series color). Charts sit on .chart-card (--color-dark-100).

// The shadcn chart container styles axis text and hover cursors with its
// light-theme tokens (--muted, --border). These overrides fit the dark surface.
// Recharts lets keyboard users focus a chart and move through it with the
// arrow keys; the container hides the chart's outline, so focus gets it back.
export const CHART_CLASS = [
    'aspect-auto w-full',
    '[&_.recharts-cartesian-axis-tick_text]:fill-light-200',
    '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-dark-200',
    '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-light-200',
    '[&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-primary',
].join(' ');

export const AXIS_TICK = { fontSize: 12 };

// Keeps x-axis labels clear of the y-axis "0".
export const X_TICK_MARGIN = 8;

export const GRID_STROKE = 'var(--color-dark-200)';

// Wide enough that a label and its value never run together.
export const TOOLTIP_CLASS = 'min-w-44 border-dark-200 bg-dark-100 text-light-100';

// Hover highlight behind the bar or column under the pointer.
export const BAND_CURSOR = { fill: 'var(--color-dark-200)', opacity: 0.6 };

// Crosshair for line and area charts.
export const LINE_CURSOR = { stroke: 'var(--color-light-200)', strokeWidth: 1 };

// Marks: bars at most 24px thick with a 4px rounded data end; 2px lines.
export const MAX_BAR_SIZE = 24;
export const LINE_WIDTH = 2;

// A limit across the chart, such as an error budget. Dashed, so it reads as a
// threshold rather than a gridline, and always labeled with its name.
export const THRESHOLD_LINE = { stroke: 'var(--status-warning)', strokeWidth: 1.5, strokeDasharray: '4 4' };

// Values past the threshold. They're what make the report's status rule warn,
// so they take the warning status color.
export const OVER_THRESHOLD_FILL = 'var(--status-warning)';

// The empty part of a meter bar, one step off the chart surface.
export const METER_TRACK_FILL = 'var(--color-dark-200)';
