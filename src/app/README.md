# `src/app/`: the pages and API routes

Each folder here is a web address, and Next.js reads this folder to build the site:
- `page.tsx` is the page at that address: `page.tsx` here is the home page, and `reports/[slug]/page.tsx` is `/reports/<any report>`.
- `layout.tsx` wraps every page below it: the navbar, the fonts, the background.
- `api/.../route.ts` answers requests from the browser, such as `/api/reports`.
- `error.tsx`, `not-found.tsx` and `loading.tsx` are what you see when something goes wrong or is on its way.

**Open first:** `page.tsx` (the home page) and `reports/[slug]/page.tsx` (a report). They put together parts from `src/reports/`, `src/ai/` and `src/shared/`.

**More:** [docs/reference/app.md](../../docs/reference/app.md), and Next.js's own guide in `node_modules/next/dist/docs/` (this Next.js differs from older ones).
