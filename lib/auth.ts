import 'server-only';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { authOptions } from '@/lib/auth-options';

// The web app's Better Auth instance. Sign-up is off: accounts come from
// `npm run seed` (later, the company identity provider), so nobody can register
// a demo address such as admin@example.com and inherit its access.
export const auth = betterAuth({
    ...authOptions,
    emailAndPassword: { enabled: true, disableSignUp: true },
    // Must stay the last plugin.
    plugins: [nextCookies()],
});
