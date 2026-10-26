// Signing in or out in one tab reloads the app's other open tabs. A full page
// load drops the pages a tab has cached for the previous session (prefetched
// pages hold the signed-in user's reports for up to 5 minutes), so no tab keeps
// showing one person's reports after someone else signs in on that browser.

const CHANNEL = 'splunkevents-session';

// Tells this tab's own messages apart from other tabs'. Made on first use, in
// the browser (randomUUID needs https or localhost, hence the fallback).
let tab: string | undefined;
const tabId = () => (tab ??= typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function announceSessionChange() {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ from: tabId() });
    channel.close();
}

// Returns a function that stops listening.
export function onSessionChange(callback: () => void) {
    if (typeof BroadcastChannel === 'undefined') return () => {};

    const from = tabId();
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<{ from?: string }>) => {
        if (event.data?.from !== from) callback();
    };
    return () => channel.close();
}
