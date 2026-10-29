import type { SavedChat } from '@/lib/ai/chat-events';
import type { ChatSummary } from '@/lib/chats';

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
