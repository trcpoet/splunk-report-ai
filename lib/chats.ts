import 'server-only';
import { Types } from 'mongoose';
import { Chat, MAX_CHAT_MESSAGES, type ChatKind, type IChat, type IChatMessage } from '@/database';
import type { Viewer } from '@/lib/access';
import { replaceReportMarkers } from '@/lib/ai/report-links';
import type { SplAnswer } from '@/lib/ai/spl';
import { getViewer } from '@/lib/dal';
import { firstLine } from '@/lib/format';
import connectDB from '@/lib/mongodb';

// Saved chats from the Ask AI page. Like lib/dal.ts, every function checks who
// is asking: a chat belongs to the person who started it, and for anyone else
// it doesn't exist (the same answer as for a missing chat).

export type { ChatKind };

// Plain values only, so pages can hand them to client components.
export type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    spl?: SplAnswer;
    createdAt: string;
};

export type ChatDetail = { id: string; kind: ChatKind; title: string; messages: ChatMessage[] };

// Where a chat goes in the history list, by its last message's UTC day.
export type ChatGroup = 'Today' | 'Yesterday' | 'Last 7 days' | 'Older';

export type ChatSummary = { id: string; kind: ChatKind; title: string; updatedAt: string; preview: string; group: ChatGroup };

const DAY_MS = 86_400_000;

export function chatGroup(updatedAt: Date, now: Date): ChatGroup {
    const age = Math.floor(now.getTime() / DAY_MS) - Math.floor(updatedAt.getTime() / DAY_MS);
    return age <= 0 ? 'Today' : age === 1 ? 'Yesterday' : age < 7 ? 'Last 7 days' : 'Older';
}

// Chats in DEMO_MODE, where visitors share accounts, are deleted after a day.
const DEMO_CHAT_HOURS = 24;

// A chat id is a MongoDB ObjectId in hex. Requests and actions check ids with it.
export const CHAT_ID = /^[a-f0-9]{24}$/;

const isChatId = (id: string) => CHAT_ID.test(id);

// An answer's Markdown as one line of plain text, for the history list:
// no **bold** marks, list bullets or headings, and report ids as plain words.
const plainText = (markdown: string) => replaceReportMarkers(markdown, (slug) => slug)
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

export const newChatId = () => new Types.ObjectId().toHexString();

// A chat is named after its first question. People can rename it.
export const chatTitle = (question: string) => firstLine(question, 80);

const toMessage = ({ _id, role, text, spl, createdAt }: IChatMessage): ChatMessage => ({
    id: String(_id),
    role,
    text,
    ...(spl ? { spl } : {}),
    createdAt: new Date(createdAt).toISOString(),
});

// The signed-in person's chats, newest first, with the start of the last message.
export async function listChats(limit = 200): Promise<ChatSummary[]> {
    const viewer = await getViewer();
    await connectDB();
    const chats = await Chat.find({ userId: viewer.id }, { kind: 1, title: 1, updatedAt: 1, messages: { $slice: -1 } })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean<IChat[]>();
    const now = new Date();

    return chats.map((chat) => ({
        id: String(chat._id),
        kind: chat.kind,
        title: chat.title,
        updatedAt: new Date(chat.updatedAt).toISOString(),
        preview: plainText(chat.messages[0]?.text ?? '').slice(0, 200),
        group: chatGroup(new Date(chat.updatedAt), now),
    }));
}

// One of the signed-in person's chats, or null (missing, someone else's, or not an id).
export async function getChat(id: string): Promise<ChatDetail | null> {
    if (!isChatId(id)) return null;

    const viewer = await getViewer();
    await connectDB();
    const chat = await Chat.findOne({ _id: id, userId: viewer.id }).lean<IChat>();

    return chat ? { id: String(chat._id), kind: chat.kind, title: chat.title, messages: chat.messages.map(toMessage) } : null;
}

export type Turn = {
    chatId: string;
    kind: ChatKind;
    question: string;
    answer: { text: string; spl?: SplAnswer };
};

// Saves a question and its answer together, and returns the answer's message
// id, or null when nothing was saved. The route handler passes the viewer it
// checked, since this runs after the answer has streamed.
//
// One update does it all. It matches only this viewer's chat of this kind with
// room for two more messages. A new chat id (newChatId) matches nothing, so the
// upsert creates the chat. A full chat, or someone else's, matches nothing too,
// but then the insert fails on the existing _id, and nothing is saved.
export async function saveTurn(viewer: Viewer, { chatId, kind, question, answer }: Turn): Promise<string | null> {
    if (!isChatId(chatId)) return null;
    await connectDB();

    const now = Date.now();
    const answerId = new Types.ObjectId();
    const demo = process.env.DEMO_MODE === 'true';

    try {
        await Chat.updateOne(
            { _id: chatId, userId: viewer.id, kind, [`messages.${MAX_CHAT_MESSAGES - 2}`]: { $exists: false } },
            {
                $push: {
                    messages: {
                        $each: [
                            { role: 'user', text: question, createdAt: new Date(now) },
                            // A millisecond later, so the two always sort in order.
                            { _id: answerId, role: 'assistant', text: answer.text, spl: answer.spl, createdAt: new Date(now + 1) },
                        ],
                    },
                },
                $setOnInsert: { title: chatTitle(question), ...(demo ? { expiresAt: new Date(now + DEMO_CHAT_HOURS * 3_600_000) } : {}) },
            },
            { upsert: true },
        );
    } catch (error) {
        // E11000: the chat exists but is full or isn't this viewer's.
        if ((error as { code?: number }).code === 11000) return null;
        throw error;
    }

    return answerId.toHexString();
}

// How many more questions fit in a chat.
export const turnsLeft = (chat: ChatDetail | null) => Math.floor((MAX_CHAT_MESSAGES - (chat?.messages.length ?? 0)) / 2);

export async function renameChat(id: string, title: string): Promise<boolean> {
    if (!isChatId(id)) return false;
    const viewer = await getViewer();
    await connectDB();
    const result = await Chat.updateOne({ _id: id, userId: viewer.id }, { $set: { title: chatTitle(title) } });
    return result.matchedCount === 1;
}

export async function deleteChat(id: string): Promise<boolean> {
    if (!isChatId(id)) return false;
    const viewer = await getViewer();
    await connectDB();
    const result = await Chat.deleteOne({ _id: id, userId: viewer.id });
    return result.deletedCount === 1;
}

// Whether an AI answer with this message id is in one of the signed-in person's chats.
export async function isOwnAnswer(messageId: string): Promise<boolean> {
    // Message ids look like chat ids: both are ObjectIds.
    if (!isChatId(messageId)) return false;
    const viewer = await getViewer();
    await connectDB();
    return (await Chat.exists({ userId: viewer.id, messages: { $elemMatch: { _id: messageId, role: 'assistant' } } })) !== null;
}
