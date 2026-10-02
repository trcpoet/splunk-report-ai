import { NextResponse } from "next/server";
import { getReportBySlug, reports } from "@/lib/reports";

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
    return reports.map(({ slug }) => ({ slug }));
}

/**
 * GET /api/reports/[slug]
 * Returns one report, including its SPL query, latest results and run history.
 */
export async function GET(_req: Request, { params }: RouteParams) {
    const { slug } = await params;
    const report = getReportBySlug(slug);

    if (!report) {
        return NextResponse.json({ message: `Report '${slug}' not found` }, { status: 404 });
    }

    return NextResponse.json({ report });
}
