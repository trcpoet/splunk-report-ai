'use client';

import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

// What every side panel (a bottom sheet on phones) shares: this one and
// Explain's (components/ExplainButton.tsx). It's a native modal <dialog>, so
// focus moves into it, Esc closes it, and focus returns to the button that
// opened it. `open` says whether to render what's inside, so its browser
// parts load only for people who look.
export function usePanel() {
    const dialog = useRef<HTMLDialogElement>(null);
    const [open, setOpen] = useState(false);

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

    // For the <dialog>. A click on the dimmed backdrop lands on the dialog
    // itself, outside its box. (A click on the panel's own padding lands on it
    // too, inside.)
    const dialogProps = {
        ref: dialog,
        onClose: () => setOpen(false),
        onClick: (event: MouseEvent<HTMLDialogElement>) => {
            const box = event.currentTarget.getBoundingClientRect();
            const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
            if (event.target === event.currentTarget && outside) close();
        },
    };

    return { open, show, close, dialogProps };
}

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

// A button that opens a side panel, for the Ask AI top bar. A link inside
// closes the panel as it opens another page or chat.
const SidePanel = ({ label, title, icon, badge, children }: Props) => {
    const panel = usePanel();
    const headingId = useId();

    const onClick = (event: MouseEvent<HTMLDialogElement>) => {
        panel.dialogProps.onClick(event);
        if ((event.target as Element).closest('a[href]')) panel.close();
    };

    return (
        <>
            <button type="button" className="topbar-button" onClick={panel.show} aria-haspopup="dialog">
                {icon}
                <span className="max-sm:sr-only">{label}</span>
                {badge}
            </button>
            <dialog {...panel.dialogProps} onClick={onClick} className="explain-panel" aria-labelledby={headingId}>
                {panel.open && (
                    <div className="explain-content">
                        <header className="explain-head">
                            <h2 id={headingId}>{title}</h2>
                            <button type="button" className="icon-button" onClick={panel.close} aria-label="Close">
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
