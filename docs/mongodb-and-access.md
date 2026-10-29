# MongoDB, live data and report access

A plain-language guide to where SplunkEvents keeps its data, how fresh data reaches the screen, and how we decide who sees which report.

## The short version

- **MongoDB is already connected.** The app reads the connection string `MONGODB_URI` from `.env.local`. There's nothing else to set up.
- **Data reaches MongoDB through the sync worker**, never straight from Splunk to the browser: Splunk → `npm run sync` → MongoDB → app.
- **For data that keeps updating**, run `npm run sync:watch` next to `npm run dev`. Open pages refresh themselves every minute.
- **Access:** a user sees a report when they share a group with it. Admins see everything.

## MongoDB for someone who knows SQL

MongoDB stores JSON-like **documents** in **collections** instead of rows in tables. A document can hold nested objects and lists, so related data is often stored together instead of joined.

| SQL | MongoDB | In this app |
|---|---|---|
| database | database | `splunkevents` |
| table | collection | `reports`, `report_runs`, `user_access`… |
| row | document | one report, with its recent run history inside it |
| primary key | `_id` (always there) | plus unique `slug` (reports) and `sid` (runs) |
| table schema | **none on the server**. Mongoose checks it in our code. | `database/*.model.ts` |
| JOIN | usually not needed: store related data together | each report stores its recent runs (`history`) inside it |
| GROUP BY | aggregation pipeline | `loadRunCounts()` in `lib/dal.ts` |
| scheduled cleanup job | **TTL index**: MongoDB deletes old documents itself | runs older than `RUN_RETENTION_DAYS` (90) disappear |
| INSERT … ON CONFLICT UPDATE | `updateOne(…, { upsert: true })` | how the sync and the seed script write |
| migrations | none: documents just gain new fields | — |

## How the app connects

One setting, `MONGODB_URI=mongodb://127.0.0.1:27017/splunkevents`, used by two clients:

- **Mongoose** (`lib/mongodb.ts`) for report data. It opens one connection and reuses it, even across dev hot reloads.
- **The MongoDB driver** (`lib/auth-options.ts`) for logins, used by Better Auth.

In the web app, both give up after 5 seconds if the database doesn't answer, so pages show an error screen with **Try again** instead of hanging (see [caching-and-loading.md](caching-and-loading.md)). The sync worker and the seed script keep the driver's default of 30 seconds, so their writes ride out a brief Atlas primary election.

Locally, MongoDB runs through Homebrew (`brew services start mongodb-community@8.0`) and only accepts connections from this machine. It has no password of its own, which is fine for the demo. Before real data goes in, the database moves to a hosted service with its own login.

## What's in the database

| Collection | What it holds | Written by |
|---|---|---|
| `reports` | one document per Splunk scheduled report: settings, latest status, recent runs, chart, who may see it (`allowedGroups`) | the sync |
| `report_runs` | one document per run, with its result rows | the sync |
| `sync_state` | when the last sync ran and whether it worked | the sync |
| `user_access` | each user's role (`admin` / `viewer`) and groups | `npm run seed`, or by hand |
| `user`, `account`, `session` | logins, password hashes and sessions | Better Auth |
| `chats` | Ask AI conversations, one document per chat with its questions and answers inside, owned by the user who started it | the Ask AI page ([ai.md](ai.md)) |
| `ai_usage` | AI requests and tokens per user per day, for the daily limits (deleted after a week) | the Ask AI page |
| `ai_summaries` | AI summaries for Explain and the briefing, written once and reused (deleted after 30 days) | the Ask AI endpoints |
| `ai_feedback` | 👍 / 👎 on AI answers, summaries and briefing flags, one per user per item | the thumbs buttons |

## Looking at the data

