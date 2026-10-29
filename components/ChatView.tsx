'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, RotateCcw, Square, SquarePen } from "lucide-react";
import ChatAnswer, { type ReportChipData } from "@/components/ChatAnswer";
import CopyButton from "@/components/CopyButton";
import SplAnswer from "@/components/SplAnswer";
import { track } from "@/lib/analytics";
import { replaceReportMarkers } from "@/lib/ai/report-links";
import { readEvents } from "@/lib/ai/stream";
import type { ChatDetail, ChatKind, ChatMessage } from "@/lib/chats";
import { firstLine } from "@/lib/format";

// A message on screen. An answer on its way, or one that didn't finish, has a state.
type Shown = ChatMessage & {
    state?: 'waiting' | 'streaming' | 'stopped' | 'failed';
    note?: string;
    // A Write SPL answer that just arrived plays its step-by-step reveal.
    fresh?: boolean;
};

type Props = {
    kind: ChatKind;
    chat: ChatDetail | null;
    // The reports this person can see, for the report links in answers.
    reports: Record<string, ReportChipData>;
    suggestions: string[];
    // Whether answers are available, and what to say when they aren't.
    ai: { enabled: boolean; notice?: string; testMode?: boolean };
    // Text to start with, from a link such as "Ask about this report".
    prefill?: string;
    splunkWebUrl?: string;
    // Demo accounts are shared, so their chats are too.
    demo?: boolean;
};

const PLACEHOLDERS: Record<ChatKind, string> = {
    reports: 'Ask about your reports',
    spl: 'Describe the search you need, or paste one to explain',
};

const MAX_QUESTION = 2000;

