import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { contactEmail } from "@/reports/reports";

// What a report's card says to do when it warns or fails: a runbook link and
// who to ask (config/report-cards.yaml, `runbook:` and `contact:`). Used by
// the report page and the briefing.

// Opens in a new tab, so the report stays open beside it.
export const RunbookLink = ({ href, children = 'Open the runbook' }: { href: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="runbook-link">
        {children}
        <ExternalLink aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
    </a>
);

// An email address becomes a mail link; anything else is shown as written.
export const Contact = ({ contact }: { contact: string }) => {
    const email = contactEmail(contact);
    return email ? <a href={`mailto:${email}`}>{email}</a> : <>{contact}</>;
};

// One sentence for under a warning: "What to do: open the runbook, or ask sre@example.com."
export const WhatToDo = ({ runbook, contact }: { runbook?: string; contact?: string }) => {
    if (!runbook && !contact) return null;
    return (
        <p className="what-to-do">
            {runbook ? (
                <>
                    What to do: <RunbookLink href={runbook}>open the runbook</RunbookLink>
                    {contact && <>, or ask <Contact contact={contact} /></>}.
                </>
            ) : (
                <>Who to ask: <Contact contact={contact ?? ''} />.</>
            )}
        </p>
    );
};
