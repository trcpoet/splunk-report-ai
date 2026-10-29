# Splunk data and AI: the strategy

How to bring Splunk data into SplunkEvents, and how to make its AI write better searches over time. It answers these questions:
- Splunk's SDKs or its REST API?
- What changes when people sign in to Splunk with AD?
- A RAG pipeline or an agent?
- Supervised or unsupervised learning?
- Can PostHog find anomalies in reports?

## In short

1. **Collect** through Splunk's REST API into MongoDB, with a **service-account token**, not people's AD logins.
2. **The REST API, not the JavaScript SDK.** The SDKs wrap the same API. Use the Python SDK only inside Python jobs.
3. **Copy results and run statistics, not raw logs.** Raw events stay in Splunk.
4. **RAG first.** Retrieve similar past searches and real field names for each request. **Check every search with a parser** before showing it.
5. **"Supervised" learning means feedback and evaluation now, and fine-tuning later**, once there are hundreds of verified examples.
6. **"Unsupervised" learning runs inside Splunk**, where the logs are. Only the scores come back.
7. **An agent only with read-only tools, limits and a person's approval.** Approved searches become scheduled reports.
8. **PostHog is for how people use the app, not for Splunk data.**

## The architecture

```
People ──AD / SSO──► Splunk Web                      (unchanged: how people use Splunk)

Splunk scheduled searches
   │  REST API (:8089), service-account token, read-only role
   ▼
sync worker ──► MongoDB: reports, runs, results, votes, ML scores, past searches
                   ▲                  │
   ML job ─────────┘                  ▼
                           SplunkEvents web app (access by the app's groups)
                             ├─ Ask about reports: AI over the stored reports
                             └─ Write SPL: similar past searches ─► AI ─► Splunk's parser
                                           (parse-only token) ─► you run it in Splunk
```

## 1. Collecting the data

### People use AD; the app uses a service account

People sign in to Splunk Web with AD, through LDAP or through single sign-on (SAML, for example with Entra ID or ADFS). A server shouldn't hold their passwords or sessions. Ask the Splunk admins for:

1. **A service account,** with a role that can read the scheduled reports the app shows, and nothing that writes.
2. **An authentication token** for it: Settings → Tokens, or the `services/authorization/tokens` REST endpoint. This is the sync worker's `SPLUNK_TOKEN`.
   - With SAML single sign-on, tokens only work when the identity provider answers attribute queries, or when Splunk's authentication extensions supply the user's details. That is the admins' setup, and on Splunk Cloud only some identity providers are supported.
3. **Optional: a second token,** for a parse-only role with no index access. It's the web app's `SPLUNK_PARSER_TOKEN`, so Write SPL can check searches with Splunk's own parser.

Who sees which report stays in the app, in its `user_access` groups ([report-access.md](report-access.md)). Later, the app's own sign-in can use the company's single sign-on, and read people's AD groups into `user_access`.

### The REST API, not the SDKs

- **The JavaScript SDK isn't needed.** The SDKs are thin wrappers over the REST API. The sync worker already calls the five endpoints it needs (`lib/splunk/transport.ts`), with retries, and it's tested against a fake Splunk. The JavaScript SDK (`splunk-sdk` on npm, at 2.0.2) points people to the Python SDK for modular inputs.
- **Keep the sync in TypeScript.** The status rules and highlights in `lib/report-config.ts` are TypeScript that runs during the sync.
- **Use the Python SDK (`splunklib`) where Python already runs:** the ML job, or an agent's tool that runs a search and streams its results.

### What to copy

- **Copy:** each scheduled report's results and its run statistics (status, duration, result count). Pages load at once, and history outlives Splunk's job retention.
- **Leave in Splunk:** raw events. Splunk is built to search them, and a second copy of company logs needs data-governance approval.
- **To show something new,** add a scheduled search in Splunk that summarizes it. The sync picks it up like any other report.

## 2. Writing better searches: RAG first

RAG (retrieval-augmented generation) means finding the most relevant examples and facts for each request, and giving them to the AI with the question. The AI then writes like your team's searches, with your field names, and no model training is needed.

- **What to retrieve from:**
  - the saved searches' SPL, with their title, description, index, sourcetype and columns;
  - the searches people approve in Write SPL ("Save as example");
  - later, other searches the Splunk admins agree to share.
