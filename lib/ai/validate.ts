import { pipeCommands, type SplValidation } from '@/lib/ai/spl';

// Checks a Write SPL search before it's shown, without running it. It catches
// what Splunk rejects most often: unknown commands, quotes or brackets that
// never close, and a pipe with nothing after it. A search that passes can still
// fail in Splunk (an unknown field, a macro, an app's own command).

// Splunk's built-in search commands, plus the Machine Learning Toolkit's. Apps
// can add their own commands, which only Splunk knows.
const SPL_COMMANDS = new Set([
    'abstract', 'accum', 'addcoltotals', 'addinfo', 'addtotals', 'analyzefields', 'anomalies', 'anomalousvalue',
    'anomalydetection', 'append', 'appendcols', 'appendpipe', 'apply', 'arules', 'associate', 'audit', 'autoregress',
    'bin', 'bucket', 'bucketdir', 'chart', 'cluster', 'cofilter', 'collect', 'concurrency', 'contingency', 'convert',
    'correlate', 'ctable', 'datamodel', 'dbinspect', 'dedup', 'delete', 'deletemodel', 'delta', 'diff', 'dump',
    'erex', 'eval', 'eventcount', 'eventstats', 'extract', 'fieldformat', 'fields', 'fieldsummary', 'filldown',
    'fillnull', 'findkeywords', 'findtypes', 'fit', 'folderize', 'foreach', 'format', 'from', 'fromjson', 'gauge',
    'gentimes', 'geom', 'geomfilter', 'geostats', 'head', 'highlight', 'history', 'iconify', 'inputcsv',
    'inputlookup', 'iplocation', 'join', 'kmeans', 'kv', 'kvform', 'listmodels', 'loadjob', 'localize', 'localop',
    'lookup', 'makecontinuous', 'makejson', 'makemv', 'makeresults', 'map', 'mcatalog', 'mcollect', 'metadata',
    'metasearch', 'meventcollect', 'mpreview', 'msearch', 'mstats', 'multikv', 'multisearch', 'mvcombine',
    'mvexpand', 'nomv', 'outlier', 'outputcsv', 'outputlookup', 'outputtext', 'overlap', 'pivot', 'predict',
    'rangemap', 'rare', 'redistribute', 'regex', 'reltime', 'rename', 'replace', 'require', 'rest', 'return',
    'reverse', 'rex', 'rtorder', 'run', 'sample', 'savedsearch', 'score', 'script', 'scrub', 'search', 'searchtxn',
    'selfjoin', 'sendalert', 'sendemail', 'set', 'setfields', 'sichart', 'sirare', 'sistats', 'sitimechart', 'sitop',
    'sort', 'spath', 'stats', 'strcat', 'streamstats', 'summary', 'table', 'tags', 'tail', 'timechart', 'timewrap',
    'tojson', 'top', 'transaction', 'transpose', 'trendline', 'tscollect', 'tstats', 'typeahead', 'typelearner',
    'typer', 'union', 'uniq', 'untable', 'walklex', 'where', 'x11', 'xmlkv', 'xmlunescape', 'xpath', 'xyseries',
]);

// Quotes, brackets and parentheses that never close (or close too early).
// Macros (`name(args)`) count as quoted: their arguments are Splunk's to check.
function unbalanced(query: string): string | null {
    let quote: '"' | '`' | null = null;
    const open: string[] = [];
    const closes: Record<string, string> = { ')': '(', ']': '[' };

    for (let i = 0; i < query.length; i++) {
        const char = query[i];
        if (quote) {
            if (char === '\\' && quote === '"') i++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === '`') quote = char;
        else if (char === '(' || char === '[') open.push(char);
        else if (char in closes) {
            if (open.pop() !== closes[char]) return `Unbalanced ${char === ')' ? 'parentheses' : 'square brackets'}.`;
        }
    }
    if (quote === '"') return 'Unbalanced quotes.';
    if (quote === '`') return 'A macro is missing its closing backtick.';
    if (open.length > 0) return `Unbalanced ${open.at(-1) === '(' ? 'parentheses' : 'square brackets'}.`;
    return null;
}

// The built-in SPL checker. It's quick and needs nothing else, so the page runs
// it each time it shows an answer (components/SplAnswer.tsx).
export function validateSpl(query: string): SplValidation {
    const text = query.trim();
    if (!text) return { ok: false, message: 'The search is empty.' };

    const balance = unbalanced(text);
    if (balance) return { ok: false, message: balance };

    // Quoted text and macros are left out of the checks below: a pipe there is
    // just a character.
    const unquoted = text.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/`[^`]*`/g, '``');

    // A pipe with nothing after it, such as "index=web | | stats count" or a
    // trailing pipe.
    if (/\|\s*(\||\]|$)/.test(unquoted)) return { ok: false, message: "Missing a search command after '|'." };

    // After a pipe comes a command name or a macro, never something like "123abc".
    const odd = unquoted.match(/\|\s*([^a-zA-Z_`\s][^\s|]*)/);
    if (odd) return { ok: false, message: `Unknown search command '${odd[1]}'.` };

    const unknown = pipeCommands(unquoted).find((command) => !SPL_COMMANDS.has(command));
    if (unknown) return { ok: false, message: `Unknown search command '${unknown}'.` };

    return { ok: true };
}
