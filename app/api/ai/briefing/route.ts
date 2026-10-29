import { aiOffMessage, aiStatus } from "@/lib/ai/config";
import { reportsContext } from "@/lib/ai/context";
import { briefingKey } from "@/lib/ai/keys";
import { BRIEFING_PROMPT } from "@/lib/ai/prompts";
import { streamSummary } from "@/lib/ai/summaries";
import { jsonError } from "@/lib/ai/turn";
import { getSyncInfo, getViewerOrNull, getVisibleReports, getVisibleReportsWithResults } from "@/lib/dal";

export const maxDuration = 60;

/**
 * POST /api/ai/briefing
 * Two or three sentences on what matters across the reports the signed-in
 * person can see, streamed as NDJSON. Written once per set of reports and
 * run (lib/ai/keys.ts), and shared by everyone who sees the same reports.
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
        question: 'Write my briefing.',
    });
}
