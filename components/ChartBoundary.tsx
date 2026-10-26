'use client';

import { catchError } from "next/error";

// Keeps a chart that can't be drawn (say, live Splunk results in an unexpected
// shape) from taking the page down with it. Every chart has a table with the
// same values next to it, so the message points there.
const ChartError = () => (
    <p className="chart-error" role="status">
        This chart couldn’t be drawn. The table has every value.
    </p>
)

const ChartBoundary = catchError(ChartError);

export default ChartBoundary
