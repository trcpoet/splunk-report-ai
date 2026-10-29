# The connector with a real Splunk

This runs SplunkEvents against a real Splunk:
- **Splunk Enterprise's free trial,** in Docker;
- **dummy logs and six scheduled reports** in it;
- **the connector,** which is the sync worker in live mode. It copies each report's runs into MongoDB through Splunk's REST API, with the same calls it makes to a company's Splunk.

Use it to watch the live path work before you can reach your company's Splunk.

**Why not a public Splunk?** There isn't one to test against. Splunk Cloud trials can't use the REST API, and Splunk doesn't host a demo instance. Splunk Enterprise's trial has the same REST API as any Splunk Enterprise.

```
feeder (dummy logs, every minute) ──► Splunk Enterprise trial (Docker)
                                         │ six scheduled reports, every 5 minutes
                                         ▼
     connector (sync worker, live mode, read-only token from a service account)
                                         │ REST API: saved searches, history, jobs, results
                                         ▼
                                      MongoDB ──► web app on http://localhost:3000
```

## Run it

You need **an Intel/AMD (x86) machine** with Docker and about 6 GB of free memory. On an Apple Silicon Mac, see the next section.

1. **Accept Splunk's terms.** Starting Splunk means accepting [Splunk's General Terms](https://www.splunk.com/en_us/legal/splunk-general-terms.html). Read them, then say so in a `.env` file at the top of the repo:
   ```bash
   echo 'SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com' >> .env
   ```
2. **Start everything:**
   ```bash
   docker compose -f docker-compose.splunk.yml up --build
   ```
3. **Open http://localhost:3000** and pick a demo account (password `splunk-demo-2026`).
   - Splunk takes 2 or 3 minutes to start. Then the reports run every 5 minutes, and the connector copies their runs every 2 minutes.
   - So the reports appear about 10 minutes after you start, and they then update every 5 minutes.
4. **Optional: open Splunk Web** on http://localhost:8000, as user `admin` with password `splunk-example-2026`. The same six reports are under **Search & Reporting → Reports**.

**To stop:**
- `docker compose -f docker-compose.splunk.yml down` keeps the data.
- `down -v` deletes everything, the trial included.

**When the trial ends:** it lasts 60 days. Then Splunk moves to its Free license, which has no sign-in and so no tokens. Start again with `down -v` and `up`.

### On an Apple Silicon Mac

Splunk's image is x86 only. Under emulation it's slow, and parts of it fail. Instead:

- **GitHub Codespaces (easiest).**
  1. On the repo's page, open **Code → Codespaces → Create codespace**. The repo's `.devcontainer/` asks for a 4-core, 16 GB machine, and the free monthly hours cover about 30 hours of it.
  2. In the codespace's terminal, do steps 1 and 2 above.
  3. Open the forwarded port 3000. Sign-in works there, because the dev container sets `BETTER_AUTH_URL` to the codespace's address.
- **Install Splunk Enterprise on the Mac.** Splunk 10 supports Apple Silicon.
  1. Download the trial from splunk.com and install it.
  2. For this test Splunk only, turn off HTTPS on its management port: in `$SPLUNK_HOME/etc/system/local/server.conf`, under `[sslConfig]`, set `enableSplunkdSSL = false`. Then restart Splunk.
  3. Run the same scripts, using a separate database so your dummy reports stay as they are:
     ```bash
     export MONGODB_URI=mongodb://127.0.0.1:27017/splunkevents-live
     export SPLUNK_ADMIN_PASSWORD='your Splunk admin password'
     npm run seed           # the demo users, in the new database
     npm run splunk:setup   # indexes, reports, service account, token, logs
     npm run splunk:feed    # leave it running: a minute of logs every minute
     ```
     Then, in a second terminal with the same `MONGODB_URI`:
     ```bash
     SPLUNK_MODE=live SPLUNK_BASE_URL=http://localhost:8089 SPLUNK_TOKEN_FILE=.splunk-example/token npm run sync:watch
     ```
     And `npm run dev` in a third.
- **Watch it in CI.** The **Splunk example** workflow runs all of this on a fresh machine whenever the connector changes. Its log shows each step.

## What the setup creates

`scripts/splunk-example/setup.ts` sets Splunk up through its REST API, as an admin would for the app. That's the same list [connecting-live-splunk.md](connecting-live-splunk.md) tells you to ask your admins for.

| What | Here |
|---|---|
| Indexes | `wineventlog`, `linux_secure`, `web`, `firewall`, `os` |
| Six scheduled reports | In **Search & Reporting**, shared with everyone. Each is a dummy report's SPL (`lib/splunk/fixtures/reports.ts`), plus a last step that names the columns as `lib/report-config.ts` expects (`lib/splunk/example/searches.ts`). |
| Role `splunk_events_reader` | It imports `user`, so it reads what's shared with it, and nothing writes. |
| User `splunk-events-sync` | The service account. Nobody signs in as it. |
| A token for that user | It lasts 30 days. The setup writes it to a file, and the connector reads it with `SPLUNK_TOKEN_FILE`. It never sees the admin password. |
| Logs | The last 24 hours (`lib/splunk/example/events.ts`), then a minute at a time from the feeder. |

**Who sees which report** works as with a real Splunk: the reports' email recipients (`secops@example.com`, …) become the groups. No email is sent.

**What stands out on purpose**, so the app has something to show:
- **web-03** has more server errors than the 2% budget, so that report shows a warning.
- **db-02's `/data`** is 96% full.
- **db-03 and app-07** stopped sending, so the silent-hosts report lists them.
- **At half past each hour,** one IP tries 40 accounts a dozen times each. The first time, the briefing flags the failed-logins run as unusual.

The setup is safe to run again. It updates the reports and makes a new token, and it sends the old logs only once.

## Your MongoDB cluster instead

Set `MONGODB_URI` in `.env`, for example to Atlas, with **its own database name** such as `/splunkevents-live`. The live reports have the same names as the dummy ones, so they would replace the hosted demo's.

## From here to your company's Splunk

The connector and its REST calls stay the same. What changes:
- **`SPLUNK_BASE_URL`** becomes your search head on HTTPS, `https://…:8089`. If your company has its own certificate authority, add `NODE_EXTRA_CA_CERTS`.
- **The token** comes from your admins, for a service account, in `SPLUNK_TOKEN` or `SPLUNK_TOKEN_FILE`.
- **`lib/report-config.ts`** lists your reports by name. Status rules and charts use your searches' column names.
- **There's no setup script and no feeder:** your Splunk already has the logs and the reports.

[connecting-live-splunk.md](connecting-live-splunk.md) walks through it.

## If something goes wrong

Show what each part is doing:

```bash
docker compose -f docker-compose.splunk.yml logs -f splunk-setup connector
```

| What you see | Why |
|---|---|
| "Read Splunk's General Terms…" when you start | `SPLUNK_GENERAL_TERMS` isn't set (step 1). |
| No reports for 10 minutes or more | Check the log above. `splunk-setup` says when Splunk is up, and the connector says how many runs it copied. |
| `splunk-setup` exited with an error | Its log names the step and Splunk's message. Starting again is safe. |
| The connector gets 401 | The token or the trial expired. Use `down -v`, then `up`. |
| Splunk keeps restarting on a Mac | Apple Silicon: use a codespace (above). |

References: [docker-splunk](https://github.com/splunk/docker-splunk) (the image's settings), and Splunk's [REST API reference](https://help.splunk.com/en/splunk-enterprise/leverage-rest-apis/rest-api-reference/10.6/introduction/using-the-rest-api-reference).
