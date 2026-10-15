import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * /api/auth/*
 * Better Auth's endpoints that the app uses: sign in, sign out and session lookups.
 */
const handler = toNextJsHandler(auth);

// Everything else Better Auth serves (change password, update or delete the
// user, list or revoke sessions, ...) answers 404. The demo accounts are shared,
// so those would let one visitor lock the others out or see their IP addresses.
// Add a path here when a feature needs it (company SSO: /sign-in/social and
// /callback/<provider>).
const ALLOWED: Record<string, string[] | undefined> = {
    GET: ['/api/auth/get-session'],
    POST: ['/api/auth/sign-in/email', '/api/auth/sign-out'],
};

const isAllowed = (request: Request) => ALLOWED[request.method]?.includes(new URL(request.url).pathname) ?? false;
const notFound = () => Response.json({ message: 'Not found' }, { status: 404 });

export const GET = (request: Request) => (isAllowed(request) ? handler.GET(request) : notFound());
export const POST = (request: Request) => (isAllowed(request) ? handler.POST(request) : notFound());
