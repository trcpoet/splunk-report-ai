# Connecting live Splunk (on a work laptop)

A step-by-step guide to replacing the dummy reports with your company's real Splunk reports. Follow it on the computer that can reach your company's Splunk, usually a work laptop.

## The big picture

```
Company Splunk ──► sync worker (npm run sync) ──► MongoDB ──► web app ──► browser
```

- The **web app never talks to Splunk.** It only reads MongoDB.
- The **sync worker** is the only part that talks to Splunk. It asks for the scheduled reports and their latest results, and saves them in MongoDB.
- Today the worker reads **fake Splunk** (the files in `src/splunk/fixtures/`). Going live means pointing it at **real Splunk**. That's 4 settings in `.env.local`. No app code changes.
- **To watch it work before you have access,** run the example with a test Splunk: [splunk-example.md](splunk-example.md). It's Splunk Enterprise's trial in Docker, with dummy reports, and the same connector.

> **Splunk MCP is a separate thing.** The `splunk` MCP server in the Claude Code plugin lets Claude look inside Splunk while you work. The app doesn't use it, and you don't need it for live data. See "Optional: Splunk MCP for Claude Code" at the end.

## Before you start: keep company data out of the public repo

`trcpoet/splunk-report-ai` is a **public** GitHub repo. Once you connect real Splunk, your copy will hold company details:

- `.env.local`: the Splunk address and token. Git already ignores it, so it's never committed.
- `config/report-cards.yaml`: real report names, team names and limits. **This file is committed.**
- MongoDB: real results. It lives on your laptop, not in git.

So on the work laptop:

- **Don't push company edits to the public repo.** If you want to save them in git, push to a private repo your company approves (for example, one in your company's GitHub organization). Fixes to the app itself (not company details) can still go to the public repo.
- **Check your company's rules** on running your own code against Splunk and storing report data on your laptop.
- **Keep the app on your laptop** (`localhost`) until it has company sign-in (SSO). The demo logins aren't safe for real data on a shared server.

## Step 1: Set up the app on the work laptop

You need **Node.js 22.9 or newer**, **git** and **MongoDB 8**.

```bash
git clone https://github.com/trcpoet/splunk-report-ai.git
cd splunk-report-ai
npm install
```

Start MongoDB. With Homebrew on a Mac:

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0
```

On Windows, install MongoDB Community Server 8 from mongodb.com, or use Docker (see the README).

Create your settings file and fill in the secrets (make each one with `openssl rand -base64 32`):

```bash
cp .env.example .env.local
```

| Setting | Value |
|---|---|
| `BETTER_AUTH_SECRET` | a new random secret |
| `REVALIDATE_SECRET` | another new random secret |
| `DEMO_PASSWORD` | any password, 8+ characters, for the demo logins |

## Step 2: Check it works with the dummy data first

```bash
npm run seed       # creates the demo logins
npm run sync       # loads the 10 dummy reports
npm run dev        # open http://localhost:3000
```

Sign in as `admin@example.com` with your `DEMO_PASSWORD`. If you see 10 reports, the app works, and any later problem is in the Splunk connection, not the app.

## Step 3: Get access to Splunk

You need three things. Your Splunk admin can help with each one.

**1. The Splunk address (the "management port").** This is the REST API address, not the address you open in the browser:

| Your Splunk | `SPLUNK_BASE_URL` |
|---|---|
| Splunk Cloud | `https://<your-stack>.splunkcloud.com:8089` |
| Splunk Enterprise (your company runs it) | `https://<search-head-host>:8089` |

If your browser address is `https://acme.splunkcloud.com/en-US/app/search/...`, the stack is `acme`.

**2. A token.** A token is a long password that lets the worker read Splunk.

- **For a first test**, you can usually make your own: in Splunk, go to **Settings → Tokens → New Token**. If that menu is missing, token authentication is off or your role can't create tokens, so ask the admin. Your own token sees what you see in Splunk.
- **For real use**, ask the admin for a **service account** (a user for the app, not a person) with its own token, and ask them to share the scheduled reports with its role. Then the app doesn't break when you change jobs or lose access.

