import { pipeCommands, type SplValidation } from '@/lib/ai/spl';
import { splunkParse } from '@/lib/splunk/parser';

// Checks a Write SPL search before it's shown, without running it:
// - with Splunk's own parser, when the web app has a parse-only token
//   (SPLUNK_BASE_URL and SPLUNK_PARSER_TOKEN; see lib/splunk/parser.ts);
// - otherwise, or when Splunk can't be reached, with demoParse below, a small
//   parser that catches the usual mistakes.
// Server code: it reads the token from the environment.

// Splunk's built-in search commands, plus the Machine Learning Toolkit's. Apps
// can add their own commands, which only Splunk's parser knows.
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

export type ParseResult = { ok: true } | { ok: false; message: string };

// Quotes, brackets and parentheses that never close (or close too early).
function unbalanced(query: string): string | null {
    let quoted = false;
    const open: string[] = [];
    const closes: Record<string, string> = { ')': '(', ']': '[' };

    for (let i = 0; i < query.length; i++) {
        const char = query[i];
        if (quoted) {
            if (char === '\\') i++;
            else if (char === '"') quoted = false;
            continue;
        }
        if (char === '"') quoted = true;
        else if (char === '(' || char === '[') open.push(char);
        else if (char in closes) {
            if (open.pop() !== closes[char]) return `Unbalanced ${char === ')' ? 'parentheses' : 'square brackets'}.`;
        }
    }
    if (quoted) return 'Unbalanced quotes.';
    if (open.length > 0) return `Unbalanced ${open.at(-1) === '(' ? 'parentheses' : 'square brackets'}.`;
    return null;
}

// The demo parser: what Splunk's parser would reject most often. A search that
// passes may still fail in Splunk (an unknown field, a macro, an app's own
// command), so the page says which parser checked it.
export function demoParse(query: string): ParseResult {
    const text = query.trim();
    if (!text) return { ok: false, message: 'The search is empty.' };

    const balance = unbalanced(text);
    if (balance) return { ok: false, message: balance };

    // A pipe with nothing after it, such as "index=web | | stats count" or a
    // trailing pipe. Quoted text is left out: a pipe there is just a character.
    const unquoted = text.replace(/"(?:\\.|[^"\\])*"/g, '""');
    if (/\|\s*(\||\]|$)/.test(unquoted)) return { ok: false, message: "Missing a search command after '|'." };

    const unknown = pipeCommands(text).find((command) => !SPL_COMMANDS.has(command));
    if (unknown) return { ok: false, message: `Unknown search command '${unknown}'.` };

    return { ok: true };
}

type ValidateOptions = { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch };

export async function validateSpl(query: string, { env = process.env, fetchImpl }: ValidateOptions = {}): Promise<SplValidation> {
    const baseUrl = env.SPLUNK_BASE_URL;
    const token = env.SPLUNK_PARSER_TOKEN;

    if (baseUrl && token) {
        try {
            const result = await splunkParse({ baseUrl, token, query, fetchImpl });
            return result.ok ? { ok: true, by: 'splunk' } : { ok: false, by: 'splunk', message: result.message };
        } catch (error) {
            console.error("Couldn't reach Splunk's parser, so the demo parser checked the search:", error);
        }
    }

    const result = demoParse(query);
    return result.ok ? { ok: true, by: 'demo' } : { ok: false, by: 'demo', message: result.message };
}
