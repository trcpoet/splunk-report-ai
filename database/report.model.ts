import { Schema, model, models, type Model } from 'mongoose';
import type { ChartPanel, ChartScatter, ChartThreshold, ReportCategory, ReportChart, ReportHighlight, ReportStatus } from '@/lib/reports';

// One report per Splunk scheduled search. The sync worker upserts it by slug
// and recomputes the derived fields (latest, history, highlights, chart) on
// every run. Result rows live in report_runs.

export interface IRunSummary {
    sid: string;
    runAt: Date;
    status: ReportStatus;
    durationSec: number;
    resultCount: number;
}

export interface IReport {
    slug: string;
    splunk: {
        name: string;
        app: string;
        appLabel: string;
        owner: string;
        sharing: string;
        readRoles: string[];
    };
    title: string;
    description: string;
    spl: string;
    cron: string;
    schedule: string;
    runsPerWeek: number;
    timeRange: string;
    index: string;
    recipients: string[];
    category: ReportCategory;
    tags: string[];
    // Groups whose members may open the report. Empty means admins only.
    allowedGroups: string[];
    chart: ReportChart | null;
    nextRun: Date | null;
    disabled: boolean;
    latest: (IRunSummary & { statusMessage?: string }) | null;
    // The run whose rows the report page shows: the newest run that has results.
    results: { sid: string; runAt: Date; resultCount: number } | null;
    highlights: ReportHighlight[];
    // The newest runs, oldest first, without rows.
    history: IRunSummary[];
    syncedAt: Date;
    syncError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const STATUSES = ['success', 'warning', 'failed'];

const runSummaryFields = {
    sid: { type: String, required: true },
    runAt: { type: Date, required: true },
    status: { type: String, enum: STATUSES, required: true },
    durationSec: { type: Number, default: 0 },
    resultCount: { type: Number, default: 0 },
};

const RunSummarySchema = new Schema<IRunSummary>(runSummaryFields, { _id: false });

const LatestRunSchema = new Schema<IRunSummary & { statusMessage?: string }>(
    { ...runSummaryFields, statusMessage: String },
    { _id: false },
);

const ThresholdSchema = new Schema<ChartThreshold>(
    {
        value: { type: Number, required: true },
        label: { type: String, required: true },
    },
    { _id: false },
);

const PanelSchema = new Schema<ChartPanel>(
    {
        y: { type: String, required: true },
        threshold: ThresholdSchema,
    },
    { _id: false },
);

const ScatterSchema = new Schema<ChartScatter>(
    {
        x: { type: String, required: true },
        log: Boolean,
        caption: { type: String, required: true },
    },
    { _id: false },
);

const ChartSchema = new Schema<ReportChart>(
    {
        // A nested field called `type` needs the long form in Mongoose.
        type: { type: String, enum: ['bar', 'column', 'line', 'area'], required: true },
        x: { type: String, required: true },
        y: { type: String, required: true },
        threshold: ThresholdSchema,
        max: Number,
        // Left out rather than stored empty.
        panels: { type: [PanelSchema], default: undefined },
        scatter: ScatterSchema,
    },
    { _id: false },
);

const HighlightSchema = new Schema<ReportHighlight>(
    {
        label: { type: String, required: true },
        value: { type: String, required: true },
        note: String,
        meter: Number,
        // Left out rather than stored empty.
        trend: { type: [Number], default: undefined },
    },
    { _id: false },
);

const ReportSchema = new Schema<IReport>(
    {
        slug: { type: String, required: true, unique: true, trim: true },
        splunk: {
            name: { type: String, required: true },
            app: String,
            appLabel: String,
            owner: String,
            sharing: String,
            readRoles: { type: [String], default: [] },
        },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        spl: { type: String, default: '' },
        cron: { type: String, default: '' },
        schedule: { type: String, default: '' },
        runsPerWeek: { type: Number, default: 0 },
        timeRange: { type: String, default: '' },
        index: { type: String, default: '' },
        recipients: { type: [String], default: [] },
        category: { type: String, required: true },
        tags: { type: [String], default: [] },
        allowedGroups: { type: [String], default: [], index: true },
        chart: { type: ChartSchema, default: null },
        nextRun: { type: Date, default: null },
        disabled: { type: Boolean, default: false },
        latest: { type: LatestRunSchema, default: null },
        results: {
            type: new Schema({ sid: String, runAt: Date, resultCount: Number }, { _id: false }),
            default: null,
        },
        highlights: { type: [HighlightSchema], default: [] },
        history: { type: [RunSummarySchema], default: [] },
        syncedAt: Date,
        syncError: { type: String, default: null },
    },
    { timestamps: true, collection: 'reports' },
);

const Report = (models.Report as Model<IReport>) || model<IReport>('Report', ReportSchema);

export default Report;
