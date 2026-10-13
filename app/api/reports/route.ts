import { NextResponse } from "next/server";
import { getViewerOrNull, getVisibleReports } from "@/lib/dal";
import { toSummary } from "@/lib/reports";

/**
 * GET /api/reports
 * Lists the reports the signed-in user may see (summary fields only).
 */
export async function GET() {
    if (!(await getViewerOrNull())) {
        return NextResponse.json({ message: 'Sign in to see reports.' }, { status: 401 });
    }

    const reports = await getVisibleReports();
    return NextResponse.json({ reports: reports.map(toSummary) });
}
