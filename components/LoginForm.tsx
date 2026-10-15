'use client';

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Props = {
    // A same-site path, already checked by the login page.
    next: string;
    // Listed in development only, to make the demo easy to try.
    demoAccounts: { email: string; access: string }[];
};

const LoginForm = ({ next, demoAccounts }: Props) => {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const signIn = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPending(true);
        setError(null);

        const { error } = await authClient.signIn.email({ email, password });

        if (error) {
            setError(error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong email or password.');
            setPending(false);
            return;
        }

        router.replace(next);
        router.refresh();
    }

    return (
        <form className="login-card" onSubmit={signIn}>
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
                    <p>
                        Demo accounts. The password is the value of <code>DEMO_PASSWORD</code> in your
                        .env.local file (not the word itself). See it with <code>grep DEMO_PASSWORD .env.local</code>.
                    </p>
                    <ul>
                        {demoAccounts.map((account) => (
                            <li key={account.email}>
                                <button type="button" onClick={() => setEmail(account.email)}>{account.email}</button>
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
