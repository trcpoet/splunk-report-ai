import { NextResponse } from "next/server";
import { getViewerOrNull, getVisibleReport } from "@/lib/dal";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/reports/[slug]
 * Returns one report, including its SPL query, latest results and run history.
 * A report the user may not see gets the same 404 as a missing one.
 */
export async function GET(_req: Request, { params }: RouteParams) {
    if (!(await getViewerOrNull())) {
        return NextResponse.json({ message: 'Sign in to see reports.' }, { status: 401 });
    }

    const { slug } = await params;
    const report = await getVisibleReport(slug);

    if (!report) {
        return NextResponse.json({ message: `Report '${slug}' not found` }, { status: 404 });
    }

    return NextResponse.json({ report });
}
