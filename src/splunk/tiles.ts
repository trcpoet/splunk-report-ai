import { XMLParser } from 'fast-xml-parser';
import { stringify } from 'yaml';
import { CATEGORY_ICONS, iconFor } from '@/reports/icons';
import type { ReportCategory } from '@/reports/reports';
import type { SplunkEntry, SplunkFeed } from './types';
import type { SplunkTransport } from './transport';

// npm run splunk:tiles: reads a Splunk dashboard and turns each tile into a
// worksheet entry: its whole search (a chained or post-process search joined
// to its base), time range, number format and color thresholds, and a draft
// card for config/report-cards.yaml. A one-time helper for moving a team's
// dashboard tiles into the app: it only reads, and writes nothing to Splunk.
// Both dashboard formats: Dashboard Studio (JSON) and classic Simple XML.

export type Tile = {
    title: string;
    kind: 'single value' | 'chart' | 'table' | 'other';
    // The tile's own chart type in Splunk, such as line or column.
    chart?: string;
    // The whole search, or '' when the tile shows a saved search (savedSearch).
    search: string;
    savedSearch?: string;
    earliest?: string;
    latest?: string;
    // A single value's color ranges: the numbers between them, lowest first, and their colors.
    thresholds: number[];
    colors: string[];
    unit?: string;
    decimals?: number;
};

type DashboardContent = { label?: string; 'eai:data'?: string };

// A base search and the steps chained or post-processed onto it, as one
// search. Splunk adds the pipe a post-process step may leave out ("fields x").
export const joinSearch = (parts: string[]) =>
    parts.map((part) => part.trim()).filter(Boolean).map((part, index) => (index > 0 && !part.startsWith('|') ? `| ${part}` : part)).join('\n');

// Dashboard inputs a search uses, such as $sid|s$ or $time_tok.earliest$: a
// scheduled report has no inputs, so they need fixed values first.
export const inputsOf = (search: string) => [...new Set(search.match(/\$[\w.]+(?:\|[\w]+)?\$/g) ?? [])];

// ---------------------------------------------------------------------------
// Dashboard Studio: a JSON definition inside <definition><![CDATA[...]]>.

type StudioDataSource = { type?: string; options?: { query?: string; extend?: string; ref?: string; queryParameters?: { earliest?: string; latest?: string } } };
type StudioVisualization = {
    type?: string;
    title?: string;
    dataSources?: { primary?: string };
    options?: Record<string, unknown>;
    context?: Record<string, unknown>;
};
type StudioDefinition = {
    title?: string;
    dataSources?: Record<string, StudioDataSource>;
    visualizations?: Record<string, StudioVisualization>;
    defaults?: { dataSources?: Record<string, { options?: { queryParameters?: { earliest?: string; latest?: string } } }> };
};

