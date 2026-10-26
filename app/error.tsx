'use client';

import Link from "next/link";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { PAGE_TRANSITION } from "@/components/Transitions";

type Props = {
    error: Error & { digest?: string };
    retry: () => void;
};

// Shown when a page can't load, most often because the report database didn't
// answer. "Try again" fetches the page again without a full reload. The ID
// matches the error in the server logs.
const ErrorPage = ({ error, retry }: Props) => {
    const [retrying, startRetry] = useTransition();

    return (
        <section className="status-page" aria-labelledby="error-title">
            <h1 id="error-title" className="text-4xl max-sm:text-3xl">Couldn’t load this page</h1>
            <p>The report data didn’t come through. It’s usually back within a minute, so try again shortly.</p>

            <div className="actions">
                <button type="button" className="btn-primary" onClick={() => startRetry(retry)} disabled={retrying} aria-busy={retrying}>
                    {retrying && <LoaderCircle aria-hidden="true" className="spinner" />}
                    {retrying ? 'Trying again…' : 'Try again'}
                </button>
                <Link href="/" className="btn-secondary" transitionTypes={PAGE_TRANSITION}>Go to overview</Link>
            </div>

            {error.digest && <p className="error-id">Error ID <code>{error.digest}</code></p>}
        </section>
    )
}

export default ErrorPage
