# The ML job

A Python script with two small models. One scores every report run for how unusual it is. The other learns from the briefing's "Worth flagging?" votes which flags people find useful. It runs separately from the app and saves what it finds in MongoDB, where the app reads it.

What the models do, and how the app uses them: [docs/ml.md](../docs/ml.md).

## Set up (once)

It needs Python 3.14 (on a Mac: `brew install python@3.14`). The packages go in a virtual environment in `ml/.venv`, which git ignores.

macOS or Linux:

```bash
python3.14 -m venv ml/.venv
ml/.venv/bin/pip install -r ml/requirements.txt
```

Windows (PowerShell):

```powershell
py -3.14 -m venv ml\.venv
ml\.venv\Scripts\pip install -r ml\requirements.txt
```

If the repo is in a folder that syncs to the cloud (such as an iCloud Desktop or OneDrive), the sync can move the environment's files off the disk, and the job then hangs. Delete `ml/.venv` and set it up again.

## Run

Run `npm run sync` first, so MongoDB has runs to score.

| macOS or Linux | Windows | What it does |
|---|---|---|
| `npm run ml` | `ml\.venv\Scripts\python ml\score.py` | Scores every run and saves the scores in MongoDB |
| `npm run ml:plot` | `ml\.venv\Scripts\python ml\score.py --plot` | Also draws `ml/out/anomaly-scores.png` |
| `npm run test:ml` | `ml\.venv\Scripts\python -m pytest ml` | The tests. They build their runs in memory, so they need no database |

It reads `MONGODB_URI` from `.env.local`, or from the environment, which wins. With `APP_URL` and `REVALIDATE_SECRET` also set, it tells the app to show the new scores at once, like the sync worker does. Otherwise the app shows them within a few minutes, when its cache expires.

On the demo data it prints:

```
Scored 64 runs from 9 reports with an Isolation Forest. 4 look unusual (newest runs reach the briefing):
  1.00  Disk Space Utilization Above 85%, Oct 02 09:00 UTC (newest): The run failed.
  0.98  Failed Login Attempts by User, Oct 03 06:00 UTC (newest): Results far above usual: 117 against about 40.
  0.80  Disk Space Utilization Above 85%, Oct 02 08:30 UTC: Search time a little below usual: 3s against about 9s.
  0.65  Firewall Denied Connections: Top Sources, Oct 02 04:00 UTC: Results a little below usual: 19 against about 25.
Not enough votes to learn from yet: 1 of 20 (1 👍, 0 👎; it needs both). The briefing keeps its usual order.
```

To score the hosted demo's database instead, export its settings first. Exported variables win over `.env.local`:

```bash
set -a; source .env.demo; set +a
npm run ml
```

## Files

| File | Job |
|---|---|
| `features.py` | What the models look at for each run, worked out from its report's earlier runs. Pure functions, tested |
| `score.py` | Loads the runs and votes, runs both models, saves the scores and draws the chart |
| `tests/test_ml.py` | The tests (pytest) |
| `requirements.txt` | The packages, pinned to exact versions |

## What it writes

The job replaces both collections each time it runs.

| Collection | One document per | Holds |
|---|---|---|
| `ml_run_scores` | run (`_id` is its sid) | `score` (0 typical, 1 most unusual), `unusual`, `reason` in plain words, and `measure`, the one that stands out more |
| `ml_report_scores` | report (`_id` is its slug), once there are enough votes | `attention`: the chance that a flag on its newest run is worth someone's attention, plus `trainedOn` and `accuracy` |
