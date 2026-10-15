'use client';

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const SignOutButton = () => {
    const [pending, setPending] = useState(false);

    const signOut = async () => {
        setPending(true);
        await authClient.signOut();
        // A full page load drops the client cache, which holds pages rendered for
        // this session, so whoever signs in next (say, another demo account)
        // doesn't see them. router.refresh() only clears the current route.
        window.location.replace('/login');
    }

    return (
        <button type="button" className="sign-out" onClick={signOut} disabled={pending}>
            {pending ? 'Signing out…' : 'Sign out'}
        </button>
    )
}

export default SignOutButton
