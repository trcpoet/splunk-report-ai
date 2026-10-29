import { Schema, model, models, type Model } from 'mongoose';

// What the Python ML job (ml/score.py) writes, and the app reads. The job
// replaces both collections each time it runs. See docs/ml.md.

// One per run: how unusual the Isolation Forest finds it. _id is the run's sid.
export interface IMlRunScore {
    _id: string;
    reportSlug: string;
    runAt: Date;
    // 0 is a typical run, 1 the most unusual of all the runs the job scored.
    score: number;
    // Among the share of runs that differ most (5%).
    unusual: boolean;
    // How it compares with its usual, in plain words.
    reason: string;
    // The measure that stands out more. Null for a failed run, or one with too
    // few earlier runs to compare with.
    measure: 'results' | 'duration' | null;
    model: string;
    scoredAt: Date;
}

// One per report, once the job has learned from enough "Worth flagging?"
// votes: the chance a flag on the report's newest run is worth attention.
// _id is the report's slug.
export interface IMlReportScore {
    _id: string;
    attention: number;
    trainedOn: number;
    // Cross-validated accuracy on held-out votes; null when it couldn't be measured.
    accuracy: number | null;
    model: string;
    scoredAt: Date;
}

const MlRunScoreSchema = new Schema<IMlRunScore>(
    {
        _id: { type: String, required: true },
        reportSlug: { type: String, required: true },
        runAt: { type: Date, required: true },
        score: { type: Number, required: true },
        unusual: { type: Boolean, required: true },
        reason: { type: String, required: true },
        measure: { type: String, enum: ['results', 'duration', null], default: null },
        model: String,
        scoredAt: Date,
    },
    { collection: 'ml_run_scores', versionKey: false },
);

// The app looks up each report's newest run.
MlRunScoreSchema.index({ reportSlug: 1, runAt: -1 });

const MlReportScoreSchema = new Schema<IMlReportScore>(
    {
        _id: { type: String, required: true },
        attention: { type: Number, required: true },
        trainedOn: Number,
        accuracy: { type: Number, default: null },
        model: String,
        scoredAt: Date,
    },
    { collection: 'ml_report_scores', versionKey: false },
);

export const MlRunScore = (models.MlRunScore as Model<IMlRunScore>) || model<IMlRunScore>('MlRunScore', MlRunScoreSchema);
export const MlReportScore = (models.MlReportScore as Model<IMlReportScore>) || model<IMlReportScore>('MlReportScore', MlReportScoreSchema);
