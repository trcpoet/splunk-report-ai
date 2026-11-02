'use client';

// Previous and Next for something shown a page at a time, with where you are.
// The results table and the report list share it, so both page the same way.

type Props = {
    // Names the buttons' group for screen readers, such as "Table pages".
    label: string;
    // Where you are, such as "Rows 1 to 25 of 312" or "Page 2 of 16".
    status: string;
    // Read the status out when it changes. Off when another live region on the
    // page already says the same.
    announce?: boolean;
    canPrevious: boolean;
    canNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
};

const Pager = ({ label, status, announce = true, canPrevious, canNext, onPrevious, onNext }: Props) => {
    // aria-disabled, not disabled: a disabled button loses the keyboard focus,
    // which would drop someone paging through at the last page.
    const button = (text: string, canGo: boolean, go: () => void) => (
        <button type="button" className="btn-secondary btn-small" aria-disabled={!canGo} onClick={() => { if (canGo) go(); }}>
            {text}
        </button>
    );

    return (
        <div className="pager" role="group" aria-label={label}>
            <span aria-live={announce ? 'polite' : undefined}>{status}</span>
            {button('Previous', canPrevious, onPrevious)}
            {button('Next', canNext, onNext)}
        </div>
    );
};

export default Pager;