Treat the token like a password. It goes only in `.env.local`, never in code, chat or screenshots.

**3. Network access (Splunk Cloud only).** Splunk Cloud blocks the REST API unless your IP address is on the `search-api` allow list. The admin adds it (it needs the `sc_admin` role, or a Splunk support ticket). On a company VPN, give them the VPN's outgoing IP address. Trial stacks have no REST access at all.

**What to send your Splunk admin** (copy and edit):

> Hi, I'm building an internal tool that reads our scheduled Splunk reports and their results through the REST API (read-only; it never starts searches). Could you help me with:
>
> 1. A service account with an authentication token, with read access to these scheduled reports: \<list them\>.
> 2. Adding \<IP address\> to the Splunk Cloud `search-api` allow list, so it can reach port 8089.
> 3. Telling me the search head's timezone (for schedule times).
>
> It calls `saved/searches`, `saved/searches/{name}/history`, `search/jobs/{sid}` and `search/v2/jobs/{sid}/results`.

## Step 4: Test the connection

Before syncing anything, check the address and token work. Put them in `.env.local` as in Step 5, then run:

```bash
SPLUNK_MODE=live npm run splunk:check
```

It only reads, and checks one thing at a time:
1. Splunk answers at that address.
2. The token works, and whose it is (the user and its roles).
3. How many scheduled searches the token can see, and how many the sync takes (`SYNC_REPORTS`).
4. Which cards in `config/report-cards.yaml` are for reports Splunk doesn't have: a typo, or a report not shared with the token's role.
5. A run's results can be read.
6. Every column a card names is in its report's newest results.

Each problem comes with what to fix, for example:

```text
✓ Splunk answers at https://splunk.example.com:8089.
✗ The token doesn't work: GET /services/authentication/current-context returned 401: ...
  → Splunk turned the token down: it is wrong, or it has expired. Make a new token for the service account.
```

It exits with code 1 when a check fails, so scripts can use it. The sync worker prints the same hints.

To check by hand instead, with curl (replace the two values):

```bash
SPLUNK_BASE_URL="https://acme.splunkcloud.com:8089"
SPLUNK_TOKEN="paste-the-token-here"

curl -s -H "Authorization: Bearer $SPLUNK_TOKEN" \
  "$SPLUNK_BASE_URL/servicesNS/-/-/saved/searches?output_mode=json&count=0&search=is_scheduled%3D1" \
  | grep -o '"name":"[^"]*"' | head -20
```

You should see the names of scheduled reports. If not:

| What you see | What it means |
|---|---|
| Nothing for 30+ seconds, then a timeout | Your IP address isn't on the allow list, or you're off the VPN. |
| `Failed to connect` or `Could not resolve host` | The address is wrong. Check the stack name and port 8089. |
| `401` or `Unauthorized` | The token is wrong, expired, or token authentication is off. |
| `SSL certificate problem` | Your company uses its own certificate authority. See "Company certificates" below. |
| An empty list | The token works, but its user can't see any scheduled reports. Ask the admin to share them with its role. |

## Step 5: Switch the app to live

Edit `.env.local`:

```bash
SPLUNK_MODE=live                                     # was: fixture
SPLUNK_BASE_URL=https://acme.splunkcloud.com:8089
SPLUNK_TOKEN=paste-the-token-here
SPLUNK_TZ=America/New_York                           # the search head's timezone; Splunk Cloud is often UTC
```

Then sync and look:

```bash
npm run sync
npm run dev
```

Sign in as `admin@example.com`. Admins see every report, so you should see your real reports. The dummy reports disappear on the first live sync: the sync hides any report that's no longer scheduled in Splunk.

Which reports come in, with `SYNC_REPORTS=emailed` (the default):

- every scheduled report that **emails its results**, and
- every scheduled report **with a card in `config/report-cards.yaml`**, even if it doesn't email.

With `SYNC_REPORTS=configured`, only the ones with a card come in. Use it when the token can see hundreds of emailed searches and the app should show a chosen few. The home page lists 20 reports a page, newest run first, either way.

