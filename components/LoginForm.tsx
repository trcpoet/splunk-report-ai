'use client';

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/next-path";
import { announceSessionChange } from "@/lib/session-sync";

type Props = {
    // Listed in development and in DEMO_MODE, to make the demo easy to try.
    demoAccounts: { email: string; access: string }[];
    // DEMO_MODE only: the shared password, so each account signs in with one click.
    demoPassword?: string;
};

// Says what went wrong in terms the person can act on. Better Auth answers 401
// for a wrong email or password, 429 after too many tries in a row, and 403
// on an address it doesn't trust, such as a per-deployment Vercel URL.
const messageFor = (status: number | undefined) => {
    if (status === 429) return 'Too many attempts. Wait a minute and try again.';
    if (status === 403) return 'Signing in doesn’t work from this address. Open the app’s main address and sign in there.';
    if (status === undefined || status >= 500) return 'Couldn’t reach the sign-in service. Try again in a moment.';
    return 'Wrong email or password.';
};

const Spinner = () => <LoaderCircle aria-hidden="true" className="spinner" />;

const LoginForm = ({ demoAccounts, demoPassword }: Props) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    // What is signing in: 'form', or the email of the demo account clicked.
    const [pending, setPending] = useState<string | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // Landing here from inside the app means the session ended while a tab was
    // open (an automatic refresh found it gone). Reload, as signing out does, so
    // the pages this tab cached for that session are dropped.
    useEffect(() => {
        const [entry] = performance.getEntriesByType('navigation');
        if (entry && new URL(entry.name).pathname !== '/login') window.location.reload();
    }, []);

    const signIn = async (email: string, password: string, source: string) => {
        setPending(source);
        setError(null);

        let status: number | undefined;
        try {
            const { error } = await authClient.signIn.email({ email, password });
            if (!error) status = 200;
            else status = error.status;
        } catch {
            status = undefined;
        }

        if (status !== 200) {
            setError(messageFor(status));
            setPending(null);
            return;
        }

        // A full page load, not router.replace(): the client cache can still hold
        // the redirect to /login that was prefetched for `next` while signed out,
        // and reusing it bounced production builds between /login and `next`.
        // replace() keeps /login out of the history, as router.replace() did.
        // The proxy puts `next` in the address; safeNextPath keeps it on this site.
        // Other open tabs reload too.
        announceSessionChange();
        window.location.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')));
    }

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        signIn(email, password, 'form');
    }

    // Without the demo password (local development), a click fills in the email
    // and moves on to the password.
    const pickAccount = (account: string) => {
        if (demoPassword) {
            signIn(account, demoPassword, account);
            return;
        }
        setEmail(account);
        passwordRef.current?.focus();
    }

    // method="post": a submit before the page's JavaScript has loaded reloads
    // the page instead of putting the password in the address bar.
    return (
        <form className="login-card" method="post" onSubmit={onSubmit} aria-busy={pending !== null}>
            <label>
                Email
                <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </label>

            <label>
                Password
                <input
                    ref={passwordRef}
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn-primary" disabled={pending !== null}>
                {pending === 'form' ? <><Spinner /> Signing in…</> : 'Sign in'}
            </button>

            {demoAccounts.length > 0 && (
                <div className="demo-accounts">
                    {demoPassword ? (
                        <p>Demo accounts: pick one to sign in. They all use the password <code>{demoPassword}</code>.</p>
                    ) : (
                        <p>
                            Demo accounts. The password is the value of <code>DEMO_PASSWORD</code> in your
                            .env.local file (not the word itself). See it with <code>grep DEMO_PASSWORD .env.local</code>.
                        </p>
                    )}
                    <ul>
                        {demoAccounts.map((account) => (
                            <li key={account.email}>
                                <button type="button" disabled={pending !== null} onClick={() => pickAccount(account.email)}>
                                    {account.email}
                                </button>
                                {pending === account.email ? <span className="signing-in"><Spinner /> Signing in…</span> : <span>{account.access}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </form>
    )
}

export default LoginForm
