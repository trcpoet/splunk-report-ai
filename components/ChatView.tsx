'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Square } from "lucide-react";
import ChatAnswer, { type ReportChipData } from "@/components/ChatAnswer";
import CopyButton from "@/components/CopyButton";
import FeedbackButtons from "@/components/FeedbackButtons";
import SplAnswer from "@/components/SplAnswer";
import { track } from "@/lib/analytics";
import { CHAT_SAVED, NEW_CHAT, STOP_ANSWER, type SavedChat } from "@/lib/ai/chat-events";
import { replaceReportMarkers } from "@/lib/ai/report-links";
import { readEvents } from "@/lib/ai/stream";
import { idTime } from "@/lib/chat-list";
import type { ChatDetail, ChatKind, ChatMessage } from "@/lib/chats";
import { firstLine, plural } from "@/lib/format";

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
    // The viewer's 👍 / 👎 on the answers already saved, by message id.
    votes?: Record<string, 'up' | 'down'>;
    // Write SPL answers the viewer saved as examples, by message id.
    savedExamples?: Record<string, true>;
};

// What a new chat asks, above the box to type in.
const GREETINGS: Record<ChatKind, string> = {
    reports: 'What do you want to know about your reports?',
    spl: 'What do you want to search for?',
};

const PLACEHOLDERS: Record<ChatKind, string> = {
    reports: 'Ask anything about your reports',
    spl: 'Describe a search, or paste one to explain',
};

const MAX_QUESTION = 2000;

// Within this many pixels of the bottom of the page, the newest text counts
// as in view: it's kept there while it streams, and the ↓ button stays away.
const NEAR_BOTTOM = 240;

const distanceFromBottom = () => document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);

// The newest message is at the bottom of the page, just above the box to type
// in, which sticks to the bottom of the window.
const scrollToEnd = (behavior: ScrollBehavior = 'instant') =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });

