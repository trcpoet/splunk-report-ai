'use client';

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, SquarePen } from "lucide-react";
import { NewChatLink } from "@/components/AiTopBar";
import { GROUPS, HistoryRow } from "@/components/ChatHistory";
import { CHAT_DELETED, CHAT_SAVED, type SavedChat } from "@/lib/ai/chat-events";
import { mergeChats } from "@/lib/chat-list";
import type { ChatSummary } from "@/lib/chats";

// The Ask AI page's sidebar, like ChatGPT's: New chat, Search chats (the chats
// page), then every chat, newest first and grouped by day, with the open one
// marked. Each one can be renamed or deleted from its row.
//
// The list comes from the server with the page. Answers saved since then
// arrive from the chat as events (lib/ai/chat-events.ts), so a new chat shows
// up at once; renaming and deleting redraw the page from the server.
const ChatSidebar = ({ chats }: { chats: ChatSummary[] }) => {
    const pathname = usePathname();
    const open = useSearchParams().get('chat');
    const [saved, setSaved] = useState<SavedChat[]>([]);

    useEffect(() => {
        const add = (event: Event) => {
            const chat = (event as CustomEvent<SavedChat>).detail;
            setSaved((list) => [chat, ...list.filter(({ id }) => id !== chat.id)]);
        };
        const forget = (event: Event) => {
            const id = (event as CustomEvent<string>).detail;
            setSaved((list) => list.filter((chat) => chat.id !== id));
        };
        window.addEventListener(CHAT_SAVED, add);
        window.addEventListener(CHAT_DELETED, forget);
        return () => {
            window.removeEventListener(CHAT_SAVED, add);
            window.removeEventListener(CHAT_DELETED, forget);
        };
    }, []);

    const list = mergeChats(chats, saved);

    return (
        <nav className="ai-sidebar" aria-label="Your chats">
            {/* With many chats, keyboard users would tab through every row first. */}
            <a href="#ai-main" className="skip-link">Skip the list of chats</a>

            <div className="sidebar-links">
                <NewChatLink className="sidebar-link">
                    <SquarePen aria-hidden="true" />
                    New chat
                </NewChatLink>
                <Link href="/ai/history" className="sidebar-link" aria-current={pathname === '/ai/history' ? 'page' : undefined}>
                    <Search aria-hidden="true" />
                    Search chats
                </Link>
            </div>

            {list.length === 0 && <p className="sidebar-empty">No chats yet. Each one you start is kept here.</p>}

            {GROUPS.map((group) => {
                const items = list.filter((chat) => chat.group === group);
                return items.length > 0 && (
                    <section key={group} className="sidebar-group" aria-label={group}>
                        <h2>{group}</h2>
                        <ul>
                            {items.map((chat) => <HistoryRow key={chat.id} chat={chat} compact current={chat.id === open} />)}
                        </ul>
                    </section>
                );
            })}
        </nav>
    )
}

export default ChatSidebar
