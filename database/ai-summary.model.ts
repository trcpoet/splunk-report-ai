import { Schema, model, models, type Model } from 'mongoose';

// AI text made once and shown to everyone it applies to: a report's Explain
// summary, or the briefing for a set of reports. _id is the cache key from
// lib/ai/keys.ts, which changes when the report data or the prompt changes,
// so an old summary is simply never asked for again. MongoDB deletes them
// after 30 days.

export interface IAiSummary {
    _id: string;
    kind: 'report' | 'briefing';
    text: string;
    // The model that wrote it.
    model: string;
    createdAt: Date;
}

const AiSummarySchema = new Schema<IAiSummary>(
    {
        _id: { type: String, required: true },
        kind: { type: String, enum: ['report', 'briefing'], required: true },
        text: { type: String, required: true },
        model: String,
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'ai_summaries', versionKey: false },
);

AiSummarySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86_400 });

const AiSummary = (models.AiSummary as Model<IAiSummary>) || model<IAiSummary>('AiSummary', AiSummarySchema);

export default AiSummary;
