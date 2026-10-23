'use client';

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { track } from "@/lib/analytics";

type Cell = string | number;

type Props = {
    slug: string;
    lastRun: string;
    spl: string;
    columns: string[];
    rows: Cell[][];
};

type Feedback = 'idle' | 'done' | 'failed';

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
    const [download, setDownload] = useState<Feedback>('idle');
    const [copy, setCopy] = useState<Feedback>('idle');

    // Each button confirms what it did for a moment, then goes back to its label.
    const confirm = (set: (feedback: Feedback) => void, feedback: Feedback) => {
        set(feedback);
        setTimeout(() => set('idle'), feedback === 'failed' ? 5000 : 2000);
    }

    const downloadCsv = () => {
        const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}-${lastRun.slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        confirm(setDownload, 'done');
        track('report_csv_downloaded', { slug });
    }

    const copySpl = async () => {
        try {
            await navigator.clipboard.writeText(spl);
            confirm(setCopy, 'done');
            track('report_spl_copied', { slug });
        } catch {
            confirm(setCopy, 'failed');
        }
    }

    // Read out by screen readers; a failed copy is also shown, since it needs the
    // person to do something.
    const status = copy === 'failed'
        ? 'Couldn’t copy. Select the SPL query on this page and copy it from there.'
        : copy === 'done' ? 'SPL query copied.' : download === 'done' ? 'CSV downloaded.' : '';

    return (
        <div className="report-actions">
            <button type="button" className="btn-primary" onClick={downloadCsv}>
                {download === 'done' ? <Check aria-hidden="true" /> : <Download aria-hidden="true" />}
                {download === 'done' ? 'Downloaded' : 'Download CSV'}
            </button>
            <button type="button" className="btn-secondary" onClick={copySpl}>
                {copy === 'done' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copy === 'done' ? 'Copied' : 'Copy SPL query'}
            </button>
            <p className={copy === 'failed' ? 'action-error' : 'sr-only'} aria-live="polite">{status}</p>
        </div>
    )
}

export default ReportActions
