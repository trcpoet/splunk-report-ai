# Running SplunkEvents with Docker

One command starts the whole app with its dummy data, so anyone can try it without installing Node.js, MongoDB or Python, and without a `.env.local` file.

## Start it

You need Docker Desktop (Mac or Windows) or Docker Engine with the Compose plugin (Linux).

```bash
docker compose up --build
```

The first build takes a few minutes. When the log says the app is ready, open [http://localhost:3000](http://localhost:3000) and pick a demo account on the sign-in page. Their password is `splunk-demo-2026`.

- **Stop it:** Ctrl+C, or `docker compose down` if it runs in the background (`docker compose up -d`).
- **Start again:** `docker compose up`. The data is kept in a Docker volume.
- **Start over with fresh data:** `docker compose down -v`, then `docker compose up`.

## What runs

| Service | What it does |
|---|---|
| `mongo` | MongoDB 7.0. Its data lives in the `mongo-data` volume, and it isn't exposed outside Docker. It's 7.0 rather than 8.0 because MongoDB 8.0 won't start on Linux kernels 6.19 to 7.0.13 ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)), which some Docker setups use. |
| `setup` | Runs once and exits: creates the demo users (`npm run seed`) and loads the dummy reports (`npm run sync`). Running it again changes nothing. |
| `app` | The web app on port 3000. It's Next.js's standalone production server, built from the `Dockerfile`. |
| `ml` | Optional: the Python ML job ([ml.md](ml.md)). It runs only when you ask for it (below). |

The `Dockerfile` has two images:
- `app`: only the built server, about 55 MB of app files.
- `tools`: the whole repo with its packages, for the seed script and the sync worker.

`ml/Dockerfile` holds the ML job's Python packages.

## Settings

Everything has a default. To change something, create a file called `.env` next to `docker-compose.yml`. Git ignores it.

```bash
# Ask AI: a Gemini key turns it on (docs/ai.md). Or AI_PROVIDER=fake for canned answers.
GEMINI_API_KEY=
AI_PROVIDER=
# Another port, if 3000 is taken. Then also set BETTER_AUTH_URL to match.
PORT=3000
BETTER_AUTH_URL=http://localhost:3000
# Your own secrets, before anyone else can reach the app (openssl rand -base64 32).
BETTER_AUTH_SECRET=
REVALIDATE_SECRET=
# The demo users' password, and whether the sign-in page lists them.
DEMO_PASSWORD=splunk-demo-2026
DEMO_MODE=true
```

Two things to know:
- **Rebuild after changing `DEMO_MODE` or `DEMO_PASSWORD`:** `docker compose up --build`. The sign-in page is built with them, and a page built with one value but served with another breaks in the browser.
- **Sign-in works only at `BETTER_AUTH_URL`.** Open the app at exactly that address. `http://127.0.0.1:3000` isn't the same as `http://localhost:3000`.

## The ML job

```bash
docker compose --profile ml run --rm ml                         # score the runs
docker compose --profile ml run --rm ml python ml/score.py --plot  # also draw ml/out/anomaly-scores.png
```

It needs the app running, and tells it to show the new scores.

## Sharing it with your team

- **On your own machine:** the defaults are fine. The app is only on `localhost`.
- **On a shared server:**
  - Set your own `BETTER_AUTH_SECRET` and `REVALIDATE_SECRET`.
  - Set `BETTER_AUTH_URL` to the address people use, and put HTTPS in front of it.
  - Keep `DEMO_MODE=true` only while the data is dummy data.
- **With real Splunk:** don't change this setup. Real data, the service-account token and an approved AI provider belong in your work copy of the repo, with its own settings ([ai.md](ai.md) covers company Splunk and approved AI providers).
- **On Kubernetes or OpenShift:** use the Helm chart instead ([kubernetes.md](kubernetes.md)).

## With a real Splunk

`docker-compose.splunk.yml` runs the app against Splunk Enterprise's free trial instead of the dummy data: Splunk, dummy logs, six scheduled reports, and the connector copying their runs into MongoDB through Splunk's REST API. It needs an Intel/AMD (x86) machine. See [splunk-example.md](splunk-example.md).

## How it's checked

CI's **Docker** job does what a teammate would do on a fresh checkout:
1. Builds the images, then starts everything.
2. Signs in, and checks that the reports API lists the reports.
3. Runs the ML job.

It isn't required for merging, but a red Docker job means this guide no longer works.

## On a laptop with 8 GB of memory

Building the app needs a few GB of memory for a couple of minutes. Running it needs about 1 GB: MongoDB plus the app. Close other heavy apps while building, and stop the stack with `docker compose down` when you're done. For day-to-day development, `npm run dev` with MongoDB from Homebrew is lighter (see the README).
