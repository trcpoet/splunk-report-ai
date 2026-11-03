import { Suspense, ViewTransition, type ReactNode } from "react";

// Short crossfades for moving between pages and for loading placeholders
// giving way to content. The fades themselves live in globals.css; browsers
// without view transitions swap instantly, as before.

// Pass to <Link transitionTypes> on links that move to another page. Only
// those navigations crossfade; refreshes, the browser's back button and data
// updating in place leave the page still.
export const PAGE_TRANSITION = ['page'];

// Wraps a page's content so it fades out, and the next page fades in, when a
// link tagged with PAGE_TRANSITION is followed.
export const PageTransition = ({ children }: { children: ReactNode }) => (
    <ViewTransition
        enter={{ page: 'page-in', default: 'none' }}
        exit={{ page: 'page-out', default: 'none' }}
        default="none"
    >
        {children}
    </ViewTransition>
)

// A <Suspense> whose placeholder fades out and whose content fades in when it
// arrives. Content that is ready at once (prefetched) just appears.
export const Reveal = ({ fallback, children }: { fallback: ReactNode; children: ReactNode }) => (
    <Suspense fallback={<ViewTransition exit="skeleton-out" default="none">{fallback}</ViewTransition>}>
        <ViewTransition enter="content-in" default="none">{children}</ViewTransition>
    </Suspense>
)
