'use client';

import { useState } from "react";
import { track } from "@/lib/analytics";

type Cell = string | number;

type Props = {
    slug: string;
    lastRun: string;
    spl: string;
    columns: string[];
    rows: Cell[][];
};

const toCsv = (columns: string[], rows: Cell[][]) =>
    [columns, ...rows]
        .map((row) => row
            .map((cell) => {
                const text = String(cell);
                return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
            })
            .join(','))
        .join('\n');

const ReportActions = ({ slug, lastRun, spl, columns, rows }: Props) => {
    const [copied, setCopied] = useState(false);

    const downloadCsv = () => {
        const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}-${lastRun.slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        track('report_csv_downloaded', { slug });
    }

    const copySpl = async () => {
        try {
            await navigator.clipboard.writeText(spl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            track('report_spl_copied', { slug });
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="report-actions">
            <button type="button" className="btn-primary" onClick={downloadCsv}>Download CSV</button>
            <button type="button" className="btn-secondary" onClick={copySpl} aria-live="polite">
                {copied ? 'Copied!' : 'Copy SPL query'}
            </button>
        </div>
    )
}

export default ReportActions
