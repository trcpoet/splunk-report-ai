# SplunkEvents

**Splunk reports without the inbox.** SplunkEvents puts every scheduled Splunk report your teams receive by email into one searchable web app. Instead of digging through email threads, anyone with access can open the latest results, check run history, copy the SPL query, or download the data as CSV.

> **Demo status:** every report in this repo is **dummy data** (see [`lib/reports.ts`](lib/reports.ts)). Hosts, users and results are made up, emails use `example.com`, and IPs come from documentation-only ranges. Nothing is connected to a real Splunk instance yet.

## What the demo shows

- **Overview:** headline numbers (scheduled reports, reports needing attention, how many report emails a week the app replaces) and the full report list, with search and status/category filters.
- **Report page (`/reports/[slug]`):** status and alert message, key numbers, the latest results table, the SPL query, the last 7 runs, schedule details, the distribution lists that used to receive the email, and **Download CSV** / **Copy SPL** buttons.
- **JSON API:** `GET /api/reports` lists all reports, and `GET /api/reports/[slug]` returns one report with its results and history.

The demo includes 9 sample reports across security, operations, infrastructure, business and compliance, with a mix of healthy, warning and failed runs.

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). No database or API keys are needed.

Optional: to send usage analytics to PostHog (US cloud), copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_POSTHOG_KEY`.

## Connecting real Splunk data (next step)

The UI reads everything through `lib/reports.ts`. To go live, replace the dummy array with data pulled from the Splunk REST API on the server:

1. `GET /services/saved/searches`: the scheduled reports, with schedule, owner, app and SPL.
2. `GET /services/saved/searches/{name}/history`: recent run jobs for each report.
3. `GET /services/search/jobs/{sid}/results?output_mode=json`: the results of the latest run.

Authenticate with a Splunk token stored as a server-side environment variable (never a `NEXT_PUBLIC_` one), and add single sign-on before exposing real report data.

## Tech stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, and optionally PostHog.
