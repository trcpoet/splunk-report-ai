import { createAuthClient } from 'better-auth/react';

// Better Auth in the browser. The API lives on the same origin, so no baseURL.
export const authClient = createAuthClient();
