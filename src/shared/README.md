# `src/shared/`: used everywhere

- `components/` has the page layout and navigation (`Navbar.tsx`, `Transitions.tsx`, `Skeletons.tsx`, `SidePanel.tsx`), plus small pieces any part uses (`Sparkline.tsx`, `Meter.tsx`, `CopyButton.tsx`).
- `ui/` is shadcn's chart wrapper, which the charts are built on. The shadcn tool writes it, so it keeps shadcn's own lint rules.
- `format.ts` writes dates and numbers the same way on the server and in the browser.
- `chart-theme.ts` is the charts' shared styling; `api-reply.ts` reads the app's own API replies in the browser; `analytics.ts` sends PostHog events.

**Open first:** `format.ts`.

**Tests:** `format.test.ts`. **More:** [docs/reference/shared.md](../../docs/reference/shared.md).
