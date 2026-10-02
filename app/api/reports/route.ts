import { NextResponse } from "next/server";
import { reports, toSummary } from "@/lib/reports";

/**
 * GET /api/reports
 * Lists every scheduled report (summary fields only).
 */
export function GET() {
    return NextResponse.json({ reports: reports.map(toSummary) });
}
