import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_TRANSITION, PageTransition } from "@/components/Transitions";

export const metadata: Metadata = {
    title: 'Page not found | SplunkEvents',
};

// For addresses that match no page. Reports that are missing or hidden from
// the viewer have their own page (app/reports/[slug]/not-found.tsx).
const NotFound = () => (
    <PageTransition>
        <section className="status-page" aria-labelledby="not-found-title">
            <h1 id="not-found-title" className="text-4xl max-sm:text-3xl">Page not found</h1>
            <p>There’s no page at this address. The link may be old or mistyped.</p>
            <div className="actions">
                <Link href="/#reports" className="btn-primary" transitionTypes={PAGE_TRANSITION}>Browse reports</Link>
                <Link href="/" className="btn-secondary" transitionTypes={PAGE_TRANSITION}>Go to overview</Link>
            </div>
        </section>
    </PageTransition>
)

export default NotFound
