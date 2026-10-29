import type { SavedChat } from '@/lib/ai/chat-events';
import type { ChatSummary } from '@/lib/chats';

// When the server made a MongoDB id (its first 8 hex digits are the seconds
// since 1970), as an ISO time. A saved answer's id says when it was saved by
// the server's clock, which the browser's may not match.
export const idTime = (id: string) => new Date(parseInt(id.slice(0, 8), 16) * 1000).toISOString();

// The sidebar's list of chats: the ones the server sent with the page, plus
// answers saved since then (lib/ai/chat-events.ts), newest first.
//
// For a chat in both, the server's copy wins, since it may have been renamed,
// except for its time: an answer saved since the page loaded makes it newer.
// A chat saved just now is always today's.
export function mergeChats(server: ChatSummary[], saved: SavedChat[]): ChatSummary[] {
    const chats = new Map(server.map((chat) => [chat.id, chat]));

    for (const chat of saved) {
        const known = chats.get(chat.id);
        if (!known) chats.set(chat.id, { ...chat, preview: '', group: 'Today' });
        else if (chat.updatedAt > known.updatedAt) chats.set(chat.id, { ...known, updatedAt: chat.updatedAt, group: 'Today' });
    }

    // ISO times in UTC sort as text.
    return [...chats.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
