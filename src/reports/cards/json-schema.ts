import { z } from 'zod';
import { ReportCardsFile } from './schema';

// The cards' schema as JSON Schema, for editors and AIs: the YAML file names it
// on its first line. The descriptions come from schema.ts.
export const cardsJsonSchema = () => ({
    ...z.toJSONSchema(ReportCardsFile, { io: 'input', unrepresentable: 'any' }),
    title: 'SplunkEvents report cards (config/report-cards.yaml)',
    description: "One entry per report, under its exact Splunk name: how the report's card and page show it. See docs/adding-report-cards.md.",
});
