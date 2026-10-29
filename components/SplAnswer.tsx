'use client';

import { useState, useTransition, type CSSProperties } from "react";
import { BookmarkCheck, BookmarkPlus, CircleX, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { saveExampleAction } from "@/app/ai/actions";
import CopyButton from "@/components/CopyButton";
import { checkSpl, queryFromSteps, splunkSearchUrl, stepLine, type StoredSplAnswer as Answer } from "@/lib/ai/spl";

type Props = {
    answer: Answer;
    // Splunk Web's address, for "Open in Splunk". Unset in the demo.
    splunkWebUrl?: string;
    // A just-arrived answer shows its steps one after another, once.
    reveal?: boolean;
    // Sends one of the suggested follow-ups as the next request.
    onFollowUp?: (request: string) => void;
    busy?: boolean;
    // The saved answer's id, for "Save as example", and whether it's saved.
    messageId?: string;
    saved?: boolean;
};

// "Save as example": later requests like this one get it as an example
// (lib/spl-examples.ts). The new state shows at once and is saved in the
// background; if saving fails, it goes back and says why.
function SaveExample({ messageId, initial }: { messageId: string; initial: boolean }) {
    const [saved, setSaved] = useState(initial);
    const [problem, setProblem] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const toggle = () => {
        const next = !saved;
        setSaved(next);
        setProblem(null);
        startTransition(async () => {
            const result = await saveExampleAction(messageId, next).catch(() => null);
            if (!result?.ok) {
                setSaved(!next);
                setProblem(result?.message ?? 'Not saved. Try again.');
            }
        });
    };

    return (
        <>
            <button type="button" className="btn-secondary" aria-pressed={saved} onClick={toggle}>
                {saved ? <BookmarkCheck aria-hidden="true" /> : <BookmarkPlus aria-hidden="true" />}
                {saved ? 'Saved as an example' : 'Save as example'}
            </button>
            {problem && <span className="feedback-error" role="alert">{problem}</span>}
        </>
    )
}

// A search from Write SPL, as a pipeline: the full query, then each step in
// order with what it does. Pointing at a step (or pressing its number)
// highlights its line in the query.
const SplAnswer = ({ answer, splunkWebUrl, reveal = false, onFollowUp, busy = false, messageId, saved = false }: Props) => {
    const [hovered, setHovered] = useState<number | null>(null);
    const [pinned, setPinned] = useState<number | null>(null);
    const highlighted = hovered ?? pinned;

    const query = queryFromSteps(answer.steps);
    const check = checkSpl(query);
    const openUrl = splunkSearchUrl(splunkWebUrl, query);

    // What the built-in SPL checker said before the answer was shown. Older
    // answers have no check.
    const { validation } = answer;
    const parseError = validation && !validation.ok ? validation.message ?? "the search doesn't parse." : null;
    const warnings = [...(parseError ? [`The SPL checker says: ${parseError}`] : []), ...check.warnings];
    const fix = parseError ? `Fix this search. The SPL checker says: ${parseError}` : null;
    // Good examples only read data and parse.
    const canBeExample = Boolean(messageId) && check.readOnly && validation?.ok !== false;

    return (
        <article className="spl-card">
            <p className="spl-summary">{answer.summary}</p>

            <div className="flex flex-row flex-wrap items-center gap-2">
                {check.readOnly ? (
                    <span className="spl-safety">
                        <ShieldCheck aria-hidden="true" />
                        Read-only search
                    </span>
                ) : (
                    <span className="spl-safety risky">
                        <TriangleAlert aria-hidden="true" />
                        Changes data or acts outside the search
                    </span>
                )}
                {parseError && (
                    <span className="spl-safety risky">
                        <CircleX aria-hidden="true" />
                        Doesn&apos;t parse
                    </span>
                )}
                {answer.timeRange && <span className="pill">{answer.timeRange}</span>}
            </div>

            {answer.basedOn && answer.basedOn.length > 0 && (
                <p className="spl-check">Based on similar searches: {answer.basedOn.join('; ')}.</p>
            )}

            {validation?.ok && <p className="spl-check">Checked with the built-in SPL checker: no errors found.</p>}

            {warnings.length > 0 && (
                <ul className="spl-warnings">
                    {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
            )}

            {/* A code block like ChatGPT's: what it is, and Copy, above the code. */}
            <div className="code-block">
                <div className="code-block-head">
                    <span>SPL</span>
                    <CopyButton text={query} label="Copy SPL" className="btn-ghost" />
                </div>
                <pre className="spl spl-query">
                    <code>
                        {answer.steps.map((step, i) => (
                            <span key={i} className={i === highlighted ? 'line is-active' : 'line'}>
                                {stepLine(step, i)}
                            </span>
                        ))}
                    </code>
                </pre>
            </div>

            {(canBeExample || openUrl) && (
                <div className="spl-actions">
                    {canBeExample && messageId && <SaveExample messageId={messageId} initial={saved} />}
                    {openUrl && (
                        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                            <ExternalLink aria-hidden="true" />
                            Open in Splunk
                        </a>
                    )}
                </div>
            )}

            <ol className={reveal ? 'spl-steps reveal' : 'spl-steps'} aria-label="What each step does">
                {answer.steps.map((step, i) => (
                    <li
                        key={i}
                        style={{ '--i': i } as CSSProperties}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <button
                            type="button"
                            className="step-number"
                            aria-pressed={pinned === i}
                            aria-label={`Step ${i + 1}: highlight it in the search`}
                            onClick={() => setPinned(pinned === i ? null : i)}
                        >
                            {i + 1}
                        </button>
                        <code>{step.code}</code>
                        <p>{step.explanation}</p>
                    </li>
                ))}
            </ol>

            {(answer.fields.length > 0 || answer.assumptions.length > 0) && (
                <dl className="spl-facts">
                    {answer.fields.length > 0 && (
                        <div>
                            <dt>Fields it uses</dt>
                            <dd className="flex flex-row flex-wrap gap-1.5">
                                {answer.fields.map((field) => <code key={field}>{field}</code>)}
                            </dd>
                        </div>
                    )}
                    {answer.assumptions.length > 0 && (
                        <div>
                            <dt>Guessed, so check these</dt>
                            <dd>
                                <ul>{answer.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
                            </dd>
                        </div>
                    )}
                </dl>
            )}

            {onFollowUp && (fix || answer.followUps.length > 0) && (
                <div className="chips" role="group" aria-label="Try next">
                    {fix && (
                        <button type="button" className="chip" disabled={busy} onClick={() => onFollowUp(fix)}>
                            Fix the error
                        </button>
                    )}
                    {answer.followUps.map((request) => (
                        <button key={request} type="button" className="chip" disabled={busy} onClick={() => onFollowUp(request)}>
                            {request}
                        </button>
                    ))}
                </div>
            )}
        </article>
    )
}

export default SplAnswer
