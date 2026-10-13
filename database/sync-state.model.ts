import { Schema, model, models, type Model } from 'mongoose';

// A single document (_id 'splunk') describing the latest sync, for the
// "Data as of" line and for troubleshooting.

export interface ISyncState {
    _id: string;
    mode: 'fixture' | 'live';
    lastStartedAt: Date | null;
    lastFinishedAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    counts: {
        reports: number;
        newRuns: number;
        errors: number;
    };
}

const SyncStateSchema = new Schema<ISyncState>(
    {
        _id: { type: String, default: 'splunk' },
        mode: { type: String, enum: ['fixture', 'live'], required: true },
        lastStartedAt: { type: Date, default: null },
        lastFinishedAt: { type: Date, default: null },
        lastSuccessAt: { type: Date, default: null },
        lastError: { type: String, default: null },
        counts: {
            reports: { type: Number, default: 0 },
            newRuns: { type: Number, default: 0 },
            errors: { type: Number, default: 0 },
        },
    },
    { collection: 'sync_state' },
);

export const SYNC_STATE_ID = 'splunk';

const SyncState = (models.SyncState as Model<ISyncState>) || model<ISyncState>('SyncState', SyncStateSchema);

export default SyncState;
