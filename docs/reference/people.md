# `src/people/`: sign-in, sessions and who sees what

Signing in and out (Better Auth), keeping tabs in step, the demo accounts, and the rule that decides which reports someone may see.

Files marked **server-only** start with `import 'server-only'`, so importing them into browser code fails the build. Files marked **pure** do no I/O and are unit-tested in the `*.test.ts` next to them. In `components/`, **client** files start with `'use client'` and run in the browser too; **server** components run only on the server.

Back to the [file reference](README.md).

## Who sees what

### `access.ts` (pure)

`canView(viewer, allowedGroups)`: admins see every report; anyone else sees a report when one of their groups is in its `allowedGroups`. That's the whole rule.
- **Also exports:** the `Role` (`admin` | `viewer`) and `Viewer` types.
- **Used by:** `dal.ts`, `chats.ts`, `feedback.ts`, `spl-examples.ts`, the AI code.
- **Tests:** `access.test.ts` checks every demo user against every dummy report.

## Sign-in and sessions

### `auth-options.ts`

Better Auth's settings, shared by the web app and the seed script: the app name, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the MongoDB adapter.
- **The adapter** gets only the database, which keeps transactions off. A standalone `mongod` doesn't support them.
- **Also exports:** `closeAuthDatabase()` for scripts.
- **No `next/*` imports**, so plain Node can load it.

### `auth.ts` (server-only)

The web app's Better Auth instance, with **sign-up turned off**. Accounts come from `npm run seed`, later from the company's identity provider, so nobody can register `admin@example.com` and inherit its access.
- **Used by:** `dal.ts`, `src/app/api/auth/[...all]/route.ts`.

### `auth-client.ts`

Better Auth in the browser: `authClient`, on the same origin. Used by `LoginForm` and `SignOutButton`.

### `session-sync.ts`

Signing in or out in one tab reloads the app's other tabs, through a `BroadcastChannel`. A full page load drops pages cached for the previous session.
- **Exports:** `announceSessionChange()`, `onSessionChange(callback)`.
- **Used by:** `LoginForm`, `SignOutButton`, `AutoRefresh`.

### `next-path.ts` (pure)

`safeNextPath(next)`: where to go after signing in. Only paths on this site; it catches tricks like `/\evil.com`. Tested.

### `demo-users.ts`

`DEMO_USERS`: the five demo accounts, with name, role and groups. Their groups match the dummy reports' email lists, so each account sees a different set.
- **Used by:** `scripts/seed-demo-users.ts` (creates them) and `src/app/login/page.tsx` (lists them in demo mode).
- **Change it when:** you want other demo accounts. Then run `npm run seed`.

## `components/`

### `LoginForm.tsx` (client)

Email and password sign-in through Better Auth.
- **Demo accounts:** with demo accounts listed (`demoAccounts`, `demoPassword`), each one signs in with one click.
- **Errors in plain words:**
  - a wrong email or password (401);
  - too many tries (429);
  - an address Better Auth doesn't trust (403), such as a per-deployment Vercel URL.
- **After success:** a full page load to the safe `next` path, which also tells other tabs.
- **Landing here from inside the app** means the session ended while a tab was open, so the form reloads that tab first.
- **Used by:** `src/app/login/page.tsx`.

### `UserMenu.tsx` (server)

The signed-in person's name and groups, and Sign out.
- **When the session can't be read** (the database is down), it shows just the sign-out button and leaves the error to the page.
- **On the sign-in page**, CSS hides it.
- **Used by:** `Navbar.tsx`.

### `SignOutButton.tsx` (client)

Signs out with Better Auth, then does a full page load to `/login`. That drops the browser's cached pages for the session. It also tells other tabs to reload (`src/people/session-sync.ts`). Its label shows when it's signing out, and when it failed.
