# Learning from the reports

How SplunkEvents spots runs worth a look, and how it learns from what people tell it. There are three layers, from simplest to most involved:

1. **Plain statistics** in the app (`lib/insights.ts`): no training, and it explains itself.
2. **An Isolation Forest** in the Python job (`ml/score.py`): unsupervised. It scores every run against every other run.
3. **A logistic regression** in the same job: supervised. It learns from the briefing's "Worth flagging?" votes which flags people find useful.

How to set up and run the job: [ml/README.md](../ml/README.md).

## 1. Plain statistics

`lib/insights.ts` flags a report's newest run when its result count or search time stands out from the report's earlier runs:
- It uses the median and the median absolute deviation, which shrug off one odd run in the history.
- A run is flagged at 3.5 robust z-scores or more.
- [ai.md](ai.md#the-briefing-explain-and-unusual-runs) explains it in more detail.

It needs no training and no extra software, and it explains itself: "117 results, about 3× the usual 40".

## 2. An Isolation Forest over every run

An Isolation Forest builds many random trees, each splitting the runs apart at random. A run unlike the others ends up alone after only a few splits, so the fewer splits it takes, the more unusual the run. It needs no labels, which is why it's called unsupervised.

**What it looks at** (`ml/features.py`), for each run:
- `results_z` and `duration_z`: how far its result count and search time are from its report's usual. These are the same robust z-scores the app uses, against up to 6 earlier successful runs.
- `failed`: 1 if the run failed, else 0.

Each report is compared with its own history first. That puts a report with 3 results and one with 3,000 on the same scale before the forest compares them.

**What it gives each run** (`ml_run_scores`):
- **A score from 0 to 1.** 0 is a typical run, and 1 the most unusual run in that scoring. Scores are rescaled every time the job runs, so compare scores from the same run of the job, not across days.
- **Unusual, yes or no.** It flags the 5% of runs that differ most. The library's "auto" setting flagged about half of the demo's 64 runs: in so little data, every run off the dense cluster of perfectly typical ones looks isolated.
- **A reason**, from the feature that stands out more: "Results far above usual: 117 against about 40."

**Why have both?** The statistics look at one report and one measure at a time, and need a big change. The forest sees every report's runs together, and both measures at once. So it can notice a run that is a little odd on both measures, or that is odd for this set of reports. On the demo data they agree: both flag the failed-logins spike.

## 3. Learning from the votes

Every flag in the briefing asks **Worth flagging?** with 👍 / 👎. Each vote is saved in `ai_feedback`, with what was flagged worked out on the server: the report, the run, why it was flagged (its status, or an unusual run, with the score), and the forest's score if it had one.

Those votes are labels: examples of flags people found useful, or not. The job trains a **logistic regression** on them:
- **Inputs:** the run's features, the forest's score, and whether the flag was for a status (warning or failed) or for an unusual run.
- **Output:** for each report's newest run, the chance that a flag on it is worth someone's attention (`ml_report_scores`).
- **It waits for 20 votes, with at least one 👍 and one 👎.** Until then it says how many it has, and the briefing keeps its usual order.
- **It checks itself:** it holds back some votes, trains on the rest, and prints how often it predicts the held-back ones right (stratified k-fold cross-validation).
- `class_weight="balanced"` keeps it from simply predicting whichever answer is more common.

## How the app uses the scores

The app reads both collections in `lib/dal.ts`, with the reports, and shows them only for reports the viewer can see.
- **Briefing:** a newest run that the forest flags joins "Unusual runs" even when the statistics don't flag it, marked "Noticed by the ML model". A failed run isn't added there, since "Needs attention" already shows it. Runs the statistics flagged show the forest's score too.
- **Order:** once the vote model has learned, both lists put the flags people find most worth attention first, and a note says so.
- **Explain:** "At a glance" gives the forest's score for the newest run and, once learned, the chance a flag on the report is worth attention.
- **Ask AI:** the same two numbers are in what the AI is told about each report.
- **Freshness:** the job tells the app to refresh, like the sync does. The briefing's AI summary is written again when the forest's flag on a newest run changes, or when the learned attention moves by a tenth.

## When to run it

After a sync, when there are new runs: `npm run ml` on the machine that runs the sync. Nothing schedules it yet. On the demo data it takes a few seconds.

## What it can't do yet

- **Choose how to show a report.** Learning which chart suits a report would need many reports, each with a label for which chart worked. 9 reports is far too few. Charts come from the chart saved in Splunk, plus `lib/report-config.ts`.
- **Choose which reports to collect.** The sync copies every scheduled report that emails its results. The scores could later decide which runs to keep longer, but that's a decision for the people who use the reports, not for a model.
- **Be precise with little history.** With about 7 runs per report the scores are rough. They get better as MongoDB keeps more runs (`RUN_RETENTION_DAYS`).
- **Learn anything before people vote.** Until there are 20 votes of both kinds, only the Isolation Forest runs.
