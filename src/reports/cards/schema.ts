import { z } from 'zod';
import { ICON_NAMES } from '@/reports/icons';

// What config/report-cards.yaml may hold: one entry per report, keyed by the
// report's exact Splunk name. The descriptions here are also the help an editor
// or an AI sees, through config/report-cards.schema.json (npm run cards:schema).
// docs/adding-report-cards.md explains it with examples.

const Column = z.string().min(1).describe("A column of the report's results, spelled exactly as in its search's last step.");

// A number worked out from the results.
const NumberValue = z.union([
    z.object({ count: z.literal('results') }).strict().describe('How many results the run had.'),
    z.object({ sum: Column }).strict().describe('The total of a column.'),
    z.object({ max: Column }).strict().describe('The largest value in a column.'),
    z.object({ min: Column }).strict().describe('The smallest value in a column.'),
    z.object({ average: Column }).strict().describe('The average of a column.'),
    z.object({ first: Column }).strict().describe('The value in the first row, as a single-value tile shows.'),
], { error: 'Use one of count: results, or sum, max, min, average or first with a column name.' });

const Value = z.union([
    NumberValue,
    z.object({ ratio: z.tuple([z.union([NumberValue, z.number()]), z.union([NumberValue, z.number()])]) }).strict()
        .describe('The first number divided by the second, such as [sum: 5xx errors, sum: Requests]. 0 when the second is 0.'),
    z.object({ top: Column, by: Column }).strict()
        .describe("The row with the largest `by`, shown by its `top` column (a name, such as the worst host). The note's {placeholders} read that row."),
], { error: 'Use one of count: results; sum, max, min, average or first with a column name; ratio: [a, b]; or top with by.' });

const Format = z.object({
    decimals: z.number().int().min(0).max(6).optional().describe('Digits after the point. Without it, numbers get thousands separators.'),
    percent: z.boolean().optional().describe('Multiply by 100 and add "%" (for a ratio).'),
    suffix: z.string().optional().describe('Text after the number, as written: " GB", "%", " ms".'),
}).strict();

// A message with {Column} placeholders, which take a matching row's values.
// {Column|number} adds thousands separators, {Column|2} keeps 2 decimals and
// {Column|hours} turns minutes into "N hours". {count} is how many rows
// match, and {list} is every matching row, as `item` writes each one.
const Template = z.string({ error: 'Put the message in double quotes, such as "{Host} is down."' }).min(1);

const Highlight = z.object({
    label: z.string().min(1).describe('What the number is, in a few words: "Overall error rate".'),
    value: Value,
    format: Format.optional(),
    note: Template.optional().describe('A short line under the number: "Budget: 2%". With `top`, it can use {placeholders} from that row.'),
    meter: z.object({ of: z.number().positive() }).strict().optional().describe('Draws a meter under the number: how much of this limit it uses.'),
}).strict();

const Condition = z.union([
    z.object({ column: Column, above: z.number() }).strict(),
    z.object({ column: Column, below: z.number() }).strict(),
    z.object({ column: Column, atLeast: z.number() }).strict(),
    z.object({ column: Column, atMost: z.number() }).strict(),
    z.object({ column: Column, equals: z.union([z.string(), z.number()]) }).strict(),
    z.object({ results: z.object({ above: z.number() }).strict() }).strict().describe('The run had more than this many results (every row counts).'),
], { error: 'Use a column with one of above, below, atLeast or atMost (a number) or equals, or results: { above: <number> }.' });

const Rule = z.object({
    when: Condition.describe('Which rows make the report warn or fail.'),
    one: Template.describe('The message when one row matches.'),
    many: Template.optional().describe('The message when several match. Defaults to `one`.'),
    item: Template.optional().describe('How each matching row reads in {list}: "{Host} ({Error rate %}%)".'),
    row: z.object({ top: Column }).strict().optional().describe('Which row fills the {placeholders}: the one with the largest value in this column. Default: the first that matches.'),
}).strict();

