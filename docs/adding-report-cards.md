# Adding and changing report cards

Every Splunk report the app shows has a **card**: an entry in `config/report-cards.yaml` that says how the app shows that report. This page explains how to add a card, how to change one, and how to turn a dashboard's tiles into cards. It is written for people and for AI assistants.

No code changes are needed: you edit one data file, and the checks tell you what's wrong.

## The idea

| Who | Decides | Where |
|---|---|---|
| **Splunk** | What the report searches (its SPL), when it runs (its schedule), and its result columns | The scheduled report in Splunk |
| **The card** | Its category, icon and tags, who may see it, its chart, its headline numbers, and when it shows "Warning" or "Failed" | `config/report-cards.yaml`, under the report's exact Splunk name |
| **The app** | Everything else, with sensible defaults | `src/splunk/map.ts` |

- The app **never runs a search**. The sync copies the results of the runs Splunk already made (on the report's schedule) into MongoDB, and the pages read them from there.
- So a card can only use **columns the report's results have**. Your search's last step names them (`| rename error_rate AS "Error rate %"`).
- A card also **brings the report into the app**. A scheduled report with a card is synced even if it emails no one.

## Add a card, step by step

1. **Have a scheduled report in Splunk.** Share it (read) with the service account's role. If it doesn't exist yet, see [Move a dashboard's tiles](#move-a-dashboards-tiles) below.
2. **See its real column names:**
   ```bash
   npm run card:preview "Web Server 5xx Error Rate"
   ```
   It works before the card exists, and lists the newest run's columns. It only reads; it never starts a search.
3. **Write the card** in `config/report-cards.yaml`, under the report's exact Splunk name (same capitals, spaces and punctuation). Copy a similar card from the file, or paste a draft from `npm run splunk:tiles`.
4. **Preview it again.** You'll see what the card and the report page will show, and any column name the results don't have:
   ```text
   Web Server 5xx Error Rate  (/reports/web-5xx-error-rate)
     Card: config/report-cards.yaml
     Every hour, last 60 minutes
     Icon: server-crash (guessed from "5xx" in the title; add icon: to the card to choose another)

   Newest run: Oct 2, 09:00 UTC, 6 results
   Columns: Host, Requests, 5xx errors, Error rate %
   Status: Warning: web-prod-03 is returning 4.8% server errors, above the 2% threshold. The other hosts are within budget.

   Headline numbers (the first is on the card):
     Overall error rate: 1.21%  (Budget: 2%)  [meter 60%]
     Requests (1h): 296,450
     Worst host: web-prod-03  (4.80% errors)

   Chart: column of Error rate % by Host, with a line at the 2% error budget
   ...
   ✓ Every column the card names is in the results.
   ```
5. **Check, then sync:**
   ```bash
   npm run check     # the type check, lint and tests, including the cards file
   npm run sync      # the card shows on the next sync
   ```
   A running `npm run sync:watch` picks up the change at its next sync, without a restart.
6. **Describe the report** in your copy of [report-catalog.md](report-catalog.md): the question it answers, its search, its columns and its warning rule. `npm test` fails until every card has a section there.

## Move a dashboard's tiles

A dashboard tile isn't a report. It runs its search when someone opens the dashboard, so there is nothing for the app to copy. Each tile becomes a scheduled report first, then gets a card.

**1. Make a worksheet from the dashboard:**

```bash
npm run --silent splunk:tiles "Security overview" > tiles.md
```

Use the dashboard's title, or its name from its address in Splunk (`…/app/search/security_overview`). It reads both kinds of dashboard (Dashboard Studio and classic Simple XML) with the sync's token, and writes nothing to Splunk. For each tile, the worksheet gives:
- its **whole search**: a search chained to a base search is written out in full;
- its time range, units, decimals and color ranges;
- a warning when the search uses **dashboard inputs** (`$time_tok$`), which a scheduled report doesn't have;
- the **icon** the app will pick from its title;
- a **draft card**.

**2. Turn each tile into a scheduled report** (a Splunk admin, or you if you may). Skip this for a tile that already shows a saved report: the worksheet says "Already a report".
1. In Splunk's Search page, paste the tile's search. Replace any `$input$` with a fixed value, and set the tile's time range.
2. Check the columns it returns. Rename them to readable names in the last step: `| rename count AS Failures`.
3. **Save As → Report**, then **Edit Schedule** (for example every hour, `0 * * * *`).
4. **Edit Permissions:** share it (read) with the service account's role.

**3. Paste the draft card** into `config/report-cards.yaml`, under the report's name, and fix what the draft can't know:
- the column names (the draft guesses them from the search's last step: check them with `npm run card:preview`);
- `category`, `tags` and `groups`;
- `icon`, only if the worksheet's **Icon** line (the icon the app will pick from the title) doesn't fit (see [The icon](#the-icon));
- whether high or low is bad (the draft guesses from the tile's colors: a red first range means low is bad).

**4. Follow steps 4 to 6 above:** preview, check, sync, and describe it in the catalog.

### How each kind of tile becomes a card

| Tile in Splunk | Card |
|---|---|
| **Single value** (one big number) | `chart: none`, and one headline number with `value: { first: <column> }`. Its unit and decimals go in `format`. |
| Single value **with color ranges** | Add `warn` for the middle range and `fail` for the worst one, with the range's limit: `above` when high is bad, `below` when low is bad. |
| **Line, column, bar or area chart** | `chart: { type: line }` (or `column`, `bar`, `area`). `y` picks the column to plot. A `timechart` draws a line per series by itself. |
| **Table** | `chart: none`, or a chart when one column of numbers is worth seeing at a glance. |
| **Pie, map, scatter, events or a custom visualization** | No exact match. The app shows the same numbers as columns, or as a table with `chart: none`. |

**Example: a single value with color ranges.** A tile shows `index=auth action=failure | stats count AS Failures`, green below 100, yellow to 500 and red above. Its draft card:

```yaml
Failed sign-ins (24h):
  slug: failed-sign-ins-24h
  category: Other            # change: Security
  tags: []
  chart: none
  highlights:
    - label: Failed sign-ins (24h)
      value:
        first: Failures
  fail:
    when:
      column: Failures
      above: 500
    one: Failed sign-ins (24h) is {Failures}, above 500.
  warn:
    when:
      column: Failures
      above: 100
    one: Failed sign-ins (24h) is {Failures}, above 100.
```

When low is bad (red first, such as free disk space), the draft uses `below` instead.

## What a card can say

Every field is described in `config/report-cards.schema.json` too, which editors such as VS Code use to check the file and suggest fields as you type (the `# yaml-language-server` line at the top of the file turns it on). Unknown fields are refused, so a typo can't be silently ignored.

### The basics

```yaml
Web Server 5xx Error Rate:       # the report's exact name in Splunk
  slug: web-5xx-error-rate       # its address: /reports/web-5xx-error-rate
  category: Operations
  icon: server-crash             # its icon (optional: the app picks one without it)
  tags: [web, availability, hourly]
  groups: [sre, it-director]     # who may see it (optional)
  index: web (access logs)       # the "Index" text on its page (optional)
```

| Field | Required | What it does |
|---|---|---|
| the name | yes | The saved search's name, **exactly** as in Splunk. A name that doesn't match is a card for nothing (`npm run splunk:check` lists them). |
| `slug` | yes | The report's address, `/reports/<slug>`: lowercase words joined by `-`, unique. Don't change it later: links break, and the old address keeps the old runs. |
| `category` | yes | `Security`, `Operations`, `Infrastructure`, `Business`, `Compliance` or `Other`. The home page's filters use it. |
| `icon` | no | The small picture beside the category on its card and page. One of the names in [The icon](#the-icon). Without it, the app picks one. |
| `tags` | no | Words for search and "similar reports", such as `[web, hourly]`. They also help the app pick an icon. |
| `groups` | no | Who may see it. Without it, the email lists Splunk sends it to (`secops@example.com` is the group `secops`). **Copy them here before turning off a report's email in Splunk**, or it becomes admin-only. See [report-access.md](report-access.md). |
| `index` | no | Replaces the "Index" text the app works out from the search, for searches like `| rest` or `| metadata`. |

### The icon

Every report shows a small icon beside its category, on its card and its page, so it's easy to spot in a long list. **You usually don't need to set one.** Without `icon:`, the app picks one from words in the report's **title**, then its **tags**, then its **description**, and otherwise uses its category's icon. `npm run card:preview` shows which one it picked and why:

```text
  Icon: key-round (guessed from "login" in the title; add icon: to the card to choose another)
```

Set `icon:` when the guess doesn't fit. Use one of these names. They're [Lucide](https://lucide.dev/icons) icons, so you can look any of them up there:

| For | Names |
|---|---|
| Security | `shield`, `shield-alert`, `shield-check` (certificates), `key-round` (sign-ins), `user-lock` (lockouts), `user-cog` (privileges), `brick-wall-fire` (firewall), `globe-lock` (VPN), `radar` (scans), `bug`, `mail-warning` (phishing), `file-lock` (data loss), `scan-search` |
| Operations | `activity`, `server-crash` (errors), `globe` (web), `timer` (latency), `gauge` (usage), `route` (APIs), `workflow` (jobs), `siren` (incidents), `container`, `clock-alert`, `heart-pulse`, `webhook` |
| Infrastructure | `server`, `hard-drive`, `cpu`, `memory-stick`, `radio-tower` (forwarders), `database`, `database-zap` (license, ingest), `network`, `cloud`, `cloud-alert`, `wifi-off`, `plug-zap`, `layers` |
| Business | `trending-up`, `credit-card` (payments), `banknote`, `receipt-text`, `shopping-cart`, `users-round`, `chart-line`, `landmark` |
| Compliance | `clipboard-check` (audits), `scale` (regulation), `scroll-text` |
| Anything | `earth` (countries), `map-pin`, `mail`, `file-text`, `file-chart-column-increasing` |

A name that isn't in the list stops the check and the sync, with the list in the message. The category icons, used when no word matches, are `shield` (Security), `activity` (Operations), `server` (Infrastructure), `trending-up` (Business), `clipboard-check` (Compliance) and `file-chart-column-increasing` (Other).

The words the app looks for are in `src/reports/icons.ts`. To offer an icon that isn't in the list, a developer adds its name there and in `src/reports/components/ReportIcon.tsx`.

### The chart

```yaml
  chart:
    type: column                       # bar, column, line or area; default: the chart saved in Splunk
    y: Error rate %                    # the column to plot; default: the first column of numbers
    threshold: { value: 2, label: 2% error budget }   # a dashed limit line
```

| Option | What it does |
|---|---|
| `chart: none` | Only the results table. |
| `type` | Overrides the chart saved with the report in Splunk. |
| `y` | The column to plot. Results over time (`_time` first) with several measures draw a line for each instead; `y` keeps one. |
| `threshold` | A dashed line at a limit, such as an error budget. Bars past it take the warning color. **Use the same number as the `warn` rule** (a test checks this). |
| `max` | The most a value can be (100 for a percentage): the bars become meters. |
| `panels` | One small chart per column, for measures with different units: `panels: [{ y: Transactions }, { y: p95 latency (ms), threshold: { value: 400, label: 400 ms SLO } }]`. |
| `scatter` | A second chart, a dot per row: the chart's column up, `x` across. `{ x: Distinct sources, log: true, caption: "How to read it" }`. |

### Headline numbers

The report page shows every headline number; the card on the home page shows the first. Without `highlights`, they are the result count (with its change since the previous run), the top row and the search time.

```yaml
  highlights:
    - label: Overall error rate
      value: { ratio: [sum: 5xx errors, sum: Requests] }
      format: { percent: true, decimals: 2 }
      note: "Budget: 2%"
      meter: { of: 2 }
    - label: Worst host
      value: { top: Host, by: Error rate % }
      note: "{Error rate %|2}% errors"
```

**`value`, the number to show:**

| Value | Shows |
|---|---|
| `{ first: <column> }` | The value in the first row, as a single-value tile does. Text works too. |
| `{ sum: <column> }`, `{ max: … }`, `{ min: … }`, `{ average: … }` | The total, largest, smallest or average of a column. |
| `{ count: results }` | How many results the run had. |
| `{ ratio: [<a>, <b>] }` | `a` divided by `b`. Each can be a value above or a plain number: `[sum: GB ingested, 500]`. 0 when `b` is 0. |
| `{ top: <column>, by: <column> }` | The row with the largest `by`, shown by its `top` column (a name, such as the worst host). Its `note` can use that row's columns. |

**`format`** (optional): `decimals: 2` keeps two digits after the point (without it, numbers get thousands separators); `percent: true` multiplies by 100 and adds `%` (for a ratio); `suffix: " GB"` adds a unit.

**`note`** (optional): a short line under the number, such as `"Budget: 2%"`.

**`meter`** (optional): `{ of: 2 }` draws a meter under the number, filled by how much of that limit it uses. With `percent`, the limit is in percent too.

### Warning and Failed

```yaml
  warn:
    when: { column: Error rate %, above: 2 }
    one: "{Host} is returning {Error rate %}% server errors, above the 2% threshold."
    many: "{count} hosts are above the 2% error budget: {list}."
    item: "{Host} ({Error rate %}%)"
```

A report shows **Failed** when its search failed in Splunk, or when its `fail` rule matches. Otherwise it shows **Warning** when its `warn` rule matches, or when Splunk itself warned. `fail` is checked first.

**`when`, which rows match:**

| Condition | Matches |
|---|---|
| `{ column: <column>, above: 2 }` | Rows where the column is more than 2. Also `below`, `atLeast` (2 or more) and `atMost` (2 or less). |
| `{ column: <column>, equals: down }` | Rows where the column is exactly that text or number. |
| `{ results: { above: 0 } }` | The run had more than that many results. For searches where every result is a problem, such as silent forwarders. |

**The message:**
- `one`: the message when one row matches. Required.
- `many`: the message when several match. Default: `one`.
- `item`: how each row reads in `{list}`.
- `row: { top: <column> }`: which row fills the placeholders. Default: the first that matches. `{ top: Minutes silent }` names the one silent longest.

### Placeholders in messages and notes

| Placeholder | Becomes |
|---|---|
| `{Host}` | That column's value in the row. |
| `{Requests\|number}` | The number with thousands separators: `48,210`. |
| `{Error rate %\|2}` | The number with 2 decimals: `4.80`. Any digit 0 to 9 works. |
| `{Minutes silent\|hours}` | Minutes as hours: `3 hours`. |
| `{count}` | How many rows matched. `{count\|number}` adds separators. |
| `{list}` | Every matching row, each written as `item`, joined with commas. |

### When the building blocks aren't enough

A card can name a rule written in TypeScript: add it to `src/reports/cards/custom.ts` under a name, and set `custom: <name>` on the card. The card's own `warn`, `fail` and `highlights` still win. This is a code change, so it needs a review; ask first whether a simpler card would do.

## Writing YAML safely

- **Put every message and note in double quotes:** `one: "{Host} is down."`. A value that starts with `{` is read as something else without them.
- **Quote a report name or column that contains `: ` or ` #`**: `"Firewall Denied Connections: Top Sources":`.
- **Indent with spaces**, two per level, as the rest of the file does. Never tabs.
- **Keep limits equal:** a chart's `threshold` and the `warn` rule on the same column use the same number. Add a `# comment` saying so, as the file does.

## When something is wrong

The cards file is checked every time it's read: by `npm run check`, `npm run sync`, `npm run card:preview` and `npm run splunk:check`. Every problem is listed at once, with where it is:

```text
config/report-cards.yaml needs fixing:
  - Web Server 5xx Error Rate → chart: Unrecognized key: "threshhold"
  - Disk Space Utilization Above 85% → warn → when: Use a column with one of above, below, atLeast or atMost (a number) or equals, or results: { above: <number> }.
```

The sync stops before changing any report, and admins see the same message on the home page.

| What you see | What to do |
|---|---|
| `Unrecognized key: "…"` | A misspelled field. The schema lists the right ones. |
| `It isn't valid YAML: … at line 6, column 17.` | Usually a message that needs double quotes, or a name with `: ` in it. Look at that line. |
| `"…" already uses the slug "…"` | Two cards share a slug. Each needs its own. |
| `icon: "…" isn't one of the app's icons.` | Use a name from the list in the message (or [The icon](#the-icon)), or delete the line to let the app choose. |
| `✗ The card names "Error rate%", which the results don't have.` (`card:preview`) | A column name that's spelled differently in the results. Copy it from the `Columns:` line. |
| `cards in config/report-cards.yaml are for reports this token can't see` (`splunk:check`) | The name doesn't match Splunk's exactly, or the report isn't shared with the service account's role. |
| `No finished run with results yet` (`card:preview`) | Splunk hasn't run the report since it was scheduled. Wait for its next run. |

## How fresh a card is

A card shows the newest run the app has copied. Three schedules decide how fresh that is: when Splunk runs the report, how often the app copies new runs, and how often an open page refreshes. Hourly reports with an hourly sync are a good start. The settings, and the rule for choosing them: [configuration.md](configuration.md#how-often-reports-update).

## Rules for AI assistants

When you're asked to add, change or move report cards:

1. **Edit only `config/report-cards.yaml`**, and the company copy of `docs/report-catalog.md`. Adding a card needs no code change. Don't write a `custom:` rule unless a person asks for one.
2. **Use only column names you have seen** in `npm run card:preview` output or in the report's search. Never guess one. If you can't run the preview, say which columns you assumed.
3. **Key each card by the report's exact Splunk name**, and give it a new, unique `slug`. Never change an existing slug.
4. **Keep a chart's `threshold` and its `warn` limit equal** when they watch the same column.
5. **Leave `icon` out unless the preview's guess is wrong.** Then pick a name from [The icon](#the-icon), never one from elsewhere: only those are drawn.
6. **Write messages for the people reading the report:** one or two plain sentences that name the row (`{Host}`) and the limit.
7. **Check your work:** run `npm run card:preview "<name>"` for each card you touched, then `npm run check`. Show the output, and fix every `✗` before you finish.
8. **Never add secrets or company data to the public repo:** no tokens, no company Splunk addresses, no real hostnames or results. Real report names and cards belong in the company's copy of this repo only.
9. **Don't change Splunk.** Saving tiles as reports and sharing them is for a Splunk admin; write down what they need to do instead.

## Keep company cards out of the public repo

`config/report-cards.yaml` is committed. In the public repo it holds only the dummy reports. A company's copy holds its real report names, groups and limits, which are company information: keep that copy on the work laptop, or in a private repo the company approves ([connecting-live-splunk.md](connecting-live-splunk.md#before-you-start-keep-company-data-out-of-the-public-repo)).

**In a company's copy, add the company's cards below the dummy ones, and keep those.** The dummy-data mode and the tests use them. `npm run splunk:check` lists them as cards for reports the token can't see, which is expected.

The cards file can also live outside the repo: `REPORT_CARDS_FILE` points the sync at another path, such as a file mounted into the worker's container.
