# Ideas not built yet

Ideas for making the app more useful, with the smallest version of each that would work. **None of these are built**; what has been built moves to [Built from this list](#built-from-this-list). Each one is a separate change, and gets agreed before it starts. The list is ranked: quick wins first.

## Quick wins

| Idea | What it gives people | The smallest version |
|---|---|---|
| **Jump to a report with ⌘K** | Open any report, or start an Ask AI question, from anywhere without scrolling. | shadcn's `Command` (cmdk) over the report titles and tags the page already has. |

## Bigger

| Idea | What it gives people |
|---|---|
| **What changed since the last run** | "2 new hosts above the 5xx budget", "web-prod-03 is back under it": new and removed rows between the two newest runs. |
| **Highlighted SPL and "Open in Splunk" links** | Easier-to-read searches (Shiki has a Splunk grammar), and a link from a row to the same search in Splunk. |
| **A country map** | "VPN Sessions by Country" as a map instead of a table. |
| **Pinned reports** | Each person pins the reports they care about, and a "My reports" filter shows only those. |
| **Acknowledge a warning** | Someone marks a warning as seen, with a note. The card shows who and when, and it clears at the next change of status. |
| **Reliability per report** | "96% healthy runs in the last 30 days", from the run history the app already keeps. |

## Later: these need admin sign-in or a company's approval

- A daily digest by email or a chat channel.
- Editing cards in the app instead of in `config/report-cards.yaml`.
- Single sign-on, with groups from the company's identity provider ([splunk-data-and-ai-strategy.md](splunk-data-and-ai-strategy.md)).

## Where report icons come from

Report icons are built (see [The icon](adding-report-cards.md#the-icon)). These notes record why they work the way they do.

- **Lucide** (lucide.dev, ISC license) is the app's icon set. It was already installed and matches the app's line style. Its icons are bundled when the app is built, so the app calls no outside service, which matters inside a company.
- **If Lucide lacks an icon,** Tabler Icons (MIT) is the closest in style. Iconify (icones.js.org) searches 200,000+ icons across sets and is good for finding one, but don't load icons from its API at runtime: that's an outside service.
- **For bigger pictures,** such as an empty page or the sign-in page, IBM's Carbon pictograms (Apache 2.0) suit security and infrastructure.
- **Logos of data sources** (Simple Icons, or the AWS, Azure and Google Cloud icon packs) could one day mark which system a report reads from. Logos come with trademark rules.
- **AI image generators** draw icons with uneven styles, as files someone has to review and store, and a company network usually can't reach them. That's why the app **picks** an icon from a fixed list (by the report's words, or the card's `icon:`) instead of drawing one. A later option is an AI that picks from the same list. It isn't needed while the word rules work.

## Built from this list

- **Report icons:** an icon beside each report's category, picked from its words or set with `icon:` ([The icon](adding-report-cards.md#the-icon)).
- **Runbook and contact on each card:** `runbook:` and `contact:` in a card. When the report warns or fails, its page says what to do and who to ask, and the briefing links the runbook ([the fields](adding-report-cards.md#the-basics)). A card can't hold a second link (the whole card is one), so the card itself doesn't show them.
- **A "Late" badge:** when a run that was due hasn't reached the app (more than 15 minutes, or twice the report's usual run time, after it was due), the report shows **Late** beside its status, counts as needing attention, and can be filtered. It's worked out at each sync from the schedule and Splunk's next run (`lateSince` in `src/splunk/map.ts`), so it works on the demo data too, where "Web Requests by Host" is late.
- **Filters in the address:** the home page's search, status, category and page are in the address (`/?status=warning&category=security`), so a filtered list can be shared or bookmarked, and Back from a report finds it as it was (`src/reports/filters.ts`).
