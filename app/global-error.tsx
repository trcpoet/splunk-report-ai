'use client';

import "./globals.css";

type Props = {
    error: Error & { digest?: string };
    retry: () => void;
};

// Replaces the whole document when the root layout itself fails, so it brings
// its own <html>, <body> and styles. Page-level problems use app/error.tsx.
const GlobalError = ({ error, retry }: Props) => (
    <html lang="en">
        <body className="min-h-screen antialiased">
            <title>Something went wrong | SplunkEvents</title>
            <main id="content">
                <section className="status-page" aria-labelledby="error-title">
                    <h1 id="error-title" className="text-4xl max-sm:text-3xl">SplunkEvents couldn’t load</h1>
                    <p>Something went wrong on our side. Try again in a moment.</p>
                    <div className="actions">
                        <button type="button" className="btn-primary" onClick={() => retry()}>Try again</button>
                    </div>
                    {error.digest && <p className="error-id">Error ID <code>{error.digest}</code></p>}
                </section>
            </main>
        </body>
    </html>
)

export default GlobalError
