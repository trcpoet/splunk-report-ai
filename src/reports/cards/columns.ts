import { placeholdersOf } from './rules';
import type { CardNumberValue, CardValue, ReportCard } from './schema';

// The results columns a card names, so a typo can be caught against a real
// run (npm run card:preview and npm run splunk:check).
export function columnsUsed(card: ReportCard): string[] {
    const names = new Set<string>();
    const add = (name: string | undefined) => {
        if (name && name !== 'count' && name !== 'list') names.add(name);
    };
    const number = (value: CardNumberValue | number) => {
        if (typeof value === 'number') return;
        if ('sum' in value) add(value.sum);
        if ('max' in value) add(value.max);
        if ('min' in value) add(value.min);
        if ('average' in value) add(value.average);
        if ('first' in value) add(value.first);
    };
    const value = (shown: CardValue) => {
        if ('top' in shown) {
            add(shown.top);
            add(shown.by);
        } else if ('ratio' in shown) {
            shown.ratio.forEach(number);
        } else {
            number(shown);
        }
    };

    if (card.chart && card.chart !== 'none') {
        add(card.chart.y);
        card.chart.panels?.forEach(({ y }) => add(y));
        add(card.chart.scatter?.x);
    }
    for (const highlight of card.highlights ?? []) {
        value(highlight.value);
        if (highlight.note) placeholdersOf(highlight.note).forEach(add);
    }
    for (const rule of [card.warn, card.fail]) {
        if (!rule) continue;
        if ('column' in rule.when) add(rule.when.column);
        add(rule.row?.top);
        for (const template of [rule.one, rule.many, rule.item]) if (template) placeholdersOf(template).forEach(add);
    }
    return [...names];
}
