import { Schema, model, models, type Model } from 'mongoose';

// How many AI requests each account, and the whole site, made on a day, for
// the daily limits in lib/ai/usage.ts. One document per account per day:
// _id is '<user id>:<YYYY-MM-DD>', or 'site:<YYYY-MM-DD>' for the total.
// MongoDB deletes them after a week.

export interface IAiUsage {
    _id: string;
    requests: number;
    // As Gemini reported them, to see what the AI costs.
    inputTokens: number;
    outputTokens: number;
    createdAt: Date;
}

// No defaults: the counters start at the first $inc, and createdAt is set on insert.
const AiUsageSchema = new Schema<IAiUsage>(
    {
        _id: { type: String, required: true },
        requests: Number,
        inputTokens: Number,
        outputTokens: Number,
        createdAt: Date,
    },
    { collection: 'ai_usage', versionKey: false },
);

AiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86_400 });

const AiUsage = (models.AiUsage as Model<IAiUsage>) || model<IAiUsage>('AiUsage', AiUsageSchema);

export default AiUsage;
