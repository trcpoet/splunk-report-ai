import type { ChatKind } from '@/lib/chats';

// Window events between the parts of the Ask AI page that don't share a
// parent component: the chat (components/ChatView.tsx), the sidebar
// (components/ChatSidebar.tsx) and the top bar (components/AiTopBar.tsx).

// A chat was deleted, from the sidebar or the chats page. The detail is its id.
export const CHAT_DELETED = 'ai:chat-deleted';

// An answer was saved, so its chat goes to the top of the sidebar, or joins it.
export const CHAT_SAVED = 'ai:chat-saved';

export type SavedChat = { id: string; kind: ChatKind; title: string; updatedAt: string };

// New chat was pressed in the mode that's open. The chat on screen clears
// itself, and an answer on its way stops.
export const NEW_CHAT = 'ai:new-chat';

// The open chat is about to be deleted. An answer on its way stops, so saving
// it can't bring the chat back. The chat stays on screen, in case the delete fails.
export const STOP_ANSWER = 'ai:stop-answer';
