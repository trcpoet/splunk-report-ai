import { aiOffMessage, aiStatus } from "@/lib/ai/config";
import { reportsContext } from "@/lib/ai/context";
import { reportAndSplKey, reportSummaryKey } from "@/lib/ai/keys";
import { EXPLAIN_REPORT_AND_SPL, REPORT_AND_SPL_PROMPT, REPORT_SUMMARY_PROMPT } from "@/lib/ai/prompts";
import { streamSummary } from "@/lib/ai/summaries";
import { jsonError } from "@/lib/ai/turn";
import { getSyncInfo, getViewerOrNull, getVisibleReport, getVisibleReports } from "@/lib/dal";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * POST /api/ai/explain/[slug]
 * A plain-words summary of one report's latest run, streamed as NDJSON
 * (lib/ai/stream.ts). With ?with=spl ("Explain report and SPL"), a longer text
 * that also walks through its search one pipe command at a time. Each is
 * written once per run and saved; later requests get the saved one. The AI
 * sees only this report. A report the viewer may not see gets the same 404 as
 * a missing one.
 */
export async function POST(request: Request, { params }: RouteParams) {
    const viewer = await getViewerOrNull();
    if (!viewer) return jsonError(401, 'Sign in to see reports.');

    const { slug } = await params;
    const [reports, sync] = await Promise.all([getVisibleReports(), getSyncInfo()]);
    const report = reports.find((visible) => visible.slug === slug);
    if (!report) return jsonError(404, 'Report not found.');

    const status = aiStatus(sync?.mode);
    if (!status.enabled) return jsonError(503, aiOffMessage(status.reason));

    const withSpl = new URL(request.url).searchParams.get('with') === 'spl';

    return streamSummary({
        viewer,
        key: withSpl ? reportAndSplKey(report) : reportSummaryKey(report),
        kind: withSpl ? 'report-spl' : 'report',
        // The results load only when a new summary is written.
        system: async () => {
            const withResults = await getVisibleReport(slug);
            if (!withResults) throw new Error(`Report ${slug} went away while its summary was being written.`);
            return `${withSpl ? REPORT_AND_SPL_PROMPT : REPORT_SUMMARY_PROMPT}\n\n${reportsContext([withResults], sync)}`;
        },
        question: withSpl ? EXPLAIN_REPORT_AND_SPL : 'Explain this report.',
    });
}
