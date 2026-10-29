'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { PAGE_TRANSITION } from "@/components/Transitions";

// Following a link to the page you're on doesn't scroll, so links to the home
// page scroll back to its top when you're already there.
const toTopOnHome = () => {
    if (window.location.pathname !== '/') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' });
}

export const HomeLink = ({ className, children }: { className?: string; children: ReactNode }) => (
    <Link href="/" className={className} transitionTypes={PAGE_TRANSITION} onClick={toTopOnHome}>
        {children}
    </Link>
)

// `section` marks the link as current on every page under it (the Ask AI tabs).
const LINKS = [
    { href: '/', label: 'Overview', className: 'nav-overview' },
    { href: '/#reports', label: 'All Reports' },
    { href: '/ai', label: 'Ask AI', className: 'nav-ai', section: '/ai' },
];

const isCurrent = (link: (typeof LINKS)[number], current?: string) =>
    link.section ? current === link.section || !!current?.startsWith(`${link.section}/`) : link.href === current;

// The navbar's page links, with the current page marked. The Navbar also
// shows this list unmarked while a report page's address is still unknown.
export const NavLinkList = ({ current }: { current?: string }) => (
    <>
        {LINKS.map((link) => (
            <li key={link.href}>
                <Link
                    href={link.href}
                    className={link.className}
                    transitionTypes={PAGE_TRANSITION}
                    onClick={link.href === '/' ? toTopOnHome : undefined}
                    aria-current={isCurrent(link, current) ? 'page' : undefined}
                >
                    {link.section && <MessagesSquare aria-hidden="true" />}
                    {link.label}
                </Link>
            </li>
        ))}
    </>
)

// The sign-in page gets no links: signed out, they would only lead back to it.
const NavLinks = () => {
    const pathname = usePathname();
    if (pathname === '/login') return null;

    return <NavLinkList current={pathname} />;
}

export default NavLinks