const Threshold = z.object({ value: z.number(), label: z.string().min(1) }).strict();

const Chart = z.object({
    type: z.enum(['bar', 'column', 'line', 'area']).optional().describe('Overrides the chart saved with the search in Splunk.'),
    y: Column.optional().describe('The column to plot. Default: the first column of numbers.'),
    threshold: Threshold.optional().describe('A dashed limit line, such as an error budget. Values past it take the warning color.'),
    max: z.number().optional().describe('The most the value can be (100 for a percentage): bars become meters.'),
    panels: z.array(z.object({ y: Column, threshold: Threshold.optional() }).strict()).optional().describe('One small chart per column, for measures with different units.'),
    scatter: z.object({ x: Column, log: z.boolean().optional(), caption: z.string().min(1) }).strict().optional().describe('A second chart: a dot per row, the chart\'s column up and `x` across.'),
}).strict();

const RUNBOOK_ERROR = 'Use a web address that starts with https:// (or http://), such as https://wiki.example.com/runbooks/disk-space.';

export const CATEGORIES = ['Security', 'Operations', 'Infrastructure', 'Business', 'Compliance', 'Other'] as const;

export const ReportCard = z.object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase words joined by hyphens').describe("The report's web address: /reports/<slug>."),
    category: z.enum(CATEGORIES),
    icon: z.enum(ICON_NAMES, {
        error: (issue) => `${JSON.stringify(issue.input)} isn't one of the app's icons. Use one of: ${ICON_NAMES.join(', ')}.`,
    }).optional().describe("The icon on the report's card and page, by its name on lucide.dev/icons. Without it, the app picks one from the report's title, tags and category."),
    tags: z.array(z.string()).default([]),
    groups: z.array(z.string()).optional().describe('Who may see it. Default: the email lists it was sent to (secops@example.com is the group secops).'),
    index: z.string().optional().describe('What the report page says it searches, when the search\'s own index=… isn\'t clear.'),
    // The regex repeats the protocol check so that the JSON Schema, which
    // editors check as you type, gets it too: it keeps only the pattern.
    runbook: z.url({ protocol: /^https?$/, error: RUNBOOK_ERROR }).regex(/^https?:\/\//i, RUNBOOK_ERROR)
        .optional().describe('A link to what to do when the report warns or fails: a runbook or wiki page, starting with https://. The report page and the briefing show it.'),
    contact: z.string().trim().min(1).max(200).optional().describe('Who to ask about the report: a team, an on-call rota or an email address, such as "sre-oncall@example.com". An email address becomes a link.'),
    chart: z.union([z.literal('none'), Chart]).optional().describe('"none" for a table only.'),
    highlights: z.array(Highlight).min(1).optional().describe('The headline numbers. The first one is on the report\'s card. Default: the result count, the top row and the search time.'),
    warn: Rule.optional().describe('When the report shows "Warning", and what it says.'),
    fail: Rule.optional().describe('When the report shows "Failed", and what it says. Checked before `warn`.'),
    custom: z.string().optional().describe('The name of a TypeScript rule in src/reports/cards/custom.ts, for what the rest can\'t say.'),
}).strict();

export const ReportCardsFile = z.record(z.string().min(1), ReportCard).superRefine((cards, context) => {
    const seen = new Map<string, string>();
    for (const [name, card] of Object.entries(cards)) {
        const other = seen.get(card.slug);
        if (other) context.addIssue({ code: 'custom', path: [name, 'slug'], message: `"${other}" already uses the slug "${card.slug}"` });
        seen.set(card.slug, name);
    }
});

export type ReportCard = z.infer<typeof ReportCard>;
export type CardValue = z.infer<typeof Value>;
export type CardNumberValue = z.infer<typeof NumberValue>;
export type CardFormat = z.infer<typeof Format>;
export type CardHighlight = z.infer<typeof Highlight>;
export type CardRule = z.infer<typeof Rule>;
export type CardCondition = z.infer<typeof Condition>;
