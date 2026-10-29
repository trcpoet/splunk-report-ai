"""Features for the ML job, worked out from each report's run history.

Pure functions on pandas DataFrames, so the tests run without a database.
The robust z-score matches lib/insights.ts in the app, so the job and the
app's statistics agree on what "far from usual" means.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

# Like lib/insights.ts: at least 4 earlier successful runs to compare with,
# and the 6 most recent of them.
MIN_BASELINE = 4
BASELINE_RUNS = 6

# What the models look at for each run: how far its result count and search
# time are from the report's usual, and whether it failed. A run's status
# (warning) isn't one: the briefing's "Needs attention" already covers it.
FEATURES = ["results_z", "duration_z", "failed"]


def robust_z(value: float, baseline: list[float]) -> float:
    """How far `value` is from the baseline's median, in robust standard
    deviations (1.4826 x the median absolute deviation). The spread is at
    least 10% of the usual value, and at least 1, so a perfectly steady
    history doesn't call every small change unusual. 0 without enough runs."""
    if len(baseline) < MIN_BASELINE:
        return 0.0
    usual = float(np.median(baseline))
    mad = float(np.median([abs(earlier - usual) for earlier in baseline]))
    spread = max(1.4826 * mad, 0.1 * abs(usual), 1.0)
    return (value - usual) / spread


def run_features(runs: pd.DataFrame) -> pd.DataFrame:
    """One row per run, with the features the models use.

    `runs` has: sid, reportSlug, runAt, status, resultCount, durationSec.
    Each run is compared with the earlier successful runs of the same report.
    A failed run has no results to compare, so it scores 0 on both measures
    and 1 on `failed`.
    """
    rows = []
    for slug, group in runs.sort_values("runAt").groupby("reportSlug", sort=False):
        earlier: list[tuple[float, float]] = []
        for run in group.itertuples(index=False):
            failed = run.status == "failed"
            baseline = earlier[-BASELINE_RUNS:]
            counts = [count for count, _ in baseline]
            seconds = [duration for _, duration in baseline]
            rows.append({
                "sid": run.sid,
                "reportSlug": slug,
                "runAt": run.runAt,
                "status": run.status,
                "resultCount": float(run.resultCount),
                "durationSec": float(run.durationSec),
                "results_z": 0.0 if failed else robust_z(run.resultCount, counts),
                "duration_z": 0.0 if failed else robust_z(run.durationSec, seconds),
                "failed": float(failed),
                "warning": float(run.status == "warning"),
                # How many earlier runs it was compared with (none count below MIN_BASELINE).
                "baseline": len(baseline),
                "usual_results": float(np.median(counts)) if counts else math.nan,
                "usual_seconds": float(np.median(seconds)) if seconds else math.nan,
            })
            if not failed:
                earlier.append((float(run.resultCount), float(run.durationSec)))
    return pd.DataFrame(rows)


def duration(seconds: float) -> str:
    seconds = int(round(seconds))
    return f"{seconds // 60}m {seconds % 60}s" if seconds >= 60 else f"{seconds}s"


def strongest(run) -> str | None:
    """The measure that stands out more: "results" or "duration". None for a
    failed run, or one without enough earlier runs to compare with."""
    if run.failed or run.baseline < MIN_BASELINE:
        return None
    return "results" if abs(run.results_z) >= abs(run.duration_z) else "duration"


def reason(run) -> str:
    """How a run compares with its usual, in plain words, from its strongest feature."""
    if run.failed:
        return "The run failed."
    measure = strongest(run)
    if measure is None:
        return "Too few earlier runs to compare with."
    results = measure == "results"
    z = run.results_z if results else run.duration_z
    how = "far" if abs(z) >= 3.5 else "well" if abs(z) >= 2 else "a little" if abs(z) >= 1 else None
    where = f"{how} {'above' if z > 0 else 'below'} usual" if how else "close to usual"
    if results:
        return f"Results {where}: {int(run.resultCount):,} against about {round(run.usual_results):,}."
    return f"Search time {where}: {duration(run.durationSec)} against about {duration(run.usual_seconds)}."
