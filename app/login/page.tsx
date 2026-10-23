import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { PageTransition } from "@/components/Transitions";
import { getViewerOrNull } from "@/lib/dal";
import { DEMO_USERS } from "@/lib/demo-users";
import { safeNextPath } from "@/lib/next-path";

export const metadata: Metadata = {
    title: 'Sign in | SplunkEvents',
};

type Props = { searchParams: Promise<{ next?: string | string[] }> };

// DEMO_MODE is for the hosted demo, which only has dummy data: it lists the
// accounts and shows their shared password, so visitors sign in with one click.
// The form is part of the page's prerendered HTML, so these are read when the
// app is built.
const demoMode = process.env.DEMO_MODE === 'true';
const demoAccounts = demoMode || process.env.NODE_ENV === 'development'
    ? DEMO_USERS.map(({ email, role, groups }) => ({ email, access: role === 'admin' ? 'admin' : groups.join(', ') }))
    : [];

// The form shows at once; only the check for an existing session waits for
// the server.
const LoginPage = ({ searchParams }: Props) => (
    <PageTransition>
        <section id="login">
            <div className="header">
                <h1 className="text-4xl max-sm:text-3xl">Sign in</h1>
                <p>You see the reports your teams used to get by email.</p>
            </div>

            <LoginForm demoAccounts={demoAccounts} demoPassword={demoMode ? process.env.DEMO_PASSWORD : undefined} />

            <Suspense fallback={null}>
                <SignedInRedirect searchParams={searchParams} />
            </Suspense>
        </section>
    </PageTransition>
)

// Signed-in visitors skip the form. If the session can't be checked (the
// database is down, say), the form stays, and signing in says what's wrong.
async function SignedInRedirect({ searchParams }: Props) {
    const next = safeNextPath((await searchParams).next);

    let signedIn = false;
    try {
        signedIn = (await getViewerOrNull()) !== null;
    } catch (error) {
        unstable_rethrow(error);
    }

    if (signedIn) redirect(next);
    return null;
}

export default LoginPage;
