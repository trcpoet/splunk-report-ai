import Link from "next/link";
import { PAGE_TRANSITION, PageTransition } from "@/components/Transitions";

// Shown both for reports that don't exist and for reports the viewer may not
// see, so a hidden report's name and existence don't leak.
const ReportNotFound = () => {
    return (
        <PageTransition>
            <section id="report">
                <Link href="/#reports" className="back-link" transitionTypes={PAGE_TRANSITION}>← All reports</Link>

                <div className="header">
                    <h1 className="text-4xl max-sm:text-3xl">Report not found</h1>
                    <p>This report doesn&apos;t exist, or it isn&apos;t shared with your groups. Ask an admin if you need access.</p>
                </div>
            </section>
        </PageTransition>
    )
}

export default ReportNotFound
