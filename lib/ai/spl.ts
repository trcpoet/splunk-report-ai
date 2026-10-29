import { z } from 'zod';

// Everything about the searches the Write SPL tab produces: the shape Gemini
// must answer in, how the steps become one query, and a safety check. Pure, so
// the browser, the server and the tests share it.

// Gemini fills this in (it's sent as a JSON Schema). The query is the steps
// joined with pipes, so a step's explanation always matches its code.
export const SplAnswerSchema = z.object({
    summary: z.string().describe('One or two plain sentences: what the search finds.'),
    steps: z
        .array(
            z.object({
                code: z.string().describe('One SPL command exactly as it goes in the search, without the leading pipe. The first step is the base search, starting with index= and sourcetype=.'),
                explanation: z.string().describe('What this step does, in one plain sentence.'),
            }),
        )
        .min(1)
        .max(15)
        .describe('The search, one step per pipe command, in order.'),
    timeRange: z.string().describe('The time range to pick in Splunk, e.g. "Last 24 hours", or how the search sets it.'),
    fields: z.array(z.string()).max(20).describe('The fields the search relies on.'),
    assumptions: z.array(z.string()).max(8).describe('Anything guessed, such as an index or field name the reports do not show. Empty when nothing was guessed.'),
    followUps: z.array(z.string()).max(3).describe('Up to three short follow-up requests the person might send next, e.g. "Only show the last 7 days".'),
});

export type SplAnswer = z.infer<typeof SplAnswerSchema>;
export type SplStep = SplAnswer['steps'][number];

// One step as a line of the search: the first is the base search, the rest
// start with a pipe. Used both for what's shown and what's copied, so they match.
export const stepLine = ({ code }: SplStep, index: number) => {
    const line = code.trim().replace(/\s*\n\s*/g, ' ').replace(/^\|\s*/, '');
    return index === 0 ? line : `| ${line}`;
};

// The steps as one search, a pipe command per line (like the reports' SPL).
export const queryFromSteps = (steps: SplStep[]) => steps.map(stepLine).join('\n');

// The command after every pipe (including pipes inside [subsearches]).
// "index=web | stats count | sort - count" → ['stats', 'sort'].
//
// Pipes inside "double quotes" are text, not commands. SPL's string literals
// use double quotes; an apostrophe is just a character (user=o'brien). A quote
// that never closes would hide everything after it, so then every pipe counts:
// for a safety check, reporting too much is better than missing a command.
export function pipeCommands(spl: string): string[] {
    const scan = (quotes: boolean) => {
        const commands: string[] = [];
        let quoted = false;

        for (let i = 0; i < spl.length; i++) {
            const char = spl[i];
            if (quotes && quoted) {
                if (char === '\\') i++;
                else if (char === '"') quoted = false;
                continue;
            }
            if (quotes && char === '"') quoted = true;
            else if (char === '|') {
                const word = spl.slice(i + 1).match(/^\s*([a-zA-Z_][\w-]*)/);
                if (word) commands.push(word[1].toLowerCase());
            }
        }
        return { commands, closed: !quoted };
    };

    const careful = scan(true);
    return careful.closed ? careful.commands : scan(false).commands;
}

// Commands that change data or do something outside the search, and what they do.
const ACTION_COMMANDS: Record<string, string> = {
    delete: 'deletes events from an index',
    outputlookup: 'writes to a lookup',
    outputcsv: 'writes a CSV file on the search head',
    collect: 'writes results into a summary index',
    mcollect: 'writes results into a metrics index',
    meventcollect: 'writes results into a metrics index',
    tscollect: 'writes results into a tsidx file',
    dump: 'writes results to files on the search head',
    sendemail: 'sends email',
    sendalert: 'runs an alert action',
    script: 'runs a script on the search head',
    run: 'runs a script on the search head',
    map: 'runs a separate search for every result, which can be very slow',
    rest: 'reads Splunk settings through the REST API',
};

export type SplCheck = {
    // True when the search only reads events.
    readOnly: boolean;
    // Plain-English notes, worst first.
    warnings: string[];
};

// What to know before running a search. The app never runs searches itself.
export function checkSpl(spl: string): SplCheck {
    const commands = new Set(pipeCommands(spl));
    const actions = Object.entries(ACTION_COMMANDS).filter(([command]) => commands.has(command));
    const warnings = actions.map(([command, does]) => `${command} ${does}.`);

    const base = spl.trim().split('|')[0];
    const generating = spl.trim().startsWith('|');
    if (!generating && /\bindex\s*=\s*\*/.test(base)) {
        warnings.push('index=* searches every index you can see, which is slow. Name the index instead.');
    } else if (!generating && !/\bindex\s*=/.test(base)) {
        warnings.push('No index is named, so Splunk searches your default indexes. Name the index to make it faster.');
    }

    return { readOnly: actions.length === 0, warnings };
}

// A link that opens the search in Splunk Web, or null when SPLUNK_WEB_URL isn't
// set. Splunk runs the search only when the person presses Enter there.
export function splunkSearchUrl(webUrl: string | undefined, spl: string): string | null {
    if (!webUrl) return null;
    const search = spl.trim().startsWith('|') ? spl.trim() : `search ${spl.trim()}`;
    return `${webUrl.replace(/\/$/, '')}/app/search/search?q=${encodeURIComponent(search)}`;
}
