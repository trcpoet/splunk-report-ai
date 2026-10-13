import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { getViewerOrNull } from "@/lib/dal";
import { DEMO_USERS } from "@/lib/demo-users";

export const metadata: Metadata = {
    title: 'Sign in | SplunkEvents',
};

type Props = { searchParams: Promise<{ next?: string | string[] }> };

const BASE = 'http://splunkevents.invalid';

// Only paths on this site, so the login page can't send people elsewhere.
// Parsing with URL also catches tricks like "/\evil.com" and "/<tab>/evil.com".
const safeNextPath = (next: string | string[] | undefined) => {
    if (typeof next !== 'string') return '/';

    try {
        const url = new URL(next, BASE);
        if (url.origin !== BASE || url.pathname.startsWith('/login')) return '/';
        return url.pathname + url.search + url.hash;
    } catch {
        return '/';
    }
};

const LoginPage = ({ searchParams }: Props) => (
    <section id="login">
        <div className="header">
            <h1 className="text-4xl max-sm:text-3xl">Sign in</h1>
            <p>You see the reports your teams used to get by email.</p>
        </div>

        <Suspense fallback={<div className="login-card" aria-busy="true" />}>
            <LoginGate searchParams={searchParams} />
        </Suspense>
    </section>
)

// Signed-in visitors skip the form.
async function LoginGate({ searchParams }: Props) {
    const next = safeNextPath((await searchParams).next);
    if (await getViewerOrNull()) redirect(next);

    const demoAccounts = process.env.NODE_ENV === 'development'
        ? DEMO_USERS.map(({ email, role, groups }) => ({ email, access: role === 'admin' ? 'admin' : groups.join(', ') }))
        : [];

    return <LoginForm next={next} demoAccounts={demoAccounts} />;
}

export default LoginPage;
