# Report catalog

What each report shows, where its numbers come from, and how to add your own. Start here on a new laptop, before reading any code.

Keep this page in step with `lib/report-config.ts`: `lib/report-catalog.test.ts` fails when a report there has no section here. This repository is public, so it lists only the dummy reports. In your company's copy, add your company's reports to that copy's catalog, never here.

## Where the data comes from

**Splunk's own scheduled reports, not queries of our own.** The sync reads the saved searches Splunk already runs on a schedule, and the results of their runs, then copies them into MongoDB. The app shows what's in MongoDB.
- It never starts a search, so it adds no load to Splunk.
- The token only needs to read the reports shared with it, not whole indexes.
- The numbers are the ones people used to get by email.

The SPL below is what Splunk runs. In fixture mode (dummy data) the same reports come from `lib/splunk/fixtures/reports.ts`. The Splunk example (`docs/splunk-example.md`) creates seven of them as real scheduled searches, which run every 5 minutes there.

## How a report gets its look

Four layers, each filling in what the one before leaves open:

| Layer | Decides | Where |
|---|---|---|
| 1. The search (SPL) | The columns: the data points. `rename` steps set their names. | Splunk |
| 2. The chart saved with the search | Bar, column or line. A statistics table means no chart. | Splunk (the report's Visualization tab) |
| 3. Report settings | Category and tags, who may see it, which column to plot, a limit line, the rule that turns results into a warning, and the headline numbers. | `lib/report-config.ts`, under the search's exact name |
| 4. Worked out automatically | Anything not set: the first column labels the rows, the first number column is the measure, `_time` first means lines over time. The headline numbers are the result count (with its change since the previous run), the top row, and the search time. | `lib/splunk/map.ts` |

**On screen:**
- **The report card** on the home page shows the first headline number, such as "Overall error rate 1.21%, Budget: 2%".
- **The report page** shows every headline number, the chart, the results table, the SPL and the run history.
- **The status** (Healthy, Warning, Failed) comes from the run: a failed search fails; a status rule can warn; otherwise Splunk's own warnings warn.

## The reports at a glance

| Report | The question it answers | Chart | Warns when | Schedule |
|---|---|---|---|---|
| [Failed Login Attempts by User](#failed-login-attempts-by-user) | Which accounts are being guessed at? | Bars, plus a scatter | Never (Splunk's warnings only) | Daily, 06:00 UTC |
| [Web Server 5xx Error Rate](#web-server-5xx-error-rate) | Is any web server failing requests? | Columns, 2% line | A host is above 2% errors | Every hour |
| [Firewall Denied Connections: Top Sources](#firewall-denied-connections-top-sources) | Who is knocking on the firewall? | Bars, plus a scatter | Never | Every 4 hours |
| [License Usage by Index](#license-usage-by-index) | Are we close to the 500 GB/day license? | Bars | Never (a meter shows the share) | Daily, 00:30 UTC |
| [Daily Payment Volume & Latency](#daily-payment-volume--latency) | How did payments do, by region? | Four small bar charts, 400 ms line | Never | Daily, 07:00 UTC |
| [Disk Space Utilization Above 85%](#disk-space-utilization-above-85) | Is a disk about to fill up? | Bars as meters, 95% line | A mount is above 95% | Every 30 minutes |
| [Privileged Group Membership Changes](#privileged-group-membership-changes) | Who changed admin group membership? | None (a table) | Never | Daily, 05:00 UTC |
| [VPN Sessions by Country](#vpn-sessions-by-country) | Where are remote logins coming from? | Bars | Never | Weekly, Mondays 08:00 UTC |
| [Forwarder Health: Silent Hosts](#forwarder-health-silent-hosts) | Has any host stopped sending logs? | Bars | Any host is silent | Every hour at :15 |
| [Web Requests by Host](#web-requests-by-host) | Is any web server falling behind the others? | A line per host | Never | Every hour at :05 |

**Who sees a report:** admins see every report. Everyone else sees a report when one of their groups matches the report's groups. Unless `lib/report-config.ts` sets `groups`, those are the email lists it was sent to: `secops@example.com` means the `secops` group. See [report-access.md](report-access.md).

## Each report

### Failed Login Attempts by User

- **Slug:** `failed-logins-by-user`. **Category:** Security.
- **The question:** which accounts had 10 or more failed logins in the last 24 hours, on Windows and Linux? Many failures from one source suggests password guessing; failures from many sources suggests password spraying.
- **Schedule:** daily at 06:00 UTC, over the last 24 hours.
- **Seen by:** `secops`, `soc-tier1`, `it-director`.
- **Search:**
  ```spl
  (index=wineventlog EventCode=4625) OR (index=linux_secure "Failed password")
  | eval user=coalesce(TargetUserName, user)
  | stats count AS failures, dc(src_ip) AS sources, latest(_time) AS last_attempt BY user
  | where failures >= 10
  | sort - failures
  | convert ctime(last_attempt)
  ```
- **Columns:** User, Failures, Distinct sources, Last attempt (UTC).
- **Chart:** bars of Failures by User, as saved in Splunk. Then a scatter: a dot per account, Failures going up and Distinct sources going across.
- **Headline numbers:** Results (accounts over the threshold, with the change since the previous run), the top user by Failures, and the search time. The card shows Results.
- **Warns:** only when Splunk itself warns about the run.

### Web Server 5xx Error Rate

- **Slug:** `web-5xx-error-rate`. **Category:** Operations.
- **The question:** what share of each production web server's requests failed with a server error (5xx) in the last hour?
- **Schedule:** every hour, over the last 60 minutes.
- **Seen by:** `web-oncall`, `sre`, `eng-managers`.
- **Search:**
  ```spl
  index=web sourcetype=access_combined
  | eval is_error=if(status>=500, 1, 0)
  | stats count AS requests, sum(is_error) AS errors BY host
  | eval error_rate=round(errors / requests * 100, 2)
  | sort - error_rate
  ```
- **Columns:** Host, Requests, 5xx errors, Error rate %.
- **Chart:** columns of Error rate % by Host, with a dashed line at the **2% error budget**. Columns above it take the warning color.
- **Headline numbers:** the overall error rate (all hosts together) with a meter against the 2% budget, the requests in the hour, and the worst host. The card shows the overall error rate.
- **Warns:** when any host is above 2%, naming it, or listing them all. The chart's line and the warning use the same number (`ERROR_BUDGET_PCT`).

### Firewall Denied Connections: Top Sources

- **Slug:** `firewall-denied-top-sources`. **Category:** Security.
- **The question:** which 25 source IPs had the most connections denied at the perimeter firewall, and how many ports and zones did each one try?
- **Schedule:** every 4 hours, over the last 4 hours.
- **Seen by:** `netsec`, `soc-tier1`.
- **Search:**
  ```spl
  index=firewall sourcetype=pan:traffic action=denied
  | stats count AS denied, dc(dest_port) AS ports, values(dest_zone) AS zones BY src_ip
  | sort - denied
  | head 25
  ```
- **Columns:** Source IP, Denied, Distinct ports, Zones.
- **Chart:** bars of Denied by Source IP. Then a scatter: Denied going up, Distinct ports going across on a log scale. Far right suggests a port scan; far left, one port hit again and again, suggests a flood.
- **Headline numbers:** Results, the top source IP by Denied, and the search time. The card shows Results.
- **Warns:** only when Splunk itself warns about the run.

### License Usage by Index

- **Slug:** `license-usage-by-index`. **Category:** Infrastructure. Not in the Splunk example.
- **The question:** how much did each index take in yesterday, against the 500 GB/day license?
- **Schedule:** daily at 00:30 UTC, over yesterday.
- **Seen by:** `splunk-admins`, `it-finance`.
- **Search:**
  ```spl
  index=_internal source=*license_usage.log* type=Usage
  | eval GB=b/1024/1024/1024
  | stats sum(GB) AS GB BY idx
  | eval GB=round(GB, 2), pct_of_quota=round(GB / 500 * 100, 1)
  | sort - GB
  ```
- **Columns:** Index, GB ingested, % of quota.
- **Chart:** bars of GB ingested by Index.
- **Headline numbers:** the total ingested, the share of the **500 GB/day license** used (with a meter), and the largest index. The card shows the total.
- **Warns:** only when Splunk itself warns. The meter shows how close the total is to the license.

### Daily Payment Volume & Latency

- **Slug:** `payments-volume-latency`. **Category:** Business. Not in the Splunk example.
- **The question:** for the charge API yesterday, by region: how many transactions, what dollar volume, how slow at the 95th percentile, and how many declined?
- **Schedule:** daily at 07:00 UTC, over yesterday.
- **Seen by:** `payments-eng`, `finance-ops`, `cfo-office`, `product-leads`.
- **Search:**
  ```spl
  index=app sourcetype=payments:api endpoint="/v2/charge"
  | eval declined=if(status="declined", 1, 0)
  | stats count AS transactions, sum(amount) AS volume, perc95(latency_ms) AS p95_ms, avg(declined) AS decline_rate BY region
  | eval volume="$".tostring(round(volume, 0), "commas"), decline_rate=round(decline_rate * 100, 2)."%"
  ```
- **Columns:** Region, Transactions, Volume, p95 latency (ms), Decline rate. Volume and Decline rate arrive as text ("$18,402,117", "1.84%"); the app reads them as numbers.
- **Chart:** four small bar charts, one per measure, with the regions in the same order in each, because the measures have different units. The latency chart has a dashed line at the **400 ms SLO**.
- **Headline numbers:** Results, the top region by Transactions, and the search time. The card shows Results.
- **Warns:** only when Splunk itself warns.

### Disk Space Utilization Above 85%

- **Slug:** `disk-space-over-85`. **Category:** Infrastructure.
- **The question:** which hosts and mount points are more than 85% full?
- **Schedule:** every 30 minutes, over the last 30 minutes.
- **Seen by:** `infra-oncall`, `dba-team`.
- **Search:**
  ```spl
  index=os sourcetype=df
  | stats latest(UsePct) AS used_pct, latest(Avail) AS avail BY host, MountedOn
  | where used_pct > 85
  | sort - used_pct
  ```
- **Columns:** Host, Mount, Used %, Available.
- **Chart:** bars of Used % by Host that fill a track up to 100%, like meters, with a dashed line at **95% critical**.
- **Headline numbers:** Results (mounts over 85%), the top host by Used %, and the search time. The card shows Results.
- **Warns:** when any mount is above 95%, naming each one. The line and the warning use the same number (`DISK_CRITICAL_PCT`).

### Privileged Group Membership Changes

- **Slug:** `privileged-group-changes`. **Category:** Compliance.
- **The question:** who added or removed members of Domain Admins, Enterprise Admins and the other privileged groups in the last 24 hours? Kept for access reviews.
- **Schedule:** daily at 05:00 UTC, over the last 24 hours.
- **Seen by:** `iam-governance`, `internal-audit`, `secops`.
- **Search:**
  ```spl
  index=wineventlog EventCode IN (4728, 4732, 4756, 4729, 4733, 4757)
  | eval action=if(EventCode=4728 OR EventCode=4732 OR EventCode=4756, "added", "removed")
  | table _time, SubjectUserName, MemberName, TargetUserName, action
  | rename SubjectUserName AS changed_by, MemberName AS member, TargetUserName AS group
  ```
- **Columns:** Time (UTC), Changed by, Member, Group, Action.
- **Chart:** none. The search is saved as a statistics table, and every change matters, so the table is the report.
- **Headline numbers:** Results (changes) and the search time. The card shows Results.
- **Warns:** only when Splunk itself warns.

### VPN Sessions by Country

- **Slug:** `vpn-sessions-by-country`. **Category:** Security. Not in the Splunk example.
- **The question:** how many remote-access VPN sessions, and how many different users, came from each country last week? It helps spot impossible travel and logins from unexpected places.
- **Schedule:** weekly on Mondays at 08:00 UTC, over the last 7 days.
- **Seen by:** `netsec`, `it-director`, `hr-mobility`.
- **Search:**
  ```spl
  index=vpn sourcetype=cisco:asa "SVC connection established"
  | iplocation src_ip
  | stats count AS sessions, dc(user) AS users BY Country
  | sort - sessions
  ```
- **Columns:** Country, Sessions, Unique users.
- **Chart:** bars of Sessions by Country.
- **Headline numbers:** Results, the top country by Sessions, and the search time. The card shows Results.
- **Warns:** only when Splunk itself warns.

### Forwarder Health: Silent Hosts

- **Slug:** `forwarder-health-missing-hosts`. **Category:** Infrastructure.
- **The question:** which hosts' forwarders haven't sent anything for more than 60 minutes? A silent host is one nobody can see into.
- **Schedule:** every hour at :15, over the last 24 hours.
- **Seen by:** `splunk-admins`, `infra-oncall`.
- **Search:**
  ```spl
  | metadata type=hosts index=*
  | eval minutes_silent=round((now() - lastTime) / 60, 0)
  | where minutes_silent > 60
  | convert ctime(lastTime) AS last_seen
  | table host, last_seen, minutes_silent
  | sort - minutes_silent
  ```
- **Columns:** Host, Last seen (UTC), Minutes silent.
- **Chart:** bars of Minutes silent by Host.
- **Headline numbers:** Results (silent hosts), the top host by Minutes silent, and the search time. The card shows Results.
- **Warns:** whenever there's a result, naming the host that has been silent longest.

### Web Requests by Host

- **Slug:** `web-requests-by-host`. **Category:** Operations.
- **The question:** how many requests did each production web server take, per 15 minutes, over the last 4 hours? A server that falls away from the others is worth a look.
- **Schedule:** every hour at :05, over the last 4 hours.
- **Seen by:** `web-oncall`, `sre`.
- **Search:**
  ```spl
  index=web sourcetype=access_combined
  | timechart span=15m count BY host
  ```
- **Columns:** `_time` (shown as Time), then one column per host. A `timechart` names its own columns, so they're whatever hosts it finds.
- **Chart:** a line per host over time, in the chart colors' fixed order. With more hosts than colors, the largest four get a line each and the rest add up to one "Other" line.
- **Headline numbers:** Results and the search time. A time series has no "top row". The card shows Results.
- **Warns:** only when Splunk itself warns.

## What the ML job reads

The ML job (`ml/`, [ml.md](ml.md)) has no SPL of its own and never reads result rows. For each run it reads three numbers from MongoDB: the run's **status**, its **result count** and its **search time**. Those are the numbers behind the default headline numbers ("Results", "Search time"), the run history dots and the home page's run health, so the job and the pages agree on what a run looked like.

## Adding your company's report

1. **In Splunk:** the report must be a scheduled saved search, shared (read) with the service account's role. It must email its results, or be listed in `lib/report-config.ts`. With `SYNC_REPORTS=configured`, only listed reports come in.
2. **Check the connection:** `npm run splunk:check`. It says whether the token can see the report, and whether the sync takes it.
3. **Add its settings** to `lib/report-config.ts`, under the report's exact Splunk name: `slug`, `category` and `tags`, and optionally `groups`, `chart`, `statusRule` and `highlights`. Rules look columns up by name, so use the names the search's last step gives them.
   - **Before turning off the report's email in Splunk, copy its groups into `groups`.** The default groups come from the email list, and disappear with it.
4. **Add it to this catalog**, in your company's copy: the question, the search, the columns, the chart, the headline numbers and the warning rule with its limit. `npm test` fails until you do.
5. **Check and look:** `npm run check`, then `npm run sync`, and open the report.
