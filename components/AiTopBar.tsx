'use client';

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { History, LayoutList, MessagesSquare, SquarePen, SquareTerminal } from "lucide-react";
import SidePanel from "@/components/SidePanel";
import { CHAT_DELETED, NEW_CHAT } from "@/lib/ai/chat-events";

const MODES = [
    { href: '/ai/reports', label: 'Ask about reports', short: 'Reports', icon: MessagesSquare },
    { href: '/ai/spl', label: 'Write SPL', short: 'SPL', icon: SquareTerminal },
];

// The mode a page belongs to. The chats page (/ai/history) belongs to
// neither, and its New chat asks about reports.
const modeOf = (pathname: string) => (pathname === '/ai/spl' ? '/ai/spl' : '/ai/reports');

// Ask about reports or Write SPL, with the current one marked. They're links,
// so each mode has its own address. The layout also shows this switch
// unmarked while the address is still unknown.
export const ModeSwitch = ({ current, hrefs = {} }: { current?: string; hrefs?: Record<string, string> }) => (
    <nav className="mode-switch" aria-label="Ask AI">
        {MODES.map(({ href, label, short, icon: Icon }) => (
            <Link key={href} href={hrefs[href] ?? href} aria-current={href === current ? 'page' : undefined} aria-label={label}>
                <Icon aria-hidden="true" />
                {/* On phones the two labels fit only in short. Their names stay in full. */}
                <span className="max-sm:hidden">{label}</span>
                <span className="sm:hidden">{short}</span>
            </Link>
        ))}
    </nav>
)

// On phones, where there's no sidebar, the bar links to the chats page.
const ChatsLink = ({ current = false }: { current?: boolean }) => (
    <Link href="/ai/history" className="icon-button lg:hidden" aria-label="Your chats" aria-current={current ? 'page' : undefined}>
        <History aria-hidden="true" />
    </Link>
)

// New chat: a link to the mode's address. In the mode that's open, the chat
// on screen also clears itself (and stops an answer on its way). When the
// address has nothing after it (after a first question that failed, say),
// following the link would change nothing, so that's all that happens.
export const NewChatLink = ({ className, label, children }: { className: string; label?: string; children: ReactNode }) => {
    const pathname = usePathname();
    const search = useSearchParams().toString();
    const href = modeOf(pathname);

    return (
        <Link
            href={href}
            className={className}
            aria-label={label}
            onNavigate={(event) => {
                if (pathname !== href) return;
                window.dispatchEvent(new Event(NEW_CHAT));
                if (!search) event.preventDefault();
            }}
        >
            {children}
        </Link>
    )
}

// What the layout shows until the address is known: the same bar, unmarked.
export const AiTopBarFallback = () => (
    <div className="ai-topbar">
        <ChatsLink />
        <ModeSwitch />
    </div>
)

type Props = {
    // What the panel holds in each mode, rendered on the server (components/AiPanels.tsx).
    panels: { reports: ReactNode; spl: ReactNode };
    // How many reports need attention, for the Reports button.
    attention?: ReactNode;
};

// The bar above the chat: the mode switch, and a button for the panel that
// goes with the mode (the briefing and your reports, or the searches in them).
// On phones it also has Chats and New chat.
//
// It remembers the chat each mode last had open, so switching to Write SPL
// and back returns to the same chat instead of a new one.
const AiTopBar = ({ panels, attention }: Props) => {
    const pathname = usePathname();
    const chat = useSearchParams().get('chat');

    // Follow the address, whether it changed through the switch, the sidebar
    // or a link. This adjusts state while rendering, as React suggests for
    // state that follows a changing value: https://react.dev/learn/you-might-not-need-an-effect
    const open = pathname === '/ai/reports' || pathname === '/ai/spl' ? (chat ? `${pathname}?chat=${chat}` : pathname) : null;
    const [last, setLast] = useState<Record<string, string>>(() => (open ? { [pathname]: open } : {}));
    const [seen, setSeen] = useState(open);
    if (open !== seen) {
        setSeen(open);
        if (open) setLast((modes) => ({ ...modes, [pathname]: open }));
    }

    // A deleted chat is forgotten, so its mode opens a new chat instead of "Chat not found".
    useEffect(() => {
        const forget = (event: Event) => {
            const id = (event as CustomEvent<string>).detail;
            setLast((modes) => Object.fromEntries(Object.entries(modes).filter(([, href]) => !href.endsWith(`chat=${id}`))));
        };
        window.addEventListener(CHAT_DELETED, forget);
        return () => window.removeEventListener(CHAT_DELETED, forget);
    }, []);

    return (
        <div className="ai-topbar">
            <ChatsLink current={pathname === '/ai/history'} />
            <ModeSwitch current={pathname} hrefs={last} />
            <div className="ai-topbar-end">
                {pathname === '/ai/reports' && (
                    <SidePanel label="Reports" title="Your reports" icon={<LayoutList aria-hidden="true" />} badge={attention}>
                        {panels.reports}
                    </SidePanel>
                )}
                {pathname === '/ai/spl' && (
                    <SidePanel label="Searches" title="Searches in your reports" icon={<SquareTerminal aria-hidden="true" />}>
                        {panels.spl}
                    </SidePanel>
                )}
                <NewChatLink className="icon-button lg:hidden" label="New chat">
                    <SquarePen aria-hidden="true" />
                </NewChatLink>
            </div>
        </div>
    )
}

export default AiTopBar
