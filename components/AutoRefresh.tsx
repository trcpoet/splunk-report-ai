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
        let last = Date.now();

        // Skips hidden tabs and the sign-in page, which has no report data.
        const refresh = () => {
            if (document.visibilityState !== 'visible' || window.location.pathname === '/login') return;
            last = Date.now();
            router.refresh();
        };

        // A tab shown again catches up, unless it refreshed under a minute ago.
        const onVisibilityChange = () => {
            if (Date.now() - last >= EVERY_MS) refresh();
        };

        const timer = setInterval(refresh, EVERY_MS);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [router]);

    return null;
}

export default AutoRefresh
