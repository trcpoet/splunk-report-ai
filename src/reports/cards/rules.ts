import { formatNumber, parseNumber } from '@/shared/format';
import type { Cell, ReportHighlight } from '@/reports/reports';
import type { HighlightRule, ReportConfig, ResultSet, StatusRule } from '@/reports/report-config';
import type { CardCondition, CardFormat, CardHighlight, CardNumberValue, CardRule, CardValue, ReportCard } from './schema';

// Turns a card from config/report-cards.yaml into the report settings the sync
// uses (ReportConfig): its headline numbers and its warn and fail rules become
// the same functions TypeScript rules used to be. Pure, so it's unit-tested.

type Table = Pick<ResultSet, 'columns' | 'rows'>;

const columnOf = (table: Table, name: string) => table.columns.indexOf(name);

const numbersIn = (table: Table, column: string) => {
    const index = columnOf(table, column);
    if (index < 0) return [];
    return table.rows.map((row) => parseNumber(row[index])).filter((value): value is number => value !== null);
};

// The row with the largest value in a column; the first one on a tie. undefined without rows.
export const topRow = (table: Table, column: string) => {
    const index = columnOf(table, column);
    const value = (row: Cell[]) => parseNumber(row[index]) ?? Number.NEGATIVE_INFINITY;
    return table.rows.reduce<Cell[] | undefined>((best, row) => (!best || value(row) > value(best) ? row : best), undefined);
};

function numberValue(value: CardNumberValue | number, results: ResultSet): number {
    if (typeof value === 'number') return value;
    if ('count' in value) return results.resultCount;
    if ('first' in value) return parseNumber(results.rows[0]?.[columnOf(results, value.first)]) ?? 0;

    const column = 'sum' in value ? value.sum : 'max' in value ? value.max : 'min' in value ? value.min : value.average;
    const numbers = numbersIn(results, column);
    if ('sum' in value) return numbers.reduce((total, number) => total + number, 0);
    if (numbers.length === 0) return 0;
    if ('max' in value) return Math.max(...numbers);
    if ('min' in value) return Math.min(...numbers);
    return numbers.reduce((total, number) => total + number, 0) / numbers.length;
}

// A highlight's value: a number to format, or text (a name), and the row its
// note reads. null when there's nothing to show (no rows for `top`).
type Evaluated = { number: number; row?: Cell[] } | { text: string; row?: Cell[] };

function evaluate(value: CardValue, results: ResultSet): Evaluated | null {
    if ('top' in value) {
        const row = topRow(results, value.by);
        return row ? { text: String(row[columnOf(results, value.top)] ?? ''), row } : null;
    }
    if ('ratio' in value) {
        const [over, under] = value.ratio;
        const divisor = numberValue(under, results);
        return { number: divisor ? numberValue(over, results) / divisor : 0 };
    }
    if ('first' in value) {
        const row = results.rows[0];
        const cell = row?.[columnOf(results, value.first)];
        if (cell === undefined) return null;
        const number = parseNumber(cell);
        return number === null ? { text: String(cell), row } : { number, row };
    }
    return { number: numberValue(value, results) };
}

// The number as it's shown, and as the meter reads it (percent: times 100).
function shown(number: number, format: CardFormat = {}) {
    const scaled = format.percent ? number * 100 : number;
    let text = format.decimals !== undefined ? scaled.toFixed(format.decimals) : formatNumber(scaled);
    if (format.percent) text += '%';
    if (format.suffix) text += format.suffix;
    return { text, scaled };
}

// How much of a limit a value uses, for meters: 0.6 is 60%.
export const share = (value: number, limit: number) => Math.round((value / limit) * 100) / 100;

const hours = (minutes: number) => {
    const count = Math.floor(minutes / 60);
    return `${count} hour${count === 1 ? '' : 's'}`;
};

const PLACEHOLDER = /\{([^{}|]+)(?:\|([^{}]+))?\}/g;

// The {placeholders} a template reads: column names, plus count and list.
export const placeholdersOf = (template: string) => [...template.matchAll(PLACEHOLDER)].map(([, name = '']) => name.trim());