// The conversation for one tab of the Ask AI page.
//
// The address bar says which chat is open: /ai/reports is a new chat, and
// /ai/reports?chat=<id> is that saved chat. A new chat gets its address once
// its first answer is saved. Each question and answer are saved together by
// the server, so an answer that is stopped or fails isn't saved.
const ChatView = ({ kind, chat, reports, suggestions, ai, prefill = '', splunkWebUrl, demo = false }: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    // Next keeps recently visited pages, hidden, so ids must be unique per view.
    const inputId = useId();
    const urlChat = useSearchParams().get('chat');

    const [chatId, setChatId] = useState<string | null>(chat?.id ?? null);
    const [title, setTitle] = useState<string | null>(chat?.title ?? null);
    const [messages, setMessages] = useState<Shown[]>(chat?.messages ?? []);
    const [draft, setDraft] = useState(prefill);
    const [busy, setBusy] = useState(false);
    // Read out by screen readers when an answer finishes; the text itself isn't.
    const [announcement, setAnnouncement] = useState('');

    // The chat id this view put in the address bar itself, so it doesn't ask
    // the server for a chat it's already showing.
    const [addressedChat, setAddressedChat] = useState<string | null>(chat?.id ?? null);

    const abort = useRef<AbortController | null>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const end = useRef<HTMLDivElement>(null);

    const startNewChat = () => {
        setChatId(null);
        setAddressedChat(null);
        setTitle(null);
        setMessages([]);
        setDraft('');
        setAnnouncement('');
    };

    // When the address stops naming a chat (the navbar's Ask AI link, say),
    // show a new one. This adjusts state while rendering, as React suggests
    // for state that follows a changing value: https://react.dev/learn/you-might-not-need-an-effect
    const [seenUrlChat, setSeenUrlChat] = useState(urlChat);
    if (urlChat !== seenUrlChat) {
        setSeenUrlChat(urlChat);
        if (!urlChat && chatId && !busy) startNewChat();
    }

    // When the address names a chat this view isn't showing (Back or Forward
    // after starting a new chat), ask the server for that chat's page.
    useEffect(() => {
        if (urlChat && urlChat !== chatId && urlChat !== addressedChat && !busy) router.refresh();
    }, [urlChat, chatId, addressedChat, busy, router]);

    // Keep the newest text in view while it streams, unless the person has
    // scrolled up to read something else.
    useEffect(() => {
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
        if (nearBottom) end.current?.scrollIntoView({ block: 'end' });
    }, [messages]);

    // The first answer of a new chat was saved: give the chat its address.
    const saved = (id: string, question: string) => {
        if (chatId) return;
        setChatId(id);
        setAddressedChat(id);
        setTitle(firstLine(question));
        window.history.replaceState(null, '', `${pathname}?chat=${id}`);
    };

    const send = async (question: string) => {
        const text = question.trim().slice(0, MAX_QUESTION);
        if (!text || busy || !ai.enabled) return;

        const controller = new AbortController();
        abort.current = controller;
        setBusy(true);
        setDraft('');
        setAnnouncement('');

        // Each answer on its way has its own id, so a stopped or failed answer
        // above it is never touched. The server's id replaces it in the last update.
        const createdAt = new Date().toISOString();
        const answerId = `answer-${createdAt}`;
        const update = (change: Partial<Shown>) =>
            setMessages((list) => list.map((message) => (message.id === answerId ? { ...message, ...change } : message)));
        setMessages((list) => [
            ...list,
            { id: `question-${createdAt}`, role: 'user', text, createdAt },
            { id: answerId, role: 'assistant', text: '', createdAt, state: 'waiting' },
        ]);
        requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
        track('ai_question_asked', { kind });

        const fail = (message: string) => {
            update({ state: 'failed', note: message });
            setAnnouncement(message);
        };

        try {
            const response = await fetch(kind === 'reports' ? '/api/ai/chat' : '/api/ai/spl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: chatId ?? undefined, message: text }),
                signal: controller.signal,
            });

            if (!response.ok || !response.body) {
                const body = await response.json().catch(() => null);
                return fail(body?.message ?? 'Something went wrong. Try again.');
            }

            if (kind === 'spl') {
                const { chatId: id, message } = await response.json() as { chatId: string; message: ChatMessage };
                update({ ...message, state: undefined, fresh: true });
                saved(id, text);
                setAnnouncement('Search ready.');
                return;
            }

            let id = chatId;
            let answer = '';
            let finished = false;
            await readEvents(response.body, (event) => {
                if (event.type === 'start') {
                    id = event.chatId;
                } else if (event.type === 'text') {
                    answer += event.text;
                    update({ text: answer, state: 'streaming' });
                } else if (event.type === 'done') {
                    finished = true;
                    update({
                        id: event.messageId,
                        state: undefined,
                        note: event.cutOff ? 'This answer was cut off because it got too long. Ask for less detail, or a narrower question.' : undefined,
                    });
                    if (id) saved(id, text);
                    setAnnouncement('Answer ready.');
                } else {
                    finished = true;
                    fail(event.message);
                }
            });
            // The connection closed without a "done" (the server timed out, say).
            if (!finished) fail("The answer stopped before it finished, so it wasn't saved. Try again.");
        } catch {
            if (controller.signal.aborted) {
                update({ state: 'stopped', note: "Stopped. This answer wasn't saved." });
                setAnnouncement('Stopped.');
            } else {
                fail("Couldn't reach the app. Check your connection and try again.");
            }
        } finally {
            abort.current = null;
            setBusy(false);
            input.current?.focus();
        }
    };

    // Asks a question that didn't get an answer again, in place of the failed try.
    const retry = (index: number) => {
        const question = messages[index - 1];
        if (!question) return;
        setMessages((list) => list.filter((_, i) => i !== index && i !== index - 1));
        send(question.text);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        send(draft);
    };

    // Enter sends; Shift+Enter starts a new line.
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send(draft);
        }
    };

    const newChat = () => {
        if (urlChat) router.push(pathname);
        else startNewChat();
        input.current?.focus();
    };

    const count = Object.keys(reports).length;

    return (
        <section className="chat" aria-label={kind === 'reports' ? 'Ask about reports' : 'Write SPL'}>
            <div className="chat-head">
                <h2 className="chat-title">{title ?? 'New chat'}</h2>
                {messages.length > 0 && (
                    <button type="button" className="btn-secondary btn-small" onClick={newChat} disabled={busy}>
                        <SquarePen aria-hidden="true" />
                        New chat
                    </button>
                )}
            </div>

            {messages.length === 0 && (
                <div className="chat-intro">
                    <p>
                        {kind === 'reports'
                            ? `Ask anything about the ${count} report${count === 1 ? '' : 's'} you can see. Answers use their latest runs and name the reports they come from.`
                            : 'Describe what you want to find in Splunk, or paste a search to have it explained. You get the search step by step, ready to copy. Nothing runs from here.'}
                    </p>
                    {ai.enabled && suggestions.length > 0 && (
                        <div className="chips" role="group" aria-label="Suggestions">
                            {suggestions.map((suggestion) => (
                                <button key={suggestion} type="button" className="chip" onClick={() => send(suggestion)}>
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="chat-log">
                {messages.map((message, index) => message.role === 'user' ? (
                    <div key={message.id} className="msg-user">{message.text}</div>
                ) : (
                    <div key={message.id} className="msg-answer" aria-busy={message.state === 'waiting' || message.state === 'streaming'}>
                        {message.state === 'waiting' && (
                            <p className="thinking"><span className="pulse" aria-hidden="true" />{kind === 'reports' ? 'Reading your reports…' : 'Writing the search…'}</p>
                        )}

                        {message.spl ? (
                            <SplAnswer answer={message.spl} splunkWebUrl={splunkWebUrl} reveal={message.fresh} onFollowUp={send} busy={busy || !ai.enabled} />
                        ) : message.text ? (
                            <ChatAnswer text={message.text} reports={reports} streaming={message.state === 'streaming'} />
                        ) : null}

                        {message.note && <p className={message.state === 'failed' ? 'answer-note failed' : 'answer-note'}>{message.note}</p>}

                        {message.state === 'failed' && (
                            <button type="button" className="btn-secondary btn-small w-fit" onClick={() => retry(index)} disabled={busy}>
                                <RotateCcw aria-hidden="true" />
                                Try again
                            </button>
                        )}
                        {!message.state && !message.spl && (
                            <CopyButton text={replaceReportMarkers(message.text, (slug) => reports[slug]?.title ?? slug)} label="Copy" className="btn-ghost" />
                        )}
                    </div>
                ))}
                <div ref={end} />
            </div>

            <p className="sr-only" aria-live="polite">{announcement}</p>

            <div className="composer">
                {ai.enabled ? (
                    <form onSubmit={submit}>
                        <label htmlFor={inputId} className="sr-only">{PLACEHOLDERS[kind]}</label>
                        <textarea
                            id={inputId}
                            ref={input}
                            rows={1}
                            value={draft}
                            maxLength={MAX_QUESTION}
                            placeholder={PLACEHOLDERS[kind]}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={onKeyDown}
                        />
                        {/* One button that turns into Stop while an answer comes in, so
                            keyboard focus stays on it. */}
                        <button
                            type={busy ? 'button' : 'submit'}
                            className={busy ? 'composer-button stop' : 'composer-button'}
                            onClick={busy ? () => abort.current?.abort() : undefined}
                            disabled={!busy && !draft.trim()}
                            aria-label={busy ? 'Stop' : 'Send'}
                        >
                            {busy ? <Square aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
                        </button>
                    </form>
                ) : (
                    <p className="ai-notice" role="status">{ai.notice}</p>
                )}
                <p className="composer-notes">
                    {ai.testMode && <span>Test mode: answers are canned (AI_PROVIDER=fake). </span>}
                    {demo && <span>Demo accounts are shared, so anyone using this account sees these chats. They&apos;re deleted after 24 hours. </span>}
                    {ai.enabled && <span>AI can get things wrong, so check important numbers in the report.</span>}
                </p>
            </div>
        </section>
    )
}

export default ChatView