- **How to find the closest ones:**
  - Turn each one into an embedding (Gemini has embedding models), and compare with the request by cosine similarity.
  - For a few hundred examples, that comparison can run in the app.
  - Past a few thousand, use MongoDB's `$vectorSearch`. It's on Atlas, including the free tier, and in Community Edition 8.2 and later, which runs it with `mongot`.
- **Real field names:**
  - **Where they come from:** in live mode, summarize each index and sourcetype on a schedule with `| fieldsummary` or `| tstats`.
  - **Why it matters:** invented field names are the most common reason a generated search is wrong.
- **Check before showing.** Every search goes through Splunk's parser, or the demo parser, before you see it ([ai.md](ai.md)). A search that doesn't parse offers "Fix the error".

## 3. "Supervised" learning: feedback and evaluation

**Labels the app can collect:**
- 👍 / 👎 on answers;
- whether a search parsed;
- whether someone pressed "Fix the error";
- whether the search was used as written or edited first;
- whether it returned results.

**What to do with them now:**
- **Rank the examples.** Prefer the examples that led to accepted searches.
- **Score every change.** Keep 50–100 requests, each with the search an expert wrote. Score every prompt or model change against them:
  - Does the search parse?
  - Does it run within limits?
  - Does it return the same fields and rows as the expert's search?

**Fine-tuning:** only once there are about 500 verified request-and-search pairs, and an approved model that the company allows to be tuned. Compare it with RAG on the same evaluation set before switching.

## 4. "Unsupervised" learning: inside Splunk

- **Anomalies on summarized data:** Splunk's own `anomalydetection`, `outlier` and `predict` commands, or the Machine Learning Toolkit (`fit DensityFunction`, for example). Store only the flags in MongoDB.
- **Log patterns:** `cluster` groups similar events. That helps answer "what kinds of events are in this sourcetype?", and gives RAG more context.
- **Splunk's docs:** retrieve the pages of the SPL command reference your teams use, the same way as the searches. No training.
- **In this app already:** median and MAD statistics on each report's runs (`lib/insights.ts`), and an Isolation Forest across all runs ([ml.md](ml.md)).

## 5. An agent that searches Splunk

An agent is useful, but only with guardrails:

- **Read-only tools only:**
  - list indexes and sourcetypes;
  - summarize a sourcetype's fields;
  - find similar saved searches;
  - parse a search;
  - run a search, always with a time range and a row limit.
- **A person approves** every search before it runs. The existing check for commands that change data stays.
- **Permissions:** the agent searches as a least-privilege role, or as each person, if the company has a Splunk-side integration that does that. One example is Splunk's MCP Server app; ask the admins what's in place.
- **Searches worth keeping become scheduled reports in Splunk,** and the sync brings them into the app. The agent helps write searches; Splunk keeps running them.

## 6. Anomalies in reports: not PostHog

PostHog's anomaly-detection alerts are in beta, and the free tier allows 5 alerts. More importantly, they run on events sent to PostHog's cloud, so Splunk data would leave the company.

Find report anomalies with:
- the briefing, which uses the statistics and the ML job;
- Splunk's own alerts;
- or notifications from this app.

Keep PostHog for how people use the app, such as which reports they open and whether Explain helps.

## The order to build in

1. **Done:** each Write SPL search is checked with a parser before it's shown.
2. **Done:** RAG for Write SPL, with "Save as example", and `npm run eval:spl` to measure it ([ai.md](ai.md#how-write-spl-learns-from-your-searches)).
3. Real field names from `| fieldsummary`, in live mode.
4. The evaluation set, scored with a real key on a schedule.
5. Agent tools behind a person's approval, at work only.

## Here and at work

- **This repo is public** and holds dummy data only.
- **At work,** use the work copy of the repo, with:
  - the service-account and parse-only tokens;
  - the company's approved LLM in `lib/ai/llm.ts`;
  - approval for copying report results into MongoDB and sending them to an LLM.

## References

- Splunk: [Set up authentication with tokens](https://help.splunk.com/en/splunk-enterprise/administer/manage-users-and-security/9.4/authenticate-into-the-splunk-platform-with-tokens), and [Configure authentication extensions for SAML tokens](https://docs.splunk.com/Documentation/Splunk/8.0.2/Security/ConfigureauthextensionsforSAMLtokens).
- MongoDB: [Search and Vector Search for Community Edition](https://www.mongodb.com/products/updates/now-ga-mongodb-search-and-vector-search-for-community-edition/).
- PostHog: [Alerts](https://posthog.com/docs/alerts).
