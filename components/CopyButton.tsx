'use client';

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

// Copies some text and says so for a moment. If the browser doesn't allow it,
// the button says that instead.
const CopyButton = ({ text, label, className = 'btn-secondary' }: { text: string; label: string; className?: string }) => {
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

    return (
        <button type="button" className={className} onClick={copy}>
            {state === 'done' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {state === 'done' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
        </button>
    )
}

export default CopyButton
