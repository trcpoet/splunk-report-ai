'use client';

import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
    // The button's words (hidden on phones, but still its name there).
    label: string;
    // The panel's heading.
    title: string;
    icon: ReactNode;
    // Shown on the button, such as how many reports need attention.
    badge?: ReactNode;
    children: ReactNode;
};

// A button that opens a side panel (a bottom sheet on phones), like Explain's
// in components/ExplainButton.tsx. It's a native <dialog>, so focus moves into
// it, Esc closes it, and focus returns to the button. What's inside mounts
// only while it's open, so nothing in it loads for people who never look.
const SidePanel = ({ label, title, icon, badge, children }: Props) => {
    const dialog = useRef<HTMLDialogElement>(null);
    const [open, setOpen] = useState(false);
    const headingId = useId();

    // Next keeps a page you leave, hidden, and runs this cleanup then. A modal
    // dialog left open on a hidden page would still block the page you're on.
    useLayoutEffect(() => {
        const node = dialog.current;
        return () => node?.close();
    }, []);

    const show = () => {
        setOpen(true);
        dialog.current?.showModal();
    };
    const close = () => dialog.current?.close();

    const onClick = (event: MouseEvent<HTMLDialogElement>) => {
        // A click on the dimmed backdrop lands on the dialog itself, outside
        // its box. (A click on the panel's own padding lands on it too, inside.)
        const box = event.currentTarget.getBoundingClientRect();
        const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
        if (event.target === event.currentTarget && outside) close();
        // A link inside opens another page or chat: the panel closes as it goes.
        else if ((event.target as Element).closest('a[href]')) close();
    };

    return (
        <>
            <button type="button" className="topbar-button" onClick={show} aria-haspopup="dialog">
                {icon}
                <span className="max-sm:sr-only">{label}</span>
                {badge}
            </button>
            <dialog ref={dialog} className="explain-panel" aria-labelledby={headingId} onClose={() => setOpen(false)} onClick={onClick}>
                {open && (
                    <div className="explain-content">
                        <header className="explain-head">
                            <h2 id={headingId}>{title}</h2>
                            <button type="button" className="icon-button" onClick={close} aria-label="Close">
                                <X aria-hidden="true" />
                            </button>
                        </header>
                        {children}
                    </div>
                )}
            </dialog>
        </>
    )
}

export default SidePanel
