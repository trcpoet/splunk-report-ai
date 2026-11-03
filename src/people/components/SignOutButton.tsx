'use client';

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/people/auth-client";
import { announceSessionChange } from "@/people/session-sync";

const LABELS = { idle: 'Sign out', pending: 'Signing out…', failed: 'Try again' } as const;

const SignOutButton = () => {
    const [state, setState] = useState<keyof typeof LABELS>('idle');

    const signOut = async () => {
        setState('pending');

        // Failed when Better Auth answers with an error, or the request itself fails.
        const failed = await authClient.signOut().then(({ error }) => Boolean(error), () => true);
        if (failed) {
            setState('failed');
            return;
        }

        // A full page load drops the client cache, which holds pages rendered for
        // this session, so whoever signs in next (say, another demo account)
        // doesn't see them. router.refresh() only clears the current route.
        // Other open tabs reload too.
        announceSessionChange();
        window.location.replace('/login');
    }

    return (
        <button
            type="button"
            className="sign-out"
            onClick={() => void signOut()}
            disabled={state === 'pending'}
            aria-busy={state === 'pending'}
            title={state === 'failed' ? 'Signing out didn’t work. Check your connection and try again.' : undefined}
        >
            {state === 'pending' && <LoaderCircle aria-hidden="true" className="spinner" />}
            {LABELS[state]}
        </button>
    )
}

export default SignOutButton
