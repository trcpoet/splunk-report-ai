import type { RunRecord } from "@/lib/reports";
import { formatDateTime, plural } from "@/lib/format";

// A dot per recent run, colored by its outcome. Nothing until the first run:
// the status badge says "No runs yet".
const RunHistory = ({ runs }: { runs: RunRecord[] }) => runs.length > 0 && (
    <div className="run-history">
        <span className="label">Last {plural(runs.length, 'run', 'runs')}</span>
        {runs.map((run) => (
            <span
                key={run.runAt}
                className={`run run-${run.status}`}
                title={`${formatDateTime(run.runAt)}: ${run.status}`}
            />
        ))}
    </div>
)

export default RunHistory