// Fills {Column}, {Column|number}, {Column|2}, {Column|hours}, {count} and {list}.
export function fill(template: string, table: Table, row: Cell[] | undefined, extra: { count?: number; list?: string } = {}) {
    return template.replace(PLACEHOLDER, (_, rawName: string, filter?: string) => {
        const name = rawName.trim();
        const raw: Cell | undefined = name === 'count' ? extra.count : name === 'list' ? extra.list : row?.[columnOf(table, name)];
        if (raw === undefined) return '';
        if (!filter) return String(raw);
        const number = Number(raw);
        if (filter === 'number') return formatNumber(number);
        if (filter === 'hours') return hours(number);
        if (/^\d$/.test(filter)) return number.toFixed(Number(filter));
        return String(raw);
    });
}

export function compileHighlights(highlights: CardHighlight[]): HighlightRule {
    return (results) => highlights.flatMap((highlight): ReportHighlight[] => {
        const value = evaluate(highlight.value, results);
        if (!value) return [];

        const number = 'number' in value ? shown(value.number, highlight.format) : null;
        const note = highlight.note ? fill(highlight.note, results, value.row) : undefined;
        return [{
            label: highlight.label,
            value: number ? number.text : 'text' in value ? value.text : '',
            ...(note ? { note } : {}),
            ...(number && highlight.meter ? { meter: share(number.scaled, highlight.meter.of) } : {}),
        }];
    });
}

const passes = (cell: Cell | undefined, condition: Exclude<CardCondition, { results: unknown }>) => {
    if ('equals' in condition) return cell !== undefined && String(cell) === String(condition.equals);
    const number = parseNumber(cell);
    if (number === null) return false;
    if ('above' in condition) return number > condition.above;
    if ('below' in condition) return number < condition.below;
    if ('atLeast' in condition) return number >= condition.atLeast;
    return number <= condition.atMost;
};

// The rows a rule matches, and how many there are, or null when none do.
function matching(condition: CardCondition, results: ResultSet): { rows: Cell[][]; count: number } | null {
    if ('results' in condition) {
        const count = results.resultCount || results.rows.length;
        return count > condition.results.above ? { rows: results.rows, count } : null;
    }
    const index = columnOf(results, condition.column);
    if (index < 0) return null;
    const rows = results.rows.filter((row) => passes(row[index], condition));
    return rows.length > 0 ? { rows, count: rows.length } : null;
}

function ruleMessage(rule: CardRule, results: ResultSet): string | null {
    const match = matching(rule.when, results);
    if (!match) return null;

    const table = { columns: results.columns, rows: match.rows };
    const row = rule.row ? topRow(table, rule.row.top) : match.rows[0];
    const list = rule.item ? match.rows.map((each) => fill(rule.item ?? '', results, each)).join(', ') : '';
    const template = match.count === 1 ? rule.one : (rule.many ?? rule.one);
    return fill(template, results, row, { count: match.count, list });
}

export function compileStatusRule({ warn, fail }: Pick<ReportCard, 'warn' | 'fail'>): StatusRule | undefined {
    if (!warn && !fail) return undefined;
    return (results) => {
        const failed = fail ? ruleMessage(fail, results) : null;
        if (failed !== null) return { status: 'failed', message: failed };
        const warning = warn ? ruleMessage(warn, results) : null;
        return warning !== null ? { status: 'warning', message: warning } : null;
    };
}

// What a `custom:` name can supply: TypeScript rules for what the file can't say.
export type CustomRules = { statusRule?: StatusRule; highlights?: HighlightRule };

export function toReportConfig(card: ReportCard, custom?: CustomRules): ReportConfig {
    const statusRule = compileStatusRule(card) ?? custom?.statusRule;
    const highlights = card.highlights ? compileHighlights(card.highlights) : custom?.highlights;
    return {
        slug: card.slug,
        category: card.category,
        tags: card.tags,
        ...(card.icon ? { icon: card.icon } : {}),
        ...(card.groups ? { groups: card.groups } : {}),
        ...(card.chart ? { chart: card.chart } : {}),
        ...(card.index ? { index: card.index } : {}),
        ...(statusRule ? { statusRule } : {}),
        ...(highlights ? { highlights } : {}),
    };
}
