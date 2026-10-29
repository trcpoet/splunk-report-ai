import math
from datetime import datetime, timezone

import pandas as pd
import pytest

from features import FEATURES, reason, robust_z, run_features, strongest
from score import learn_from_votes, run_document, score_runs


def runs(counts, slug="report", statuses=None, seconds=None):
    """A report's runs, an hour apart, as MongoDB's report_runs holds them."""
    statuses = statuses or ["success"] * len(counts)
    seconds = seconds or [60] * len(counts)
    start = pd.Timestamp("2026-10-01T00:00:00Z")
    return pd.DataFrame({
        "sid": [f"{slug}-{i}" for i in range(len(counts))],
        "reportSlug": slug,
        "runAt": [start + pd.Timedelta(hours=i) for i in range(len(counts))],
        "status": statuses,
        "resultCount": counts,
        "durationSec": seconds,
    })


def test_robust_z_matches_the_app():
    # The same numbers as lib/insights.test.ts.
    assert robust_z(32, [18, 20, 22, 20, 24, 16]) == pytest.approx(4.0466, abs=1e-3)
    assert robust_z(102, [100, 100, 100, 100]) == pytest.approx(0.2)
    assert robust_z(400, [40, 41, 39]) == 0.0  # too few earlier runs


def test_each_run_is_compared_with_the_earlier_successful_runs():
    features = run_features(runs([40, 41, 39, 40, 42, 41, 120]))
    assert features.results_z.iloc[:4].tolist() == [0, 0, 0, 0]  # not enough history yet
    assert features.results_z.iloc[-1] > 3.5
    assert features.usual_results.iloc[-1] == 40.5


def test_a_failed_run_scores_zero_and_stays_out_of_the_baseline():
    features = run_features(runs([40, 0, 41, 39, 40, 42, 41], statuses=["success", "failed", *["success"] * 5]))
    failed = features.iloc[1]
    assert (failed.failed, failed.results_z, failed.duration_z) == (1.0, 0.0, 0.0)
    assert features.usual_results.iloc[-1] == 40.0  # the 0 from the failed run isn't in it


def test_reasons_are_plain_words():
    features = run_features(runs([40, 41, 39, 40, 42, 41, 120]))
    assert reason(features.iloc[-1]) == "Results far above usual: 120 against about 40."
    assert reason(features.iloc[0]) == "Too few earlier runs to compare with."
    slow = run_features(runs([10] * 7, seconds=[60, 61, 59, 60, 62, 61, 300])).iloc[-1]
    assert reason(slow) == "Search time far above usual: 5m 0s against about 1m 0s."
    typical = run_features(runs([40, 41, 39, 40, 42, 41, 40])).iloc[-1]
    assert reason(typical) == "Results close to usual: 40 against about 40."


def test_the_measure_that_stands_out_is_named_for_the_app():
    features = run_features(runs([40, 41, 39, 40, 42, 41, 120]))
    assert strongest(features.iloc[-1]) == "results"
    assert strongest(features.iloc[0]) is None  # too few earlier runs
    slow = run_features(runs([10] * 7, seconds=[60, 61, 59, 60, 62, 61, 300])).iloc[-1]
    assert strongest(slow) == "duration"
    failed = run_features(runs([40, 41, 39, 40, 42, 0], statuses=[*["success"] * 5, "failed"])).iloc[-1]
    assert strongest(failed) is None


def test_the_forest_flags_a_clear_spike_first():
    quiet = [runs([40 + (i % 3) for i in range(8)], slug=f"quiet-{n}") for n in range(6)]
    spike = runs([40, 41, 39, 40, 42, 41, 40, 400], slug="spike")
    scored = score_runs(run_features(pd.concat([*quiet, spike], ignore_index=True)))
    top = scored.sort_values("score", ascending=False).iloc[0]
    assert (top.reportSlug, bool(top.unusual), top.score, top.measure) == ("spike", True, 1.0, "results")
    assert set(FEATURES) <= set(scored.columns)


def test_each_run_is_saved_with_plain_values_and_null_for_no_measure():
    scored = list(score_runs(run_features(runs([40, 41, 39, 40, 42, 41, 120]))).itertuples(index=False))
    now = datetime.now(timezone.utc)
    first, last = run_document(scored[0], now), run_document(scored[-1], now)
    assert first["measure"] is None  # too few earlier runs: pandas has NaN here
    assert last["measure"] == "results" and last["unusual"] is True
    assert isinstance(last["score"], float) and isinstance(last["runAt"], datetime)


def test_the_flag_model_waits_for_enough_votes_of_both_kinds():
    scored = score_runs(run_features(runs([40, 41, 39, 40, 42, 41, 400])))
    vote = {"value": "up", "reportSlug": "report", "flag": {"reason": "unusual", "runAt": "2026-10-01T06:00:00Z"}}
    assert learn_from_votes(scored, [vote] * 30) is None  # only 👍
    assert learn_from_votes(scored, [vote]) is None  # too few


def test_the_flag_model_learns_when_there_are_enough_votes():
    reports = [runs([40, 41, 39, 40, 42, 41, 40 + 30 * (n % 2)], slug=f"r{n}") for n in range(24)]
    scored = score_runs(run_features(pd.concat(reports, ignore_index=True)))
    newest = scored.sort_values("runAt").groupby("reportSlug").tail(1)
    votes = [{"value": "up" if run.results_z > 2 else "down", "reportSlug": run.reportSlug,
              "flag": {"reason": "unusual", "runAt": run.runAt.isoformat()}} for run in newest.itertuples()]
    learned = learn_from_votes(scored, votes)
    assert learned is not None and learned["trainedOn"] == 24
    assert learned["attention"]["r1"] > learned["attention"]["r0"]  # the spiking reports matter more
    assert not math.isnan(learned["accuracy"])
