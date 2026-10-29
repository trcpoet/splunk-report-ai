import { aiOffMessage, aiStatus } from "@/lib/ai/config";
import { reportsContext } from "@/lib/ai/context";
import { reportSummaryKey } from "@/lib/ai/keys";
import { REPORT_SUMMARY_PROMPT } from "@/lib/ai/prompts";
import { streamSummary } from "@/lib/ai/summaries";
import { jsonError } from "@/lib/ai/turn";
import { getSyncInfo, getViewerOrNull, getVisibleReport, getVisibleReports } from "@/lib/dal";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * POST /api/ai/explain/[slug]
 * A plain-words summary of one report's latest run, streamed as NDJSON
 * (lib/ai/stream.ts). It's written once per run and saved; later requests get
 * the saved one. The AI sees only this report. A report the viewer may not
 * see gets the same 404 as a missing one.
 */
export async function POST(_request: Request, { params }: RouteParams) {
    const viewer = await getViewerOrNull();
    if (!viewer) return jsonError(401, 'Sign in to see reports.');

    const { slug } = await params;
    const [reports, sync] = await Promise.all([getVisibleReports(), getSyncInfo()]);
    const report = reports.find((visible) => visible.slug === slug);
    if (!report) return jsonError(404, 'Report not found.');

    const status = aiStatus(sync?.mode);
    if (!status.enabled) return jsonError(503, aiOffMessage(status.reason));

    return streamSummary({
        viewer,
        key: reportSummaryKey(report),
        kind: 'report',
        // The results load only when a new summary is written.
        system: async () => {
            const withResults = await getVisibleReport(slug);
            if (!withResults) throw new Error(`Report ${slug} went away while its summary was being written.`);
            return `${REPORT_SUMMARY_PROMPT}\n\n${reportsContext([withResults], sync)}`;
        },
        question: 'Explain this report.',
    });
}
