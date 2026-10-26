// Where to go after signing in, from the login page's `next` parameter. Only
// paths on this site, so the login page can't send people elsewhere. Parsing
// with URL also catches tricks like "/\evil.com" and "/<tab>/evil.com". Pure,
// so the browser and the server share it.

const BASE = 'http://splunkevents.invalid';

export const safeNextPath = (next: string | string[] | null | undefined) => {
    if (typeof next !== 'string') return '/';

    try {
        const url = new URL(next, BASE);
        if (url.origin !== BASE || url.pathname.startsWith('/login')) return '/';
        return url.pathname + url.search + url.hash;
    } catch {
        return '/';
    }
};
