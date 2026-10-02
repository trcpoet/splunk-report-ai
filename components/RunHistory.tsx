import type { RunRecord } from "@/lib/reports";
import { formatDateTime } from "@/lib/format";

const RunHistory = ({ runs }: { runs: RunRecord[] }) => (
    <div className="run-history">
        <span className="label">Last {runs.length} runs</span>
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
