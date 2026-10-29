"""Scores every Splunk report run for how unusual it is, and learns from the
briefing's "Worth flagging?" votes which flags people find useful.

    python ml/score.py          score the runs and save the results in MongoDB
    python ml/score.py --plot   also draw ml/out/anomaly-scores.png

It reads MONGODB_URI (and APP_URL and REVALIDATE_SECRET, to refresh the app)
from the environment or the repo's .env.local. See ml/README.md and docs/ml.md.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    from dotenv import load_dotenv
    from pymongo import MongoClient, ReplaceOne
    from sklearn.ensemble import IsolationForest
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
except ImportError as error:
    sys.exit(f"The ML job needs the package {error.name}. Set up its virtual environment "
             "and install ml/requirements.txt into it (see ml/README.md).")

from features import FEATURES, reason, run_features, strongest

ROOT = Path(__file__).resolve().parent.parent

RUN_MODEL = "isolation-forest-v1"
FLAG_MODEL = "logistic-regression-v1"
# The share of runs the Isolation Forest flags: about 3 of the demo's 64.
CONTAMINATION = 0.05
# The supervised model waits for this many votes, with at least one of each kind.
MIN_VOTES = 20
# Seconds between the two cache refreshes (refresh_app).
SECOND_REFRESH_SECONDS = 3


def score_runs(features: pd.DataFrame) -> pd.DataFrame:
    """Adds `score` (0 typical, 1 most unusual), `unusual`, `reason` and
    `measure` (the one that stands out more, for the app's sparkline).

    An Isolation Forest learns what normal runs look like across every report
    and isolates the ones that differ. It flags the CONTAMINATION share of runs
    that differ most. Its "auto" threshold flagged about half of the demo's
    64 runs: in so little data, every run off the dense cluster of perfectly
    typical ones looked isolated."""
    X = features[FEATURES].to_numpy()
    forest = IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=42).fit(X)
    raw = -forest.score_samples(X)
    spread = raw.max() - raw.min()
    scored = features.copy()
    scored["score"] = (raw - raw.min()) / spread if spread > 0 else 0.0
    scored["unusual"] = forest.predict(X) == -1
    scored["reason"] = scored.apply(reason, axis=1)
    scored["measure"] = scored.apply(strongest, axis=1)
    return scored


def run_document(run, scored_at: datetime) -> dict:
    """What ml_run_scores keeps for one scored run. pandas holds a missing
    measure as NaN in a text column; MongoDB gets null instead."""
    return {
        "reportSlug": run.reportSlug,
        "runAt": run.runAt.to_pydatetime(),
        "score": round(float(run.score), 3),
        "unusual": bool(run.unusual),
        "reason": run.reason,
        "measure": run.measure if isinstance(run.measure, str) else None,
        "model": RUN_MODEL,
        "scoredAt": scored_at,
    }


def learn_from_votes(scored: pd.DataFrame, votes: list[dict]) -> dict | None:
    """A logistic regression on the "Worth flagging?" votes: given what a flag
    was about, how likely is it to be worth someone's attention? Returns the
    chance for each report's newest run, or None without enough votes."""
    by_run = {(row.reportSlug, row.runAt): row for row in scored.itertuples(index=False)}
    rows = []
    for vote in votes:
        flag = vote.get("flag") or {}
        run_at = pd.Timestamp(flag["runAt"]) if flag.get("runAt") else None
        run = by_run.get((vote.get("reportSlug"), run_at))
        if run is None:
            continue
        rows.append({**{name: getattr(run, name) for name in FEATURES}, "model_score": run.score,
                     "for_status": float(flag.get("reason") == "status"), "label": int(vote["value"] == "up")})

    labels = pd.DataFrame(rows, columns=FEATURES + ["model_score", "for_status", "label"])
    ups, downs = int(labels.label.sum()), int(len(labels) - labels.label.sum())
    if len(labels) < MIN_VOTES or ups == 0 or downs == 0:
        print(f"Not enough votes to learn from yet: {len(labels)} of {MIN_VOTES} "
              f"({ups} 👍, {downs} 👎; it needs both). The briefing keeps its usual order.")
        return None

    columns = FEATURES + ["model_score", "for_status"]
    X, y = labels[columns].to_numpy(), labels.label.to_numpy()
    model = LogisticRegression(class_weight="balanced", max_iter=1000)
    folds = min(5, ups, downs)
    accuracy = float(cross_val_score(model, X, y, cv=StratifiedKFold(folds, shuffle=True, random_state=42)).mean()) if folds >= 2 else math.nan
    model.fit(X, y)

    newest = scored.sort_values("runAt").groupby("reportSlug").tail(1).copy()
    newest["model_score"] = newest.score
    newest["for_status"] = (newest.status != "success").astype(float)
    chance = model.predict_proba(newest[columns].to_numpy())[:, 1]
    print(f"Learned from {len(labels)} votes. Accuracy on held-out votes "
          f"({folds}-fold cross-validation): {accuracy:.0%}." if not math.isnan(accuracy) else f"Learned from {len(labels)} votes.")
    return {"attention": dict(zip(newest.reportSlug, chance.round(3))), "trainedOn": len(labels), "accuracy": accuracy}


def plot(scored: pd.DataFrame, titles: dict[str, str], path: Path) -> None:
    """One row per report, one dot per run: ordinary runs in muted grey, the
    runs the model flags in the accent, with their score. Rows sorted by each
    report's highest score. Colors follow the app (docs/ml.md)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    background, ink, muted, accent = "#030708", "#e7f2ff", "#8f959a", "#3987e5"
    order = scored.groupby("reportSlug").score.max().sort_values().index.tolist()
    flagged = scored[scored.unusual]

    fig, ax = plt.subplots(figsize=(10, 0.55 * len(order) + 1.6), facecolor=background)
    ax.set_facecolor(background)
    # Runs often score the same, so each report's runs are spread a little up
    # and down, oldest at the top, so every dot shows.
    position = {}
    for row, slug in enumerate(order):
        runs = scored[scored.reportSlug == slug].sort_values("runAt")
        offsets = np.linspace(0.18, -0.18, len(runs)) if len(runs) > 1 else [0.0]
        position.update({sid: row + offset for sid, offset in zip(runs.sid, offsets)})
        ax.scatter(runs.score, [position[sid] for sid in runs.sid], s=36, color=[accent if unusual else muted for unusual in runs.unusual],
                   edgecolors=background, linewidths=1.5, zorder=3)
    for run in flagged.itertuples(index=False):
        ax.annotate(f"{run.score:.2f}", (run.score, position[run.sid]), xytext=(0, 7), textcoords="offset points",
                    ha="center", color=ink, fontsize=9)

    count = len(flagged)
    fig.suptitle(f"{count} of {len(scored)} runs stand{'s' if count == 1 else ''} out" if count else f"None of {len(scored)} runs stands out",
                 color=ink, fontsize=14, fontweight="bold", x=0.02, ha="left")
    ax.set_title("Each dot is a run. Blue: the runs the Isolation Forest flags, the 5% that differ most.",
                 color=muted, fontsize=10, loc="left")
    ax.set_yticks(range(len(order)), [titles.get(slug, slug) for slug in order], color=ink, fontsize=9)
    ax.set_xlim(-0.03, 1.08)
    ax.set_xlabel("Anomaly score (0 = typical, 1 = most unusual)", color=muted, fontsize=10)
    ax.tick_params(axis="x", colors=muted)
    ax.grid(axis="x", color="#182830", linewidth=1)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#182830")

    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=150, facecolor=background)
    print(f"Drew {path.relative_to(ROOT)}.")


def refresh_app() -> None:
    """Tells the app to drop its cached report data, like the sync worker does:
    twice, a few seconds apart, because a page that was still reading the old
    data when the cache was dropped can put that old data back."""
    app_url, secret = os.environ.get("APP_URL"), os.environ.get("REVALIDATE_SECRET")
    if not app_url or not secret:
        print("APP_URL or REVALIDATE_SECRET is not set, so the app shows the new scores when its cache expires.")
        return
    request = urllib.request.Request(app_url.rstrip("/") + "/api/revalidate", method="POST", headers={"Authorization": f"Bearer {secret}"})
    try:
        for attempt in range(2):
            if attempt:
                time.sleep(SECOND_REFRESH_SECONDS)
            with urllib.request.urlopen(request, timeout=5) as response:
                if response.status != 200:
                    print(f"The app refused the cache refresh ({response.status}).")
                    return
        print("Refreshed the app cache.")
    except Exception:
        print(f"The app isn't reachable at {app_url}. It shows the new scores when its cache expires.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--plot", action="store_true", help="also draw ml/out/anomaly-scores.png")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env.local", override=False)
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("MONGODB_URI is not set. Add it to .env.local, or export it.")

    client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=10_000)
    db = client.get_default_database()
    try:
        runs = pd.DataFrame(list(db.report_runs.find({}, {"_id": 0, "sid": 1, "reportSlug": 1, "runAt": 1, "status": 1, "resultCount": 1, "durationSec": 1})))
        if runs.empty:
            sys.exit("No runs in MongoDB yet. Run npm run sync first.")
        titles = {report["slug"]: report["title"] for report in db.reports.find({}, {"slug": 1, "title": 1})}

        scored = score_runs(run_features(runs))
        now = datetime.now(timezone.utc)
        db.ml_run_scores.bulk_write([ReplaceOne({"_id": run.sid}, run_document(run, now), upsert=True) for run in scored.itertuples(index=False)])
        # Runs MongoDB has since deleted take their scores with them.
        db.ml_run_scores.delete_many({"scoredAt": {"$lt": now}})

        flagged = scored[scored.unusual].sort_values("score", ascending=False)
        newest = set(scored.sort_values("runAt").groupby("reportSlug").tail(1).sid)
        print(f"Scored {len(scored)} runs from {scored.reportSlug.nunique()} reports with an Isolation Forest. "
              f"{len(flagged)} look{'s' if len(flagged) == 1 else ''} unusual (newest runs reach the briefing):")
        for run in flagged.itertuples(index=False):
            print(f"  {run.score:.2f}  {titles.get(run.reportSlug, run.reportSlug)}, {run.runAt:%b %d %H:%M} UTC"
                  f"{' (newest)' if run.sid in newest else ''}: {run.reason}")

        learned = learn_from_votes(scored, list(db.ai_feedback.find({"kind": "flag"}, {"_id": 0, "value": 1, "reportSlug": 1, "flag": 1})))
        db.ml_report_scores.delete_many({})
        if learned:
            db.ml_report_scores.insert_many([
                {"_id": slug, "attention": float(chance), "trainedOn": learned["trainedOn"],
                 "accuracy": None if math.isnan(learned["accuracy"]) else round(learned["accuracy"], 3), "model": FLAG_MODEL, "scoredAt": now}
                for slug, chance in learned["attention"].items()
            ])

        if args.plot:
            plot(scored, titles, ROOT / "ml" / "out" / "anomaly-scores.png")
    finally:
        client.close()

    refresh_app()


if __name__ == "__main__":
    main()
