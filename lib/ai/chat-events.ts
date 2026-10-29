import type { ChatKind } from '@/lib/chats';

// Window events between the parts of the Ask AI page that don't share a
// parent component: the chat (components/ChatView.tsx), the sidebar
// (components/ChatSidebar.tsx) and the top bar (components/AiTopBar.tsx).

// A chat was deleted, from the sidebar or the chats page. The detail is its id.
export const CHAT_DELETED = 'ai:chat-deleted';

// An answer was saved, so its chat goes to the top of the sidebar, or joins it.
export const CHAT_SAVED = 'ai:chat-saved';

export type SavedChat = { id: string; kind: ChatKind; title: string; updatedAt: string };

// New chat was pressed while the address already shows a new chat (after a
// first question that failed, say). Following the link would change nothing,
// so the chat on screen clears itself.
export const NEW_CHAT = 'ai:new-chat';
