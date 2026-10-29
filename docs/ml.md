# Learning from the reports

How SplunkEvents spots runs worth a look, and how it learns from what people tell it.

## Today: plain statistics

`lib/insights.ts` flags a report's newest run when its result count or search time stands out from the report's earlier runs:
- It uses the median and the median absolute deviation, which shrug off one odd run in the history.
- A run is flagged at 3.5 robust z-scores or more.
- [ai.md](ai.md#the-briefing-explain-and-unusual-runs) explains it in more detail.

It needs no training and no extra software, and it explains itself: "61 results, about 2.4× the usual 25".

## Collecting labels

Every flag in the briefing asks **Worth flagging?** with 👍 / 👎. Each vote is saved in `ai_feedback` with what was flagged:
- the report;
- the run;
- why it was flagged: its status, or an unusual result count or search time, with the score.

Those votes are labels: examples of flags people found useful, or not. A model can learn from them which flags to show first.

## Next: a Python job

A Python job in `ml/` comes next. It will:
- score every run with an Isolation Forest, a model that learns what normal runs look like across all reports;
- once there are enough votes, learn from them which flags are worth attention.

Its scores go into MongoDB, where the app reads them.
