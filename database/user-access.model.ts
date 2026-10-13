import { Schema, model, models, type Model } from 'mongoose';
import type { Role } from '@/lib/access';

// Who may see which reports. Kept apart from the auth library's user record so
// that changing the auth library or the identity provider never touches access.

export interface IUserAccess {
    email: string;
    role: Role;
    groups: string[];
    // seed: demo users; idp: copied from the identity provider at login; manual: set by hand.
    source: 'seed' | 'idp' | 'manual';
    createdAt: Date;
    updatedAt: Date;
}

const UserAccessSchema = new Schema<IUserAccess>(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
        groups: { type: [String], default: [] },
        source: { type: String, enum: ['seed', 'idp', 'manual'], default: 'manual' },
    },
    { timestamps: true, collection: 'user_access' },
);

const UserAccess = (models.UserAccess as Model<IUserAccess>) || model<IUserAccess>('UserAccess', UserAccessSchema);

export default UserAccess;