const STUDIO_KINDS: Record<string, Tile['kind']> = {
    'splunk.singlevalue': 'single value',
    'splunk.singlevalueicon': 'single value',
    'splunk.singlevalueradial': 'single value',
    'splunk.table': 'table',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// The numbers and colors of a Studio color config: [{ value: '#..', to: 30 }, { value: '#..', from: 30 }, ...].
function studioRanges(context: Record<string, unknown> | undefined) {
    const config = context ? Object.entries(context).find(([key, value]) => key.toLowerCase().includes('color') && Array.isArray(value))?.[1] : undefined;
    const ranges = Array.isArray(config) ? config.filter(isRecord) : [];
    const thresholds = [...new Set(ranges.flatMap((range) => [range.from, range.to]).filter((value): value is number => typeof value === 'number'))].sort((a, b) => a - b);
    const colors = ranges.map((range) => range.value).filter((value): value is string => typeof value === 'string');
    return { thresholds, colors };
}

export function studioTiles(definition: StudioDefinition): Tile[] {
    const sources = definition.dataSources ?? {};
    const defaults = definition.defaults?.dataSources?.['ds.search']?.options?.queryParameters;

    return Object.values(definition.visualizations ?? {}).flatMap((visualization): Tile[] => {
        const type = visualization.type ?? '';
        if (type === 'splunk.markdown' || type === 'splunk.image' || type === 'abslayout.line' || !visualization.dataSources?.primary) return [];

        // Follow a chain of searches back to its base, joining them in order.
        const parts: string[] = [];
        let source = sources[visualization.dataSources.primary];
        let savedSearch: string | undefined;
        let time = source?.options?.queryParameters;
        for (let hops = 0; source && hops < 10; hops++) {
            time = source.options?.queryParameters ?? time;
            if (source.type === 'ds.chain') {
                parts.unshift(source.options?.query ?? '');
                source = source.options?.extend ? sources[source.options.extend] : undefined;
            } else {
                if (source.type === 'ds.savedSearch') savedSearch = source.options?.ref;
                else parts.unshift(source.options?.query ?? '');
                break;
            }
        }

        const { thresholds, colors } = studioRanges(visualization.context);
        const precision = visualization.options?.numberPrecision;
        const unit = visualization.options?.unit;
        const kind = STUDIO_KINDS[type] ?? (type.startsWith('splunk.') ? 'chart' : 'other');
        return [{
            title: visualization.title ?? 'Untitled tile',
            kind,
            ...(kind === 'chart' ? { chart: type.replace('splunk.', '') } : {}),
            search: joinSearch(parts),
            ...(savedSearch ? { savedSearch } : {}),
            ...((time ?? defaults)?.earliest ? { earliest: (time ?? defaults)?.earliest } : {}),
            ...((time ?? defaults)?.latest ? { latest: (time ?? defaults)?.latest } : {}),
            thresholds,
            colors,
            ...(typeof unit === 'string' && unit ? { unit } : {}),
            ...(typeof precision === 'number' ? { decimals: precision } : {}),
        }];
    });
}

// ---------------------------------------------------------------------------
// Simple XML: <dashboard> or <form>, rows of panels of <single>, <chart>, <table>.

type XmlSearch = { '@id'?: string; '@base'?: string; '@ref'?: string; query?: unknown; earliest?: unknown; latest?: unknown };
type XmlElement = { title?: unknown; search?: XmlSearch[]; option?: { '@name'?: string; '#text'?: unknown }[] };
type XmlPanel = { title?: unknown } & Partial<Record<'single' | 'chart' | 'table' | 'event' | 'viz', XmlElement[]>>;
type XmlRoot = { label?: unknown; search?: XmlSearch[]; row?: { panel?: XmlPanel[] }[] };

const XML_KINDS: Record<string, Tile['kind']> = { single: 'single value', chart: 'chart', table: 'table', event: 'other', viz: 'other' };
const ARRAYS = new Set(['row', 'panel', 'single', 'chart', 'table', 'event', 'viz', 'option', 'search']);

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

const parseList = (value: string) => {
    try {
        const list: unknown = JSON.parse(value.replace(/'/g, '"'));
        return Array.isArray(list) ? list.map((item: unknown) => item) : [];
    } catch {
        return [];
    }
};

export function simpleXmlTiles(xml: string): Tile[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', isArray: (name) => ARRAYS.has(name), parseTagValue: false });
    const document: unknown = parser.parse(xml);
    const root: XmlRoot | undefined = isRecord(document) ? ((document.dashboard ?? document.form) as XmlRoot | undefined) : undefined;
    if (!root) return [];

    const bases = new Map((root.search ?? []).flatMap((search) => (search['@id'] ? [[search['@id'], text(search.query)] as const] : [])));

    return (root.row ?? []).flatMap((row) => row.panel ?? []).flatMap((panel) =>
        (['single', 'chart', 'table', 'event', 'viz'] as const).flatMap((kind) => (panel[kind] ?? []).map((element): Tile => {
            const search = element.search?.[0] ?? {};
            const base = search['@base'] ? bases.get(search['@base']) : undefined;
            const options = new Map((element.option ?? []).map((option) => [option['@name'] ?? '', text(option['#text'])]));
            const precision = options.get('numberPrecision');
            const chart = options.get('charting.chart');
            return {
                title: text(element.title) || text(panel.title) || 'Untitled tile',
                kind: XML_KINDS[kind] ?? 'other',
                ...(kind === 'chart' && chart ? { chart } : {}),
                search: joinSearch([base ?? '', text(search.query)]),
                ...(search['@ref'] ? { savedSearch: search['@ref'] } : {}),
                ...(text(search.earliest) ? { earliest: text(search.earliest) } : {}),
                ...(text(search.latest) ? { latest: text(search.latest) } : {}),
                thresholds: parseList(options.get('rangeValues') ?? '').map(Number).filter(Number.isFinite),
                colors: parseList(options.get('rangeColors') ?? '').map(String),
                ...(options.get('unit') ? { unit: options.get('unit') } : {}),
                ...(precision ? { decimals: (precision.split('.')[1] ?? '').length } : {}),
            };
        })));
}

// ---------------------------------------------------------------------------

export function tilesOf(data: string): Tile[] {
    const studio = data.match(/<definition>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/definition>/);
    if (studio?.[1]) {
        const definition: unknown = JSON.parse(studio[1]);
        return isRecord(definition) ? studioTiles(definition) : [];
    }
    return simpleXmlTiles(data);
}

// A dashboard by its name or its label, among the ones the token can read.
export async function findDashboard(transport: SplunkTransport, wanted: string) {
    const views = await transport.get<SplunkFeed<DashboardContent>>('/servicesNS/-/-/data/ui/views', { count: 0 });
    const key = wanted.trim().toLowerCase();
    const dashboard: SplunkEntry<DashboardContent> | undefined = views.entry.find(({ name, content }) => name.toLowerCase() === key || content.label?.toLowerCase() === key);
    return { dashboard, count: views.entry.length };
}

// ---------------------------------------------------------------------------
// The draft card for a tile.

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

// A guess at the column a single value shows: what its search's last step
// names. "<column>" when there's no telling; npm run card:preview lists the real ones.
export function guessColumn(search: string) {
    const last = search.split('|').at(-1)?.trim() ?? '';
    const named = [...last.matchAll(/\bAS\s+(?:"([^"]+)"|([\w.%-]+))/gi)].at(-1);
    if (named) return named[1] ?? named[2] ?? '<column>';
    const stats = last.match(/^(?:stats|timechart|chart)\s+(\w+\([^)]*\)|\w+)/i);
    if (stats?.[1]) return stats[1];
    const table = last.match(/^(?:table|fields)\s+([\w.%-]+)/i);
    return table?.[1] ?? '<column>';
}

// Splunk's red: more red than green or blue. A tile whose last color is red
// warns on high values; one whose first color is red warns on low values.
const isRed = (color: string) => {
    const hex = color.replace(/^#|^0x/i, '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return /red|crit|sev/i.test(color);
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return red > 150 && red > green * 1.5 && red > blue * 1.5;
};

// The worksheet's note on a tile's icon. The draft card leaves `icon:` out,
// so the app keeps guessing (and a better rule, or a changed category, still
// counts); this says what it will show until someone picks one.
export function iconNote(title: string): string {
    const { icon, reason } = iconFor({ title, category: 'Other' });
    if (icon !== CATEGORY_ICONS.Other) return `The app will show \`${icon}\` (${reason}). Add \`icon:\` to the card only if that's wrong.`;
    return "No word in the title picks an icon, so the card will show its category's icon. Add `icon:` to the card to choose one.";
}

export function draftCard(tile: Tile, category: ReportCategory = 'Other'): string {
    const column = tile.kind === 'single value' ? guessColumn(tile.search) : '<column>';
    const lowIsBad = tile.colors.length > 0 && isRed(tile.colors[0] ?? '') && !isRed(tile.colors.at(-1) ?? '');
    const [first, second] = lowIsBad ? tile.thresholds : [...tile.thresholds].reverse();
    const compare = (limit: number) => (lowIsBad ? { column, below: limit } : { column, above: limit });
    const word = lowIsBad ? 'below' : 'above';

    const card: Record<string, unknown> = { slug: slugify(tile.title), category, tags: [] };
    if (tile.kind === 'single value') {
        card.chart = 'none';
        card.highlights = [{
            label: tile.title,
            value: { first: column },
            ...(tile.decimals !== undefined || tile.unit ? { format: { ...(tile.decimals !== undefined ? { decimals: tile.decimals } : {}), ...(tile.unit ? { suffix: ` ${tile.unit}` } : {}) } } : {}),
        }];
    } else if (tile.chart && ['line', 'column', 'bar', 'area'].includes(tile.chart)) {
        card.chart = { type: tile.chart };
    } else if (tile.kind === 'table') {
        card.chart = 'none';
    }
    // The worst range fails and the next one warns; one range only warns.
    if (first !== undefined && second !== undefined) {
        card.fail = { when: compare(first), one: `${tile.title} is {${column}}, ${word} ${first}.` };
        card.warn = { when: compare(second), one: `${tile.title} is {${column}}, ${word} ${second}.` };
    } else if (first !== undefined) {
        card.warn = { when: compare(first), one: `${tile.title} is {${column}}, ${word} ${first}.` };
    }
    return stringify({ [tile.title]: card }, { lineWidth: 0 });
}
