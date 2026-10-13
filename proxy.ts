import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Sends visitors without a session cookie to /login. It only checks that the
// cookie exists, so it's a fast redirect, not a security check: lib/dal.ts
// verifies the session and the report access on every request.
export function proxy(request: NextRequest) {
    if (getSessionCookie(request)) return NextResponse.next();

    const login = new URL('/login', request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== '/') login.searchParams.set('next', next);

    return NextResponse.redirect(login);
}

export const config = {
    // Everything except the login page, API routes (they answer 401 themselves),
    // Next.js internals, the PostHog proxy and static files.
    matcher: ['/((?!login|api|_next|ingest|icons|icon\\.svg|favicon\\.ico).*)'],
};
