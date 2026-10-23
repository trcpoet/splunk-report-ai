'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

const LINKS = [
    { href: '/', label: 'Overview' },
    { href: '/#reports', label: 'All Reports' },
];

// The navbar's page links, with the current page marked. The Navbar also
// shows this list unmarked while a report page's address is still unknown.
export const NavLinkList = ({ current }: { current?: string }) => (
    <>
        {LINKS.map(({ href, label }) => (
            <li key={href}>
                <Link
                    href={href}
                    transitionTypes={PAGE_TRANSITION}
                    onClick={href === '/' ? toTopOnHome : undefined}
                    aria-current={href === current ? 'page' : undefined}
                >
                    {label}
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
