import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import type { ReportConfig } from '@/reports/report-config';
import { customRules } from './custom';
import { toReportConfig, type CustomRules } from './rules';
import { ReportCardsFile, type ReportCard } from './schema';

// Reads the report cards (config/report-cards.yaml), checks them, and turns
// them into the settings the sync uses. A mistake stops with every problem
// listed, each with where it is: "Web Server 5xx Error Rate → warn → when".

// config/report-cards.yaml, or the file REPORT_CARDS_FILE names (a mounted
// ConfigMap, say, so cards can change without a new image).
export const reportCardsPath = (env: Record<string, string | undefined> = process.env) =>
    env.REPORT_CARDS_FILE || join(process.cwd(), 'config', 'report-cards.yaml');

export class ReportCardsError extends Error {
    constructor(readonly problems: string[], source: string) {
        super(`${source} needs fixing:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
        this.name = 'ReportCardsError';
    }
}

export function parseReportCards(text: string, source = 'config/report-cards.yaml', registry: Record<string, CustomRules> = customRules) {
    let data: unknown;
    try {
        data = parse(text) ?? {};
    } catch (error) {
        // The parser's first line says where; the rest is a code frame.
        const where = (error instanceof Error ? error.message : String(error)).split('\n')[0]?.replace(/:$/, '.') ?? '';
        throw new ReportCardsError([`It isn't valid YAML: ${where} A message or note that starts with { needs double quotes around it, and so does a name with ": " in it.`], source);
    }

    const result = ReportCardsFile.safeParse(data);
    if (!result.success) {
        throw new ReportCardsError(result.error.issues.map((issue) => `${issue.path.map(String).join(' → ') || 'The file'}: ${issue.message}`), source);
    }

    const cards: Record<string, ReportCard> = result.data;
    const unknown = Object.entries(cards).flatMap(([name, card]) =>
        card.custom && !(card.custom in registry) ? [`${name} → custom: there's no rule named "${card.custom}" in src/reports/cards/custom.ts`] : []);
    if (unknown.length > 0) throw new ReportCardsError(unknown, source);

    const configs: Record<string, ReportConfig> = Object.fromEntries(
        Object.entries(cards).map(([name, card]) => [name, toReportConfig(card, card.custom ? registry[card.custom] : undefined)]));
    return { cards, configs };
}

export function loadReportCards(file = reportCardsPath()) {
    // The path from the repo, or the whole path for a file outside it.
    const shown = relative(process.cwd(), file);
    return parseReportCards(readFileSync(file, 'utf8'), shown && !shown.startsWith('..') ? shown : file);
}
