import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * /api/auth/*
 * Better Auth's endpoints: sign in, sign out and session lookups.
 */
export const { GET, POST } = toNextJsHandler(auth);
