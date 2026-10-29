import { Schema, model, models, type Model, type Types } from 'mongoose';
import type { StoredSplAnswer } from '@/lib/ai/spl';

// One saved conversation from the Ask AI page. The messages live inside the
// chat because they're always read together, and there are at most
// MAX_CHAT_MESSAGES of them, so a chat stays small. Only the user who started a
// chat can open it (lib/chats.ts checks userId on every read and write).

export type ChatKind = 'reports' | 'spl';

export interface IChatMessage {
    _id: Types.ObjectId;
    role: 'user' | 'assistant';
    text: string;
    // Write SPL answers only: the search, one step per pipe command.
    spl?: StoredSplAnswer;
    createdAt: Date;
}

export interface IChat {
    _id: Types.ObjectId;
    // The Better Auth user id of the person who started the chat.
    userId: string;
    kind: ChatKind;
    title: string;
    messages: IChatMessage[];
    // Set only in DEMO_MODE, where visitors share accounts: MongoDB deletes the chat then.
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// 50 questions and answers. Saving a turn checks this in the same update, so
// two tabs can't push a chat past it.
export const MAX_CHAT_MESSAGES = 100;

const SplStepSchema = new Schema({ code: String, explanation: String }, { _id: false });

const SplValidationSchema = new Schema({ ok: Boolean, message: String }, { _id: false });

const SplAnswerSchema = new Schema<StoredSplAnswer>(
    {
        summary: String,
        steps: { type: [SplStepSchema], default: [] },
        timeRange: String,
        fields: { type: [String], default: [] },
        assumptions: { type: [String], default: [] },
        followUps: { type: [String], default: [] },
        validation: { type: SplValidationSchema, default: undefined },
        basedOn: { type: [String], default: undefined },
    },
    { _id: false },
);

const ChatMessageSchema = new Schema<IChatMessage>({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, default: '' },
    spl: { type: SplAnswerSchema, default: undefined },
    createdAt: { type: Date, default: Date.now },
});

const ChatSchema = new Schema<IChat>(
    {
        userId: { type: String, required: true },
        kind: { type: String, enum: ['reports', 'spl'], required: true },
        title: { type: String, required: true, trim: true },
        messages: { type: [ChatMessageSchema], default: [] },
        expiresAt: Date,
    },
    { timestamps: true, collection: 'chats' },
);

// The history list: someone's chats, newest first.
ChatSchema.index({ userId: 1, updatedAt: -1 });
// Deletes a chat once its expiresAt passes. Chats without one stay.
ChatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Chat = (models.Chat as Model<IChat>) || model<IChat>('Chat', ChatSchema);

export default Chat;
