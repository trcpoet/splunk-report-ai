'use client';

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 60_000;

// Keeps open pages current without a manual reload. The sync worker clears the
// cached report data after each sync; refreshing re-renders the page from it.
// Client state such as filters and scroll position survives a refresh.
const AutoRefresh = () => {
    const router = useRouter();

    useEffect(() => {
        // Skip hidden tabs, and catch up as soon as one is shown again.
        const refresh = () => {
            if (document.visibilityState === 'visible') router.refresh();
        };

        const timer = setInterval(refresh, EVERY_MS);
        document.addEventListener('visibilitychange', refresh);

        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [router]);

    return null;
}

export default AutoRefresh
