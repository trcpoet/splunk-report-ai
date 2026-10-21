# Connecting live Splunk (on a work laptop)

A step-by-step guide to replacing the dummy reports with your company's real Splunk reports. Follow it on the computer that can reach your company's Splunk, usually a work laptop.

## The big picture

```
Company Splunk ──► sync worker (npm run sync) ──► MongoDB ──► web app ──► browser
```

- The **web app never talks to Splunk.** It only reads MongoDB.
- The **sync worker** is the only part that talks to Splunk. It asks for the scheduled reports and their latest results, and saves them in MongoDB.
- Today the worker reads **fake Splunk** (the files in `lib/splunk/fixtures/`). Going live means pointing it at **real Splunk**. That's 4 settings in `.env.local`. No app code changes.

> **Splunk MCP is a separate thing.** The `splunk` MCP server in the Claude Code plugin lets Claude look inside Splunk while you work. The app doesn't use it, and you don't need it for live data. See "Optional: Splunk MCP for Claude Code" at the end.

## Before you start: keep company data out of the public repo

`trcpoet/splunk-report-ai` is a **public** GitHub repo. Once you connect real Splunk, your copy will hold company details:

- `.env.local`: the Splunk address and token. Git already ignores it, so it's never committed.
- `lib/report-config.ts`: real report names, team names and rules. **This file is committed.**
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
npm run sync       # loads the 9 dummy reports
npm run dev        # open http://localhost:3000
```

Sign in as `admin@example.com` with your `DEMO_PASSWORD`. If you see 9 reports, the app works, and any later problem is in the Splunk connection, not the app.

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

## Step 4: Test the connection by hand

Before touching the app, check the address and token work. In a terminal (replace the two values):

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

Which reports come in:

- every scheduled report that **emails its results**, and
- every scheduled report **listed in `lib/report-config.ts`**, even if it doesn't email.

To keep the data fresh, run the worker on a timer next to the app:

```bash
npm run sync:watch     # every SYNC_INTERVAL_MINUTES (default 15)
```

Splunk deletes a run's results after a while (`dispatch.ttl`, by default two schedule periods). Sync more often than that, or some runs are stored without their results.

## Step 6: Decide who sees which report

Right after going live, **only admins see the real reports**, because none of them are in `lib/report-config.ts` yet. That's on purpose: nothing is shown to a team until you say so.

For each report, add an entry to `lib/report-config.ts` and choose its teams. [Report settings and access](report-access.md) explains how, with examples.

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
| `SPLUNK_MODE=live needs SPLUNK_BASE_URL and SPLUNK_TOKEN` | One of them is empty in `.env.local`. |
| The sync finishes but no reports appear | The admin view shows only reports that email their results or are in `report-config.ts`. Add the report's exact name to `report-config.ts`. |
| A report shows "results expired" | The worker ran after Splunk deleted the results. Run `sync:watch` more often. |
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
