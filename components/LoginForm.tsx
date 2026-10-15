'use client';

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Props = {
    // A same-site path, already checked by the login page.
    next: string;
    // Listed in development and in DEMO_MODE, to make the demo easy to try.
    demoAccounts: { email: string; access: string }[];
    // DEMO_MODE only: the shared password, so each account signs in with one click.
    demoPassword?: string;
};

const LoginForm = ({ next, demoAccounts, demoPassword }: Props) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const signIn = async (email: string, password: string) => {
        setPending(true);
        setError(null);

        const { error } = await authClient.signIn.email({ email, password });

        if (error) {
            setError(error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong email or password.');
            setPending(false);
            return;
        }

        // A full page load, not router.replace(): the client cache can still hold
        // the redirect to /login that was prefetched for `next` while signed out,
        // and reusing it bounced production builds between /login and `next`.
        // replace() keeps /login out of the history, as router.replace() did.
        window.location.replace(next);
    }

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        signIn(email, password);
    }

    return (
        <form className="login-card" onSubmit={onSubmit}>
            <label>
                Email
                <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </label>

            <label>
                Password
                <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
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
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => (demoPassword ? signIn(account.email, demoPassword) : setEmail(account.email))}
                                >
                                    {account.email}
                                </button>
                                <span>{account.access}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </form>
    )
}

export default LoginForm
