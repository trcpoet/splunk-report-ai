# Caching, loading and page transitions

A plain-language guide to what SplunkEvents keeps ready ahead of time, what you see while something loads, and what happens when something goes wrong.

## The short version

- **Report data is cached on the server** and cleared by every sync, so pages don't query MongoDB for the same reports over and over.
- **Your own pages are cached in your browser for up to 5 minutes.** Moving between the overview and a report is instant. Signing in or out clears this cache.
- **Pointing at a report card loads that report in the background** (hover, keyboard focus or touch), so it opens at once.
- **While something loads, you see grey placeholders the same size as what's coming**, so nothing jumps around.
- **If the database doesn't answer within 5 seconds**, the page says so and offers **Try again**, instead of hanging.

## What's cached where

| What | Where | How long | What clears it |
|---|---|---|---|
| Reports, results, run counts, last sync time | Server memory (`'use cache'` in `lib/dal.ts`, tag `reports`) | Up to a minute, then refreshed in the background on the next visit | Every sync (`npm run sync` calls `POST /api/revalidate`) |
| Who you are and your groups | Your browser only (`'use cache: private'` in `lib/dal.ts`), never the server | 5 minutes | Signing in or out (both reload the page), and the automatic refresh once a minute |
| Pages you visited | Your browser: Next keeps the last 3 pages, with their filters and scroll position | While the tab is open | Leaving the app or reloading |
| Pages a link leads to | Your browser (prefetched before you click) | 5 minutes | Same as above |
| Your chats and 👍 / 👎 votes | Not cached: read from MongoDB for every request (`connection()` in `lib/chats.ts` and `lib/feedback.ts`) | — | — |

Each server instance on Vercel has its own memory, so a freshly started one reads MongoDB once before its cache is warm.

The sync and the ML job ask the app to refresh twice, 3 seconds apart. A page that was still reading the old data when the first request arrived would otherwise put that old data back into the cache, and people would see it for up to a minute.

For developers: a page that reads MongoDB without `'use cache'` must call `await connection()` (from `next/server`) before the read, inside a `<Suspense>` or `<Reveal>` boundary, as `getVotes()` and `listChats()` do. Next prerenders each page's shell for the signed-in person, and the database driver reads the clock, so without it `next dev` reports "Next.js encountered the unstable value `Date.now()` while prerendering".

**When access changes or a session ends:**
- Signing in or out reloads every other open tab of the app in that browser, so no tab keeps showing the previous person's reports.
- The browser's **Back** and **Forward** buttons can bring a whole page back from the browser's cache (Vercel serves pages as cacheable). A small script in `app/layout.tsx` hides such a page before it shows and loads it again, so after signing out, Back shows the sign-in page instead of the old reports. Back and Forward inside the app are unaffected.
- If a session ends some other way (it expires, or is ended on the server), the next automatic refresh sends the tab to the sign-in page, which reloads to drop the cached pages.
- An admin changing someone's groups reaches their open tab within a minute for the page on screen, and within 5 minutes for pages already loaded in the background. Those pages only hold what the person could already see.
- The database connections give up after 5 seconds in the web app only. The sync worker and the seed script keep the driver's 30 seconds, so their writes ride out a brief Atlas primary election.

Open pages still refresh themselves once a minute (`components/AutoRefresh.tsx`), so new sync results show up without a reload. A tab you come back to catches up at once, unless it refreshed in the last minute. The sign-in page never refreshes, and neither do the Ask AI pages: a refresh in the middle of an answer would reset the chat. Each question there reads the latest report data anyway.

## Loading pages before you click

- **Every link on screen loads the next page's frame in the background.** Because "who you are" is cached in your browser, the overview's frame already includes your stats, chart and report list, so **Overview**, **All Reports** and **← All reports** show it at once.
- **Report cards load their report's content when you point at one.** Only the cards you point at cost a request, not every card on the page.
- This only happens in a production build (`npm run build` then `npm start`, or the hosted demo). `npm run dev` loads each page when you click.

## What you see while something loads

- **Placeholders** (`components/Skeletons.tsx`) for the overview, the report list, a report page and the user menu. They're built from the same styles as the real content, so they take the same space and the page doesn't jump when the content arrives.
- **Charts** show a quiet placeholder until they have drawn.
- **A thin bar along the top of a report card** if its report takes longer than 150 ms to open (a slow network, or a click before the background load finished).
- **Buttons say what they're doing:** a spinner with "Signing in…" or "Signing out…", "Copied" after **Copy SPL query**, and "Downloaded" after **Download CSV**. If copying isn't allowed, a message says to select the query and copy it by hand.
- **The sign-in form is part of the page itself**, so it shows immediately instead of after a round trip to the server.

## Page transitions

- Following a link crossfades the old page into the new one, in about a quarter of a second. When a placeholder gives way to the real content, that crossfades too.
- Nothing moves when the page refreshes itself, when you use the browser's back button, or when data changes in place.
- **Browse Reports** glides down to the list. Other scrolling, such as moving to a new page, is instant.
- **Reduced motion** (a system setting): no fades, no gliding, and the background light rays stay still.
- Browsers without view transitions simply swap pages instantly.

For developers: the fades live in `components/Transitions.tsx` and at the end of `app/globals.css`. A new page should wrap its content in `<PageTransition>`, and a link that moves to another page should pass `transitionTypes={PAGE_TRANSITION}`. Use `<Reveal fallback={…}>` instead of `<Suspense>` to get the placeholder crossfade.

## When something goes wrong

| What happened | What you see |
|---|---|
| The database doesn't answer | After 5 seconds: "Couldn't load this page", with **Try again**, **Go to overview** and an error ID that matches the server logs (`app/error.tsx`). The user menu keeps its **Sign out** button. |
| A chart can't be drawn (say, live results in an unexpected shape) | "This chart couldn't be drawn. The table has every value." The rest of the page still works (`components/ChartBoundary.tsx`). |
| An address that matches no page | "Page not found", with links back (`app/not-found.tsx`) |
| A report that's missing or not shared with you | "Report not found". Both cases look the same, so a hidden report's name doesn't leak. |
| Sign-in fails | A message for the actual reason: wrong email or password, too many attempts, the sign-in service is unreachable, or signing in from an address that isn't allowed (such as a per-deployment Vercel URL). |

## Ideas for later

- **Session cookie cache** (Better Auth `session.cookieCache`): skips the database read for the session on most requests. It saves only 1–3 ms per request here, and a session ended elsewhere would stay valid until the cookie expires.
- **`'use cache: remote'`**: shares the server cache between Vercel instances. Worth it once traffic is high enough that most requests would hit it.
- **One MongoDB client for Mongoose and Better Auth**: one connection setup on a cold start instead of two. They already start in parallel.
- **End-to-end tests** with `@next/playwright`'s `instant()` helper, so CI catches a navigation that stops being instant. CI would need its own MongoDB.
- **The rest of roadmap step 6**: a report card that morphs into the report page's header, and sliding forward and back.
