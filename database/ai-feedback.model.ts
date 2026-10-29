import { Schema, model, models, type Model } from 'mongoose';
import type { ReportStatus } from '@/lib/reports';

// One 👍 or 👎 per person per thing they rated: an AI answer, an AI summary,
// or a briefing flag ("Worth flagging?"). The flag votes, with what was
// flagged, are what the ML job in ml/ learns from.

export type FeedbackKind = 'answer' | 'summary' | 'flag';
export type Vote = 'up' | 'down';

// What a briefing flag was about, kept so a model can learn from the votes.
export type FlagDetails = {
    reason: 'status' | 'unusual';
    status?: ReportStatus;
    measure?: 'results' | 'duration';
    // The robust z-score from lib/insights.ts.
    score?: number;
    // The ML model's score for the run (ml/score.py), when it had one.
    modelScore?: number;
    runAt?: string;
};

export interface IAiFeedback {
    userId: string;
    kind: FeedbackKind;
    // A message id (answer), a summary key (summary) or "<slug>:<runAt>:<reason>" (flag).
    targetId: string;
    value: Vote;
    reportSlug?: string;
    flag?: FlagDetails;
    createdAt: Date;
    updatedAt: Date;
}

const AiFeedbackSchema = new Schema<IAiFeedback>(
    {
        userId: { type: String, required: true },
        kind: { type: String, enum: ['answer', 'summary', 'flag'], required: true },
        targetId: { type: String, required: true },
        value: { type: String, enum: ['up', 'down'], required: true },
        reportSlug: String,
        flag: {
            type: new Schema<FlagDetails>(
                {
                    reason: { type: String, enum: ['status', 'unusual'] },
                    status: String,
                    measure: String,
                    score: Number,
                    modelScore: Number,
                    runAt: String,
                },
                { _id: false },
            ),
            default: undefined,
        },
    },
    { timestamps: true, collection: 'ai_feedback' },
);

// One vote per person per thing; changing your mind updates it.
AiFeedbackSchema.index({ userId: 1, kind: 1, targetId: 1 }, { unique: true });

const AiFeedback = (models.AiFeedback as Model<IAiFeedback>) || model<IAiFeedback>('AiFeedback', AiFeedbackSchema);

export default AiFeedback;
