'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const SignOutButton = () => {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    const signOut = async () => {
        setPending(true);
        await authClient.signOut();
        // Drop the client cache, which holds pages rendered for this session.
        router.replace('/login');
        router.refresh();
    }

    return (
        <button type="button" className="sign-out" onClick={signOut} disabled={pending}>
            {pending ? 'Signing out…' : 'Sign out'}
        </button>
    )
}

export default SignOutButton
