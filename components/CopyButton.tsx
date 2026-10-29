'use client';

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
    text: string;
    label: string;
    className?: string;
    // Just the icon, with the words as its name and its tooltip (under answers).
    iconOnly?: boolean;
};

// Copies some text and says so for a moment. If the browser doesn't allow it,
// the button says that instead.
const CopyButton = ({ text, label, className = 'btn-secondary', iconOnly = false }: Props) => {
    const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const copy = async () => {
        clearTimeout(timer.current);
        try {
            await navigator.clipboard.writeText(text);
            setState('done');
        } catch {
            setState('failed');
        }
        timer.current = setTimeout(() => setState('idle'), 2000);
    };

    const words = state === 'done' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label;

    return (
        <button type="button" className={className} onClick={copy} aria-label={iconOnly ? words : undefined} data-tip={iconOnly ? words : undefined}>
            {state === 'done' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {!iconOnly && words}
        </button>
    )
}

export default CopyButton
