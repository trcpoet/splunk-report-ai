'use client';

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { History, MessagesSquare, SquareTerminal } from "lucide-react";

const TABS = [
    { href: '/ai/reports', label: 'Ask about reports', icon: MessagesSquare },
    { href: '/ai/spl', label: 'Write SPL', icon: SquareTerminal },
    { href: '/ai/history', label: 'History', icon: History },
];

// The Ask AI page's tabs, with the current one marked. They're links, so each
// tab has its own address. The layout also shows this list unmarked while the
// address is still unknown.
export const AiTabList = ({ current, hrefs = {}, onLeave }: { current?: string; hrefs?: Record<string, string>; onLeave?: () => void }) => (
    <nav className="ai-tabs" aria-label="Ask AI">
        {TABS.map(({ href, label, icon: Icon }) => (
            <Link
                key={href}
                href={hrefs[href] ?? href}
                aria-current={href === current ? 'page' : undefined}
                onClick={href === current ? undefined : onLeave}
            >
                <Icon aria-hidden="true" />
                {label}
            </Link>
        ))}
    </nav>
)

// Remembers the chat each tab had open, so switching to Write SPL and back
// returns to the same chat instead of a new one.
const AiTabs = () => {
    const pathname = usePathname();
    const chat = useSearchParams().get('chat');
    const [last, setLast] = useState<Record<string, string>>({});

    const remember = () => {
        if (pathname === '/ai/reports' || pathname === '/ai/spl') {
            setLast((tabs) => ({ ...tabs, [pathname]: chat ? `${pathname}?chat=${chat}` : pathname }));
        }
    };

    return <AiTabList current={pathname} hrefs={last} onLeave={remember} />;
}

export default AiTabs