- **MongoDB Compass** (desktop app): connect to `mongodb://127.0.0.1:27017`, then open `splunkevents`. Good for browsing and small edits.
- **mongosh** (terminal, like `psql`):

  ```js
  // mongosh splunkevents
  db.reports.find({}, { slug: 1, allowedGroups: 1 })                    // SELECT slug, allowedGroups FROM reports
  db.report_runs.find({ status: 'failed' }).sort({ runAt: -1 }).limit(5) // latest failures
  db.user_access.find()                                                 // who has which groups
  ```

- **Claude Code**: the `mongodb` MCP server in `.mcp.json` can read the same collections (read-only).

## Getting live data

```
Splunk ──► sync worker ──► MongoDB ──► app ──► browser
           every 15 min                         refreshes every minute
```

1. **Run the app and the worker side by side**, in two terminals:

   ```bash
   npm run dev
   npm run sync:watch      # syncs every SYNC_INTERVAL_MINUTES (default 15)
   ```

2. **After each sync**, the worker calls `POST /api/revalidate`, which clears the app's cached report data. This needs `APP_URL` and `REVALIDATE_SECRET` in `.env.local`.
3. **Open pages refresh themselves** every minute, and as soon as you switch back to the tab (`components/AutoRefresh.tsx`). Filters and scroll position stay put.

**Fixture mode vs. live mode.** With `SPLUNK_MODE=fixture` (today), the worker loads the dummy reports, so after the first sync nothing new arrives. For real data, follow [Connecting live Splunk](connecting-live-splunk.md). Nothing else in the app changes.

**How fresh is "live"?** A report is as fresh as its Splunk schedule (for example, hourly). After a run, the worker stores it within one sync interval, and an open browser shows it within a minute after that.

## Who sees which report

Admins see every report. Anyone else sees a report when at least one of their groups (in `user_access`) is also one of the report's groups (from `lib/report-config.ts`, or else its email lists). [Report settings and access](report-access.md) explains the rule, every `report-config.ts` setting, and a worked example of setting up teams.

## Ideas for later: where users' groups could come from

Today's rule (user groups ∩ report groups) stays the same in every option below. Only the source of the groups changes.

1. **Edited by hand (today).** Admins update `user_access` in mongosh. Simplest, but doesn't scale and leaves no record of who changed what.
2. **An admin page in the app.** Edit users' groups and each report's groups in the browser, and log every change in an `access_audit` collection. Report groups set here would override `report-config.ts`, so changing access wouldn't need a deploy.
3. **Your company login provider (Okta, Entra, Google Workspace).** At sign-in, copy the user's groups into `user_access` (the model already has `source: 'idp'` for this). HR and IT keep groups up to date, not you. This is the best long-term option and fits the Supabase/AWS move.
4. **Splunk's own permissions.** The sync already stores each report's Splunk read roles (`splunk.readRoles`). You could also fetch users' Splunk roles, so someone sees exactly what Splunk lets them see. The catch: Splunk roles are usually too broad, often "everyone in the app".
5. **Expand email lists.** If `secops@` is a real mailing list, look up its members through Google or Microsoft Graph. Then "receives the email" means "can see the report", which matches how people already think about it.

**Suggested order:** stay with option 1 while the app is a demo. Add option 2 when more than a handful of people use it, and switch to option 3 when company sign-in arrives.

## How the data is shown

These are already installed. There's no need to add more for now.

| Library | Used for | Where |
|---|---|---|
| **shadcn/ui charts** (built on **Recharts**) | bar, column, line and area charts with themed tooltips | `components/ui/chart.tsx`, `components/ReportChart.tsx`, `lib/chart-theme.ts` |
| **TanStack Table** (`@tanstack/react-table`) | results table: click a header to sort, type to filter | `components/ResultsTable.tsx` |
| **`lib/format.ts`** (our own) | numbers (`48,210`, `1.3K`), dates and durations, always in UTC so the server and the browser show the same text | everywhere |
| **lucide-react** | icons | everywhere |
| **Tailwind CSS** | styling | `app/globals.css` |

To add a component, the `shadcn` MCP server in `.mcp.json` can browse and install shadcn/ui components.
