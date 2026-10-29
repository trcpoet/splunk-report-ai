import { Schema, model, models, type Model } from 'mongoose';

// Searches people saved from Write SPL as good examples ("Save as example").
// Write SPL then shows the AI the saved searches most like each new request
// (lib/spl-examples.ts). _id is the answer's message id. A saved search is
// shared with the groups of the person who saved it, like a report.

export interface ISavedSplExample {
    _id: string;
    // What was asked, and the answer's summary and search.
    request: string;
    summary: string;
    query: string;
    allowedGroups: string[];
    savedBy: string;
    createdAt: Date;
}

const SavedSplExampleSchema = new Schema<ISavedSplExample>(
    {
        _id: { type: String, required: true },
        request: { type: String, required: true },
        summary: { type: String, default: '' },
        query: { type: String, required: true },
        allowedGroups: { type: [String], default: [] },
        savedBy: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    },
    { collection: 'spl_examples', versionKey: false },
);

SavedSplExampleSchema.index({ allowedGroups: 1, createdAt: -1 });

const SavedSplExample = (models.SavedSplExample as Model<ISavedSplExample>) || model<ISavedSplExample>('SavedSplExample', SavedSplExampleSchema);

export default SavedSplExample;
