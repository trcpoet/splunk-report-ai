// The model names a report by writing its id in double brackets, such as
// [[web-5xx-error-rate]], and the chat shows each one as a link to the report.
// Only reports the person may see become links; any other id is dropped, so
// the answer can't point at a report they can't open.

const MARKER = /\[\[([a-z0-9-]+)\]\]/g;

// While an answer streams in, its last characters can be half a marker
// ("… see [[web-5"). Those wait until the rest arrives.
const PARTIAL_MARKER = /\[\[?[a-z0-9-]*\]?$/;

// Replaces each [[report-id]] marker with what `replace` returns for its id.
export const replaceReportMarkers = (text: string, replace: (slug: string) => string) =>
    text.replace(MARKER, (_, slug: string) => replace(slug));

// Markdown with each marker turned into a link to /reports/<slug>. The links
// have no text: the chat fills in the report's name and status (ChatAnswer).
export function linkReports(markdown: string, visibleSlugs: ReadonlySet<string>, streaming = false): string {
    const text = streaming ? markdown.replace(PARTIAL_MARKER, '') : markdown;
    return replaceReportMarkers(text, (slug) => (visibleSlugs.has(slug) ? `[](/reports/${slug})` : ''));
}

// The report ids an answer mentions, in order, each once.
export const mentionedReports = (markdown: string, visibleSlugs: ReadonlySet<string>) =>
    [...new Set([...markdown.matchAll(MARKER)].map(([, slug]) => slug))].filter((slug) => visibleSlugs.has(slug));
