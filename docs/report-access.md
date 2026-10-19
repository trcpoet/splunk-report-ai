# Report settings and access

How `lib/report-config.ts` works, and how to control which team sees which report.

## The idea in one picture

```
   USER                                  REPORT
   soc.analyst@example.com               "Failed Login Attempts by User"
   groups: secops, soc-tier1             groups: secops, it-director
                 └──────── shared group? ────────┘
                         yes → can see it
```

Every user has a list of **groups** (teams). Every report has a list of **groups** too. A user sees a report when the two lists **share at least one name**. Admins see every report.

That's the whole rule. It lives in `lib/access.ts`, and every page and API route goes through it.

## Rules at a glance

| Situation | Who sees the report |
|---|---|
| The user's role is `admin` | always |
| The user and the report share a group name | yes |
| They share no group name | no. The report looks like it doesn't exist ("Report not found"), so its name doesn't leak. |
| The report has no groups | admins only |
| The report isn't in `report-config.ts` | admins only |

Group names must match **exactly**: `secops` and `SecOps` are different groups. Use lowercase.

## Where a report's groups come from

The sync works out each report's groups and saves them in MongoDB (`reports.allowedGroups`):

1. **The report isn't in `report-config.ts`:** no groups, so admins only.
2. **The report is in `report-config.ts` with `groups`:** exactly those groups.
3. **The report is in `report-config.ts` without `groups`:** the names of the email lists Splunk sends it to. `secops@acme.com, it-director@acme.com` becomes `secops, it-director`.

Option 3 means "whoever got the email can see the report", which is usually what people expect. Option 2 is safer: it's written down, and it keeps working after you turn off the email.

> **Before you turn off a report's email in Splunk**, write its groups into `report-config.ts`. The email list disappears from Splunk with the email action, and so would the groups in option 3. The report would become admin-only.

## Where a user's groups come from

Each signed-in user has a document in MongoDB's `user_access` collection:

```js
{ email: 'soc.analyst@example.com', role: 'viewer', groups: ['secops', 'soc-tier1'] }
```

- `role` is `admin` (sees everything) or `viewer` (sees reports that share a group).
- Today the only logins are the demo users in `lib/demo-users.ts`, created by `npm run seed`. Public sign-up is off.
- Later, company sign-in (SSO) will copy each person's groups from Okta or Entra ID into `user_access` at sign-in. The rule above stays the same.

## What's in `lib/report-config.ts`

Splunk knows a report's search, schedule and email list. It doesn't know which category the app should file it under, which teams may see it, or what counts as a warning. `report-config.ts` holds those extra settings, one entry per report:

```ts
export const reportConfig: Record<string, ReportConfig> = {
    'Failed Login Attempts by User': {        // ← the report's exact name in Splunk
        slug: 'failed-logins-by-user',         // ← its web address: /reports/failed-logins-by-user
        category: 'Security',
        tags: ['security', 'authentication', 'daily'],
        groups: ['secops', 'it-director'],     // ← who may see it
    },
};
```

| Setting | Required? | What it does |
|---|---|---|
| the key (`'Failed Login Attempts by User'`) | yes | The saved search name, **exactly** as in Splunk (same capitals, spaces and punctuation). If it doesn't match, the entry is ignored and the report stays admin-only. |
| `slug` | yes | The report's web address, `/reports/<slug>`. Lowercase words joined by `-`, unique. Don't change it later, or saved links break. |
| `category` | yes | One of `Security`, `Operations`, `Infrastructure`, `Business`, `Compliance`, `Other`. Used by the filters on the overview page. |
| `tags` | yes | Short labels for search, e.g. `['web', 'hourly']`. Can be `[]`. |
| `groups` | no | Who may see it (see above). Without it, the report's email list names. |
| `chart` | no | `{ y: 'count' }` picks which column to plot. `{ type: 'line' }` overrides the chart saved in Splunk (`bar`, `column`, `line`, `area`). `'none'` shows the table only. |
| `index` | no | Replaces the "Index" text the app works out from the SPL. |
| `statusRule` | no | A small function that turns results into a warning, e.g. "warn when any host is above 2% errors". |
| `highlights` | no | A small function that picks the headline numbers. The default is the result count, the top row and the search time. |

