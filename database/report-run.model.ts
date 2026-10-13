import { Schema, model, models, type Model } from 'mongoose';
import type { Cell, ReportStatus } from '@/lib/reports';

// One document per scheduled run (Splunk search job), keyed by its sid. This
// is the long-term history: Splunk deletes job results after dispatch.ttl.

export interface IReportRun {
    sid: string;
    reportSlug: string;
    runAt: Date;
    dispatchState: string;
    status: ReportStatus;
    statusMessage?: string;
    durationSec: number;
    resultCount: number;
    // False for failed runs and for runs whose results had already expired.
    hasResults: boolean;
    resultsExpired: boolean;
    // True when Splunk had more results than were stored.
    truncated: boolean;
    columns: string[];
    rows: Cell[][];
    syncedAt: Date;
}

// Changing this later needs a collMod on the existing TTL index.
const RETENTION_DAYS = Number(process.env.RUN_RETENTION_DAYS) || 90;

const ReportRunSchema = new Schema<IReportRun>(
    {
        sid: { type: String, required: true, unique: true },
        reportSlug: { type: String, required: true },
        runAt: { type: Date, required: true },
        dispatchState: { type: String, required: true },
        status: { type: String, enum: ['success', 'warning', 'failed'], required: true },
        statusMessage: String,
        durationSec: { type: Number, default: 0 },
        resultCount: { type: Number, default: 0 },
        hasResults: { type: Boolean, default: false },
        resultsExpired: { type: Boolean, default: false },
        truncated: { type: Boolean, default: false },
        columns: { type: [String], default: [] },
        rows: { type: Schema.Types.Mixed, default: [] },
    },
    { collection: 'report_runs', timestamps: { createdAt: 'syncedAt', updatedAt: false } },
);

ReportRunSchema.index({ reportSlug: 1, runAt: -1 });
ReportRunSchema.index({ runAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86_400 });

const ReportRun = (models.ReportRun as Model<IReportRun>) || model<IReportRun>('ReportRun', ReportRunSchema);

export default ReportRun;
