// Only the Splunk REST API fields the sync reads. Every request asks for
// output_mode=json. Splunk sends most values as strings, booleans as true/false
// or "0"/"1", and numbers sometimes as strings, so ./map.ts converts defensively.

export type SplunkBool = boolean | 0 | 1 | '0' | '1' | 'true' | 'false';

export type SplunkAcl = {
    app: string;
    owner: string;
    sharing: string;
    perms?: { read?: string[]; write?: string[] } | null;
};

export type SplunkEntry<Content> = {
    name: string;
    published?: string;
    updated?: string;
    acl?: SplunkAcl;
    content: Content;
};

export type SplunkFeed<Content> = {
    entry: SplunkEntry<Content>[];
    paging?: { total: number; perPage: number; offset: number };
};

// GET /servicesNS/-/-/saved/searches
export type SavedSearchContent = {
    search: string;
    description?: string;
    cron_schedule?: string;
    is_scheduled?: SplunkBool;
    disabled?: SplunkBool;
    // Formatted in the search head's timezone, e.g. "2026-10-03 06:00:00 UTC".
    next_scheduled_time?: string;
    'dispatch.earliest_time'?: string;
    'dispatch.latest_time'?: string;
    // How long a run's results are kept, e.g. "2p" (two schedule periods).
    'dispatch.ttl'?: string;
    'action.email'?: SplunkBool;
    'action.email.to'?: string;
    'display.general.type'?: string;
    'display.visualizations.show'?: SplunkBool;
    'display.visualizations.type'?: string;
    'display.visualizations.charting.chart'?: string;
};

// GET /servicesNS/{owner}/{app}/saved/searches/{name}/history
// One entry per search job; the entry name is the job's sid.
export type HistoryContent = {
    isDone?: SplunkBool;
    isScheduled?: SplunkBool;
};

export type JobMessage = { type: string; text: string };

// GET /services/search/jobs/{sid}
export type JobContent = {
    sid?: string;
    label?: string;
    // QUEUED, PARSING, RUNNING, PAUSED, FINALIZING, FAILED or DONE.
    dispatchState: string;
    isDone?: SplunkBool;
    isFailed?: SplunkBool;
    runDuration?: number | string;
    resultCount?: number | string;
    // An array of { type, text }, or an object keyed by type in some versions.
    messages?: JobMessage[] | Record<string, string[]>;
};

// GET /services/search/v2/jobs/{sid}/results (the v1 results endpoint is disabled).
export type ResultsResponse = {
    fields?: (string | { name: string })[];
    // Multivalue fields arrive as arrays.
    results?: Record<string, string | string[] | null | undefined>[];
    messages?: JobMessage[];
};

// GET /services/apps/local
export type AppContent = {
    label?: string;
};
