'use client';

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { MessagesSquare, Pencil, SquareTerminal, Trash2 } from "lucide-react";
import { deleteChatAction, renameChatAction } from "@/app/ai/actions";
import { CHAT_DELETED } from "@/components/AiTabs";
import type { ChatGroup, ChatKind, ChatSummary } from "@/lib/chats";
import { formatDateTime, formatTime } from "@/lib/format";

const FILTERS: { label: string; value: ChatKind | 'all' }[] = [
    { label: 'All chats', value: 'all' },
    { label: 'Ask about reports', value: 'reports' },
    { label: 'Write SPL', value: 'spl' },
];

const GROUPS: ChatGroup[] = ['Today', 'Yesterday', 'Last 7 days', 'Older'];

const TAB_LABELS: Record<ChatKind, string> = { reports: 'Ask about reports', spl: 'Write SPL' };

// One chat in the list: open it, rename it in place, or delete it (after a
// second click, so one slip doesn't lose a chat).
const HistoryRow = ({ chat }: { chat: ChatSummary }) => {
    const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view');
    const [name, setName] = useState(chat.title);
    const [error, setError] = useState('');
    const [pending, startTransition] = useTransition();
    const nameInput = useRef<HTMLInputElement>(null);
    const keepButton = useRef<HTMLButtonElement>(null);

    // Focus follows the row into its rename or confirm step.
    useEffect(() => {
        if (mode === 'rename') nameInput.current?.select();
        if (mode === 'confirm') keepButton.current?.focus();
    }, [mode]);

    const rename = (event: FormEvent) => {
        event.preventDefault();
        startTransition(async () => {
            const result = await renameChatAction(chat.id, name);
            if (result.ok) {
                setMode('view');
                setError('');
            } else {
                setError(result.message);
            }
        });
    };

    const remove = () => {
        startTransition(async () => {
            const result = await deleteChatAction(chat.id);
            if (result.ok) window.dispatchEvent(new CustomEvent(CHAT_DELETED, { detail: chat.id }));
            else setError(result.message);
        });
    };

    const Icon = chat.kind === 'spl' ? SquareTerminal : MessagesSquare;
    const when = chat.group === 'Today' || chat.group === 'Yesterday' ? `${formatTime(chat.updatedAt)} UTC` : formatDateTime(chat.updatedAt);

    return (
        <li className="history-row" aria-busy={pending}>
            <Icon className="history-icon" aria-hidden="true" />

            {mode === 'rename' ? (
                <form className="history-rename" onSubmit={rename}>
                    <label htmlFor={`name-${chat.id}`} className="sr-only">Chat name</label>
                    <input
                        id={`name-${chat.id}`}
                        ref={nameInput}
                        value={name}
                        maxLength={80}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                setName(chat.title);
                                setMode('view');
                            }
                        }}
                    />
                    <button type="submit" className="btn-primary btn-small" disabled={pending}>Save</button>
                    <button type="button" className="btn-secondary btn-small" onClick={() => { setName(chat.title); setMode('view'); }}>Cancel</button>
                </form>
            ) : (
                <Link href={`/ai/${chat.kind}?chat=${chat.id}`} className="history-link">
                    <span className="history-title">{chat.title}</span>
                    <span className="history-preview">{chat.preview}</span>
                    <span className="history-meta">
                        <span>{TAB_LABELS[chat.kind]}</span>
                        <time dateTime={chat.updatedAt}>{when}</time>
                    </span>
                </Link>
            )}

            {mode === 'view' && (
                <div className="history-actions">
                    <button type="button" className="icon-button" onClick={() => setMode('rename')} aria-label={`Rename "${chat.title}"`}>
                        <Pencil aria-hidden="true" />
                    </button>
                    <button type="button" className="icon-button" onClick={() => setMode('confirm')} aria-label={`Delete "${chat.title}"`}>
                        <Trash2 aria-hidden="true" />
                    </button>
                </div>
            )}
            {mode === 'confirm' && (
                <div className="history-actions" role="group" aria-label="Delete this chat?">
                    <span className="text-sm text-light-100">Delete this chat?</span>
                    <button type="button" className="btn-danger btn-small" onClick={remove} disabled={pending}>Delete</button>
                    <button type="button" ref={keepButton} className="btn-secondary btn-small" onClick={() => setMode('view')}>Keep</button>
                </div>
            )}

            {error && <p className="history-error" role="alert">{error}</p>}
        </li>
    )
}

// Every chat from both tabs, newest first, grouped by day, with search and a filter.
const ChatHistory = ({ chats, demo = false }: { chats: ChatSummary[]; demo?: boolean }) => {
    const [kind, setKind] = useState<ChatKind | 'all'>('all');
    const [query, setQuery] = useState('');

    if (chats.length === 0) {
        return (
            <div className="empty-state">
                No chats yet. <Link href="/ai/reports" className="text-primary">Ask about your reports</Link> or{' '}
                <Link href="/ai/spl" className="text-primary">write a search</Link> to start one.
            </div>
        );
    }

    const search = query.trim().toLowerCase();
    const visible = chats.filter((chat) =>
        (kind === 'all' || chat.kind === kind) &&
        (!search || chat.title.toLowerCase().includes(search) || chat.preview.toLowerCase().includes(search)));

    return (
        <div className="history">
            <div className="filters">
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your chats" aria-label="Search your chats" />
                <div className="chips" role="group" aria-label="Filter by tab">
                    {FILTERS.map(({ label, value }) => (
                        <button key={value} type="button" className={kind === value ? 'chip chip-active' : 'chip'} aria-pressed={kind === value} onClick={() => setKind(value)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <p className="text-light-200 text-sm" aria-live="polite">
                Showing {visible.length} of {chats.length} chat{chats.length === 1 ? '' : 's'}
            </p>

            {GROUPS.map((group) => {
                const items = visible.filter((chat) => chat.group === group);
                return items.length > 0 && (
                    <section key={group} className="history-group" aria-label={group}>
                        <h2>{group}</h2>
                        <ul>
                            {items.map((chat) => <HistoryRow key={chat.id} chat={chat} />)}
                        </ul>
                    </section>
                );
            })}

            {visible.length === 0 && <p className="empty-state">No chats match. Try other words, or another tab.</p>}

            {demo && (
                <p className="composer-notes">
                    Demo accounts are shared, so anyone using this account sees these chats. They&apos;re deleted after 24 hours.
                </p>
            )}
        </div>
    )
}

export default ChatHistory
