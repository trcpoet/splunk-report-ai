'use client';

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PAGE_TRANSITION } from "@/components/Transitions";
import { linkReports } from "@/lib/ai/report-links";
import type { ReportStatus } from "@/lib/reports";

export type ReportChipData = { slug: string; title: string; status: ReportStatus };

// A report named in an answer: its status and name, linking to the report.
export const ReportChip = ({ report }: { report: ReportChipData }) => (
    <Link href={`/reports/${report.slug}`} className="report-chip" transitionTypes={PAGE_TRANSITION}>
        <span className={`dot dot-${report.status}`} aria-hidden="true" />
        {report.title}
    </Link>
)

const VisibleReports = createContext<Record<string, ReportChipData>>({});

// Links in an answer: report links become chips, anything else stays plain
// text, so an answer can't send people to other sites.
function AnswerLink({ href, children }: { href?: string; children?: ReactNode }) {
    const reports = useContext(VisibleReports);
    const slug = href?.match(/^\/reports\/([a-z0-9-]+)$/)?.[1];
    return slug && reports[slug] ? <ReportChip report={reports[slug]} /> : <>{children}</>;
}

const AnswerTable = ({ children }: { children?: ReactNode }) => (
    <div className="table-wrap"><table className="results-table">{children}</table></div>
)

// No images: one could load a tracking pixel from anywhere.
const NoImage = () => null;

const COMPONENTS: Components = { a: AnswerLink, table: AnswerTable, img: NoImage };

// An answer from Ask about reports. It's Markdown, which react-markdown shows
// without running any HTML in it, and its [[report-id]] markers become chips.
const ChatAnswer = ({ text, reports, streaming = false }: { text: string; reports: Record<string, ReportChipData>; streaming?: boolean }) => (
    <VisibleReports.Provider value={reports}>
        <div className="answer-text">
            <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
                {linkReports(text, new Set(Object.keys(reports)), streaming)}
            </Markdown>
        </div>
    </VisibleReports.Provider>
)

export default ChatAnswer
