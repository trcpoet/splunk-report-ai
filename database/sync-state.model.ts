import { Schema, model, models, type Model } from 'mongoose';

// A single document (_id 'splunk') describing the latest sync, for the
// "Data as of" line, the home page's scheduler chart and troubleshooting.

export interface ISyncState {
    _id: string;
    mode: 'fixture' | 'live';
    // The time zone the reports' crons run in (the worker's SPLUNK_TZ).
    timeZone: string;
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
        timeZone: { type: String, default: 'UTC' },
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