Adding an entry also **brings a report into the app**: a scheduled report that doesn't email anyone is synced only if it's listed here.

### Live reports use Splunk's column names

The dummy reports have friendly column names like `Error rate %`. Real reports use whatever fields the SPL returns, such as `host`, `count` or `error_rate`. In `chart.y`, `statusRule` and `highlights`, use the names exactly as they appear in the report's results table in the app. To show nicer names, rename them in the SPL (`| rename error_rate AS "Error rate %"`).

## Example: setting up three teams

Say your company has these scheduled reports and teams:

| Report in Splunk | Team(s) that should see it |
|---|---|
| `SOC - Failed Logins` | security team |
| `Prod 5xx Errors` | site reliability (SRE) team |
| `Payments Daily Summary` | finance team, and the IT director |

**1. Pick one group name per team.** Use the team's email list name when it has one, so the defaults line up: `security`, `sre`, `finance`, `it-director`.

**2. Give each report its groups** in `lib/report-config.ts`:

```ts
'SOC - Failed Logins': {
    slug: 'soc-failed-logins',
    category: 'Security',
    tags: ['security', 'daily'],
    groups: ['security'],
},
'Prod 5xx Errors': {
    slug: 'prod-5xx-errors',
    category: 'Operations',
    tags: ['web', 'hourly'],
    groups: ['sre'],
    chart: { y: 'error_rate' },
},
'Payments Daily Summary': {
    slug: 'payments-daily-summary',
    category: 'Business',
    tags: ['payments', 'daily'],
    groups: ['finance', 'it-director'],
},
```

**3. Run `npm run sync`** so MongoDB picks up the new groups.

**4. Give people the matching groups.** For now that's the demo users, in `mongosh splunkevents`:

```js
db.user_access.updateOne({ email: 'soc.analyst@example.com' }, { $set: { groups: ['security'] } })
db.user_access.updateOne({ email: 'sre.oncall@example.com' }, { $set: { groups: ['sre'] } })
db.user_access.updateOne({ email: 'finance.analyst@example.com' }, { $set: { groups: ['finance'] } })
db.user_access.updateOne({ email: 'it.director@example.com' }, { $set: { groups: ['it-director'] } })
```

(Or edit `lib/demo-users.ts` and run `npm run seed`. Note that `npm run seed` resets every demo user's groups to what that file says.)

**5. Check it.** Sign in as each user. The SOC analyst sees only `SOC - Failed Logins`, the IT director sees only `Payments Daily Summary`, and `admin@example.com` sees all three.

## When changes take effect

| You change | Then | It applies |
|---|---|---|
| `groups` (or any setting) in `report-config.ts` | run `npm run sync` | right after the sync |
| a user's groups or role in `user_access` | nothing | on their next page load |
| the email list in Splunk (for reports without `groups`) | wait for the next sync | right after the sync |

**Don't edit `reports.allowedGroups` in MongoDB by hand.** The next sync overwrites it from `report-config.ts`.

## Checking who sees what

In `mongosh splunkevents`:

```js
db.reports.find({ disabled: false }, { title: 1, allowedGroups: 1, _id: 0 })   // each report's groups ([] = admins only)
db.user_access.find({}, { email: 1, role: 1, groups: 1, _id: 0 })             // each user's groups
```

Or ask Claude Code: the read-only `mongodb` MCP server can run the same queries.

## Working on a work laptop

`report-config.ts` is committed to git, and the public repo (`trcpoet/splunk-report-ai`) is visible to anyone. Real report names, team names and rules are company information, so don't push them there. Keep them on the work laptop, or in a private repo your company approves. See [Connecting live Splunk](connecting-live-splunk.md).
