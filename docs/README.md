# SplunkEvents documentation

## For engineers

| Guide | Read it to |
|---|---|
| [codebase-guide.md](codebase-guide.md) | Start here: the reading order, the rules that are easy to break, and the glossary |
| [architecture.md](architecture.md) | See how it's put together. It covers the programs and the data model, how report data moves, and how a page is built. It also covers access, Ask AI, the ML job, deployment and security, with diagrams. |
| [configuration.md](configuration.md) | Change a setting: each environment variable and the file that reads it, report rules, access, AI, the sync, statistics, caching, the look, build, deploy and CI |
| [reference/](reference/README.md) | Look up what a file does, folder by folder: [app/](reference/app.md), [components/](reference/components.md), [lib/](reference/lib.md), [lib/ai/](reference/lib-ai.md), [lib/splunk/](reference/lib-splunk.md), [database/](reference/database.md), [the rest](reference/tooling.md) |

## By topic

| Guide | Covers |
|---|---|
| [ai.md](ai.md) | Ask AI, Write SPL, the briefing and Explain: turning AI on, cost, what the AI can see, privacy, and using another AI |
| [ml.md](ml.md) | How unusual runs are found, and how the ML job learns from votes. Its setup is in [ml/README.md](../ml/README.md). |
| [caching-and-loading.md](caching-and-loading.md) | What's cached where, what each loading and error screen means, and sessions across tabs |
| [mongodb-and-access.md](mongodb-and-access.md) | MongoDB in plain words, how fresh data reaches the screen, and where users' groups could come from |
| [report-access.md](report-access.md) | `lib/report-config.ts` in practice: who sees which report, with a worked example |
| [connecting-live-splunk.md](connecting-live-splunk.md) | Replacing the dummy data with a company's Splunk, step by step |
| [splunk-example.md](splunk-example.md) | The connector against a real Splunk before you have access: Splunk Enterprise's trial in Docker, with dummy logs and scheduled reports |
| [splunk-data-and-ai-strategy.md](splunk-data-and-ai-strategy.md) | The longer-term plan: AD sign-in, what to copy, RAG, learning from feedback, an agent with guardrails |
| [google-cloud-migration.md](google-cloud-migration.md) | If application logs move to Google Cloud while security stays in Splunk: reading both, SPL to SQL, the phases, and what to do until then |
| [docker.md](docker.md) | Running everything with `docker compose up`, its settings, and sharing it with a team |
| [kubernetes.md](kubernetes.md) | Running it on Kubernetes or OpenShift with the Helm chart: the images, the secrets, the values, and what to ask the platform team |

## Keeping the docs current

- **A new or moved file** gets an entry in the [file reference](reference/README.md).
- **A new setting** gets a row in [configuration.md](configuration.md), and in `.env.example` if it's an environment variable.
- **A change to how the pieces talk to each other** goes in [architecture.md](architecture.md).
- **A change to the look** (tokens, layout): refresh the 21st design context with `21st init --design-context --refresh` ([configuration.md](configuration.md#look-and-feel)).
