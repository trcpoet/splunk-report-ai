import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { cardsJsonSchema } from '@/reports/cards/json-schema';
import { parseReportCards, ReportCardsError } from '@/reports/cards/load';
import { reportCards, reportConfig } from '@/reports/report-config';
import { reports } from '@/splunk/fixtures/reports';

// The problems a bad file lists, or a failed test if it loaded.
const problems = (yaml: string, registry = {}) => {
    try {
        parseReportCards(yaml, 'test.yaml', registry);
    } catch (error) {
        if (error instanceof ReportCardsError) return error.problems.join('\n');
        throw error;
    }
    assert.fail('expected the cards to be refused');
};

describe('config/report-cards.yaml', () => {
    test('has a card for every dummy report', () => {
        assert.deepEqual(Object.keys(reportConfig()).sort(), reports.map(({ title }) => title).sort());
    });

    test("a card's limit line and its warn rule use the same number when they watch the same column", () => {
        for (const [name, card] of Object.entries(reportCards())) {
            const chart = card.chart === 'none' ? undefined : card.chart;
            const when = card.warn?.when;
            if (!chart?.threshold || !when || !('column' in when) || !('above' in when)) continue;
            if (chart.y !== undefined && chart.y !== when.column) continue;
            assert.equal(chart.threshold.value, when.above, `${name}: the chart's line is at ${chart.threshold.value}, the warn rule at ${when.above}`);
        }
    });

    test('its JSON Schema is up to date (npm run cards:schema)', () => {
        assert.deepEqual(JSON.parse(readFileSync('config/report-cards.schema.json', 'utf8')), JSON.parse(JSON.stringify(cardsJsonSchema())));
    });
});

describe('parseReportCards', () => {
    const card = 'Disk check:\n  slug: disk-check\n  category: Infrastructure\n';

    test('reads a minimal card, with no tags', () => {
        const { configs } = parseReportCards(card, 'test.yaml', {});
        assert.deepEqual(configs['Disk check'], { slug: 'disk-check', category: 'Infrastructure', tags: [] });
    });

    test('says where each mistake is, all at once', () => {
        const found = problems('Disk check:\n  slug: Disk Check\n  category: Disks\n  colour: red\n');
        assert.match(found, /Disk check → slug: lowercase words joined by hyphens/);
        assert.match(found, /Disk check → category/);
        assert.match(found, /colour/);
    });

    test('two cards may not share a slug', () => {
        assert.match(problems(`${card}Disk check 2:\n  slug: disk-check\n  category: Infrastructure\n`), /"Disk check" already uses the slug "disk-check"/);
    });

    test("a file that isn't YAML says so, and what usually causes it", () => {
        assert.match(problems('Disk check: [unclosed'), /isn't valid YAML/);
        assert.match(problems(`${card}  warn:\n    when: { results: { above: 0 } }\n    one: {Host} is down\n`), /at line 6, column 17\. A message or note that starts with { needs double quotes/);
    });

    test('a message that YAML reads as something else asks for quotes', () => {
        assert.match(problems(`${card}  warn:\n    when: { results: { above: 0 } }\n    one: {Host}\n`), /warn → one: Put the message in double quotes/);
    });

    test('a condition or value it doesn\'t know says what it can be', () => {
        assert.match(problems(`${card}  warn:\n    when: { column: Used %, over: 95 }\n    one: "x"\n`), /warn → when: Use a column with one of above, below/);
        assert.match(problems(`${card}  highlights:\n    - label: Total\n      value: { total: GB }\n`), /highlights → 0 → value: Use one of count: results/);
    });

    test('a custom rule must exist, and is used when it does', () => {
        assert.match(problems(`${card}  custom: disk-rule\n`), /no rule named "disk-rule"/);
        const registry = { 'disk-rule': { statusRule: () => ({ status: 'warning' as const, message: 'custom' }) } };
        const { configs } = parseReportCards(`${card}  custom: disk-rule\n`, 'test.yaml', registry);
        assert.deepEqual(configs['Disk check']?.statusRule?.({ columns: [], rows: [], resultCount: 0 }), { status: 'warning', message: 'custom' });
    });
});