// The conversation for one mode of the Ask AI page, laid out like ChatGPT's:
// a new chat asks its question in the middle of the page, with the box to type
// in under it; once you ask, the box moves to the bottom of the window.
//
// The address bar says which chat is open: /ai/reports is a new chat, and
// /ai/reports?chat=<id> is that saved chat. A new chat gets its address once
// its first answer is saved. Each question and answer are saved together by
// the server, so an answer that is stopped or fails isn't saved.
const ChatView = ({ kind, chat, reports, suggestions, ai, prefill = '', splunkWebUrl, demo = false, votes = {}, savedExamples = {} }: Props) => {
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
    // Whether the newest message is out of view, for the ↓ button.
    const [away, setAway] = useState(false);

    // The chat id this view put in the address bar itself, so it doesn't ask
    // the server for a chat it's already showing.
    const [addressedChat, setAddressedChat] = useState<string | null>(chat?.id ?? null);

    const abort = useRef<AbortController | null>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    // How many messages the chat opened with; only the first showing scrolls to them.
    const opened = useRef(chat?.messages.length ?? 0);

    const startNewChat = () => {
        setChatId(null);
        setAddressedChat(null);
        setTitle(null);
        setMessages([]);
        setDraft('');
        setAnnouncement('');
    };

    // When the address stops naming a chat (New chat, or the navbar's Ask AI
    // link), show a new one, even while an answer comes in: the chat on screen
    // must match the address. (New chat stops that answer first, through
    // NEW_CHAT below.) This adjusts state while rendering, as React suggests
    // for state that follows a changing value: https://react.dev/learn/you-might-not-need-an-effect
    const [seenUrlChat, setSeenUrlChat] = useState(urlChat);
    if (urlChat !== seenUrlChat) {
        setSeenUrlChat(urlChat);
        if (!urlChat && chatId) startNewChat();
    }

    // When the address names a chat this view isn't showing (Back or Forward
    // after starting a new chat), ask the server for that chat's page.
    useEffect(() => {
        if (urlChat && urlChat !== chatId && urlChat !== addressedChat && !busy) router.refresh();
    }, [urlChat, chatId, addressedChat, busy, router]);

    // A saved chat opens at its newest message, like ChatGPT. Showing the page
    // again after visiting another one leaves the scroll where it was.
    useEffect(() => {
        if (opened.current > 0) scrollToEnd();
        opened.current = 0;
    }, []);

    // Keep the newest text in view while it streams, unless the person has
    // scrolled up to read something else.
    useEffect(() => {
        if (distanceFromBottom() < NEAR_BOTTOM) scrollToEnd();
    }, [messages]);

    useEffect(() => {
        const check = () => setAway(distanceFromBottom() > NEAR_BOTTOM);
        const frame = requestAnimationFrame(check);
        window.addEventListener('scroll', check, { passive: true });
        window.addEventListener('resize', check);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', check);
            window.removeEventListener('resize', check);
        };
    }, []);

    // New chat in the sidebar or the top bar, in this chat's mode: clear it.
    // An answer still on its way stops, as with Stop, so it can't be saved
    // into a chat that's no longer on screen (or one being deleted).
    const onNewChat = useEffectEvent(() => {
        abort.current?.abort();
        startNewChat();
        input.current?.focus();
    });
    useEffect(() => {
        const listener = () => onNewChat();
        const stop = () => abort.current?.abort();
        window.addEventListener(NEW_CHAT, listener);
        window.addEventListener(STOP_ANSWER, stop);
        return () => {
            window.removeEventListener(NEW_CHAT, listener);
            window.removeEventListener(STOP_ANSWER, stop);
        };
    }, []);

    // An answer was saved, at `when` by the server's clock. A new chat gets its
    // address, and the sidebar puts the chat at the top of its list.
    const saved = (id: string, question: string, when: string) => {
        const name = title ?? firstLine(question);
        if (!chatId) {
            setChatId(id);
            setAddressedChat(id);
            setTitle(name);
            window.history.replaceState(null, '', `${pathname}?chat=${id}`);
        }
        window.dispatchEvent(new CustomEvent<SavedChat>(CHAT_SAVED, { detail: { id, kind, title: name, updatedAt: when } }));
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
        requestAnimationFrame(() => scrollToEnd());
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
                saved(id, text, message.createdAt);
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
                    if (id) saved(id, text, idTime(event.messageId));
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

    const jumpDown = () => scrollToEnd(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');

    const count = Object.keys(reports).length;
    const empty = messages.length === 0;
    // The newest answer always shows its buttons; older ones on hover or focus.
    const newest = messages.findLastIndex(({ role }) => role === 'assistant');

    return (
        <section className={empty ? 'chat is-empty' : 'chat'} aria-label={kind === 'reports' ? 'Ask about reports' : 'Write SPL'}>
            {empty ? (
                <div className="chat-greeting">
                    <h2 className="chat-greeting-title">{GREETINGS[kind]}</h2>
                    <p>
                        {kind === 'reports'
                            ? `Answers come from the latest runs of the ${plural(count, 'report', 'reports')} you can see, and name the reports they use.`
                            : 'Describe what you want to find, or paste a search to have it explained. You get it step by step, ready to copy. Nothing runs from here.'}
                    </p>
                </div>
            ) : (
                <h2 className="sr-only">{title ?? 'New chat'}</h2>
            )}

            <div className="chat-log">
                {/* Screen readers can't see which side a message is on, so each
                    one says who it's from, as a heading to jump between them. */}
                {messages.map((message, index) => message.role === 'user' ? (
                    <div key={message.id} className="msg-user"><h3 className="sr-only">You asked</h3>{message.text}</div>
                ) : (
                    <div key={message.id} className={index === newest ? 'msg-answer is-newest' : 'msg-answer'} aria-busy={message.state === 'waiting' || message.state === 'streaming'}>
                        <h3 className="sr-only">Answer</h3>
                        {message.state === 'waiting' && (
                            <p className="thinking">{kind === 'reports' ? 'Reading your reports…' : 'Writing the search…'}</p>
                        )}

                        {message.spl ? (
                            <SplAnswer answer={message.spl} splunkWebUrl={splunkWebUrl} reveal={message.fresh} onFollowUp={send} busy={busy || !ai.enabled} messageId={message.id} saved={Boolean(savedExamples[message.id])} />
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
                        {/* A saved answer: the server's id has replaced the one it had on its way. */}
                        {!message.state && !message.id.startsWith('answer-') && (
                            <div className="answer-actions">
                                {!message.spl && (
                                    <CopyButton
                                        text={replaceReportMarkers(message.text, (slug) => reports[slug]?.title ?? slug)}
                                        label="Copy"
                                        className="action-button"
                                        iconOnly
                                    />
                                )}
                                <FeedbackButtons kind="answer" targetId={message.id} initial={votes[message.id]} compact tips={{ up: 'Helpful', down: 'Not helpful' }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <p className="sr-only" aria-live="polite">{announcement}</p>

            <div className="composer">
                {!empty && away && (
                    <button type="button" className="jump-down" onClick={jumpDown} aria-label="Scroll to the newest message">
                        <ArrowDown aria-hidden="true" />
                    </button>
                )}

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

                {empty && ai.enabled && suggestions.length > 0 && (
                    <div className="chips suggestions" role="group" aria-label="Suggestions">
                        {suggestions.map((suggestion) => (
                            <button key={suggestion} type="button" className="chip" onClick={() => send(suggestion)}>
                                {suggestion}
                            </button>
                        ))}
                    </div>
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