To keep the data fresh, run the worker on a timer next to the app:

```bash
SYNC_INTERVAL_MINUTES=60 npm run sync:watch     # every hour; the default is every 15 minutes
```

Splunk deletes a run's results after a while (`dispatch.ttl`, by default two schedule periods). Sync more often than that, or some runs are stored without their results. When Splunk runs each report, how often the app copies new runs, and how to choose: [How often reports update](configuration.md#how-often-reports-update).

## Step 6: Decide who sees which report

Right after going live, **only admins see the real reports**, because none of them has a card yet. That's on purpose: nothing is shown to a team until you say so.

For each report, add a card to `config/report-cards.yaml` and choose its teams. [Adding report cards](adding-report-cards.md) is the step-by-step guide, including how to turn a dashboard's tiles into cards, and [Report settings and access](report-access.md) explains the teams, with examples.

## Company certificates

Some companies use their own certificate authority, so Node.js doesn't trust Splunk's certificate. Ask IT for the company's root certificate (a `.pem` file) and point Node.js at it:

```bash
# in .env.local
NODE_EXTRA_CA_CERTS=/path/to/company-root-ca.pem
```

Don't turn off certificate checks (`NODE_TLS_REJECT_UNAUTHORIZED=0`): that would send the token to anyone pretending to be Splunk.

## Common problems

| Problem | Fix |
|---|---|
| "The sync worker's settings need fixing", with a list | Each line names a setting to fix: an empty `SPLUNK_BASE_URL` or token, an address without `https://`, an unknown `SPLUNK_MODE` or `SYNC_REPORTS`, or a time zone the runtime doesn't know. |
| A line starting with `→` in the sync log | What to check for a common mistake: a wrong or expired token, port 8000 (Splunk Web) instead of 8089, a certificate Node doesn't trust. `npm run splunk:check` gives the same advice. |
| The sync finishes but no reports appear | The admin view shows only reports that email their results or have a card. Give the report a card under its exact name. |
| `config/report-cards.yaml needs fixing`, with a list | A mistake in a card: each line says where. [When something is wrong](adding-report-cards.md#when-something-is-wrong) explains each one. |
| A report's results are older than its last run | The worker ran after Splunk deleted the newest results. Run `sync:watch` more often. |
| A report says "No runs yet" | No run of it is stored. It may simply not have run, or the sync log says why: look for `Splunk answered 404`, which means its jobs expired or the token can't read them. |
| A report says "Late" | A run that was due more than 15 minutes ago (or twice its usual run time) hasn't reached the app. In Splunk, check the report's schedule and the scheduler's skipped searches (`index=_internal sourcetype=scheduler status=skipped`). If Splunk did run it, the sync log's `Splunk answered 404` means its results expired before the sync copied them: sync more often. |
| The home page says the last sync had problems | Sign in as an admin to see the reason. A report that failed shows its own reason on its page. |
| The sync log says it skipped a report with the same name | Two saved searches share that name, and the app keeps one: a shared search over a private copy. Rename one. |
| Schedule times are off by some hours | `SPLUNK_TZ` doesn't match the search head's timezone. |
| A team member can't see a report | Their groups and the report's groups share no name. See [Report settings and access](report-access.md). |

## Optional: Splunk MCP for Claude Code

This only lets Claude look at Splunk while you develop (for example, to list reports or try a search). The app works without it.

1. Ask the Splunk admin for the stack's **MCP endpoint URL** and an **OAuth client ID**. The OAuth client needs the redirect URI `http://localhost:8787/callback` and the scopes `openid offline_access`.
2. Add both to your shell profile (`~/.zshrc` on a Mac), **not** `.env.local`, because Claude Code reads the shell:

   ```bash
   export SPLUNK_MCP_URL="https://<your-stack>.splunkcloud.com/.../mcp"
   export SPLUNK_MCP_CLIENT_ID="<client id>"
   ```

3. Open a new terminal, start Claude Code in the repo, run `/mcp`, choose `splunk`, and sign in in the browser.
