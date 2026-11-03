import { aiOffMessage, aiStatus } from "@/ai/config";
import { reportsContext } from "@/ai/context";
import { briefingKey } from "@/ai/keys";
import { BRIEFING_PROMPT, WRITE_BRIEFING } from "@/ai/prompts";
import { streamSummary } from "@/ai/summaries";
import { jsonError } from "@/ai/turn";
import { getSyncInfo, getViewerOrNull, getVisibleReports, getVisibleReportsWithResults } from "@/reports/dal";

export const maxDuration = 60;

/**
 * POST /api/ai/briefing
 * Two or three sentences on what matters across the reports the signed-in
 * person can see, streamed as NDJSON. Written once per set of reports and
 * run (src/ai/keys.ts), and shared by everyone who sees the same reports.
 */
export async function POST() {
    const viewer = await getViewerOrNull();
    if (!viewer) return jsonError(401, 'Sign in to see reports.');

    const [reports, sync] = await Promise.all([getVisibleReports(), getSyncInfo()]);
    if (reports.length === 0) return jsonError(404, 'There are no reports to summarize yet.');

    const status = aiStatus(sync?.mode);
    if (!status.enabled) return jsonError(503, aiOffMessage(status.reason));

    return streamSummary({
        viewer,
        key: briefingKey(reports),
        kind: 'briefing',
        // The results load only when a new briefing is written.
        system: async () => `${BRIEFING_PROMPT}\n\n${reportsContext(await getVisibleReportsWithResults(), sync)}`,
        question: WRITE_BRIEFING,
    });
}
