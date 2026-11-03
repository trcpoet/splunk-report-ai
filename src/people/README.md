# `src/people/`: sign-in and who sees what

- `access.ts` is the rule for who may see a report: admins see every report, everyone else the reports shared with one of their groups.
- `auth-options.ts`, `auth.ts` and `auth-client.ts` set up sign-in (Better Auth) on the server and in the browser.
- `session-sync.ts` keeps open tabs in step when someone signs in or out.
- `demo-users.ts` lists the demo accounts that `npm run seed` creates.
- `next-path.ts` makes sure the page you return to after signing in is one of this site's.
- `components/` has the login form, the user menu and the sign-out button.

**Open first:** `access.ts`.

**Tests:** the `*.test.ts` next to each file. **More:** [docs/reference/people.md](../../docs/reference/people.md) and [docs/report-access.md](../../docs/report-access.md).
