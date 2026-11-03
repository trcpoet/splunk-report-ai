import { aiOffMessage, aiStatus } from "@/ai/config";
import { reportsContext } from "@/ai/context";
import { reportAndSplKey, reportSummaryKey } from "@/ai/keys";
import { AiError } from "@/ai/llm";
import { EXPLAIN_REPORT, EXPLAIN_REPORT_AND_SPL, REPORT_AND_SPL_PROMPT, REPORT_SUMMARY_PROMPT } from "@/ai/prompts";
import { streamSummary } from "@/ai/summaries";
import { jsonError } from "@/ai/turn";
import { getSyncInfo, getViewerOrNull, getVisibleReport, getVisibleReports } from "@/reports/dal";

export const maxDuration = 60;

type RouteParams = { params: Promise<{ slug: string }> };

// The two texts this route writes: Explain's summary, and with ?with=spl,
// "Explain report and SPL", which also walks through the search.
const MODES = {
    report: { key: reportSummaryKey, kind: 'report', prompt: REPORT_SUMMARY_PROMPT, question: EXPLAIN_REPORT },
    spl: { key: reportAndSplKey, kind: 'report-spl', prompt: REPORT_AND_SPL_PROMPT, question: EXPLAIN_REPORT_AND_SPL },
} as const;

/**
 * POST /api/ai/explain/[slug]
 * A plain-words summary of one report's latest run, streamed as NDJSON
 * (src/ai/stream.ts). With ?with=spl ("Explain report and SPL"), a longer text
 * that also walks through its search one pipe command at a time. Each is
 * written once per run (and search) and saved; later requests get the saved
 * one. The AI sees only this report. A report the viewer may not see gets the
 * same 404 as a missing one.
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

    const mode = new URL(request.url).searchParams.get('with') === 'spl' ? MODES.spl : MODES.report;
    const key = mode.key(report);

    return streamSummary({
        viewer,
        key,
        kind: mode.kind,
        // The results load only when a new summary is written.
        system: async () => {
            const withResults = await getVisibleReport(slug);
            if (!withResults) throw new Error(`Report ${slug} went away while its summary was being written.`);
            // A sync between the two reads: don't save text about data the key doesn't name.
            if (mode.key(withResults) !== key) throw new AiError('unavailable', 'This report just got new data. Open it again to explain the newest run.');
            return `${mode.prompt}\n\n${reportsContext([withResults], sync)}`;
        },
        question: mode.question,
    });
}
