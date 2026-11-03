import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseReportCards } from '@/reports/cards/load';
import { draftCard, guessColumn, inputsOf, joinSearch, tilesOf } from '@/splunk/tiles';

// A Dashboard Studio dashboard, as Splunk's REST API returns it in eai:data.
const studio = `<dashboard version="2" theme="dark"><label>Ops KPIs</label><definition><![CDATA[${JSON.stringify({
    title: 'Ops KPIs',
    dataSources: {
        base: { type: 'ds.search', options: { query: 'index=web sourcetype=access_combined', queryParameters: { earliest: '-24h', latest: 'now' } } },
        errors: { type: 'ds.chain', options: { extend: 'base', query: '| stats count(eval(status>=500)) AS errors, count AS requests | eval rate=round(errors/requests*100, 2)' } },
        trend: { type: 'ds.savedSearch', options: { ref: 'Web Requests by Host' } },
    },
    visualizations: {
        viz_rate: {
            type: 'splunk.singlevalue',
            title: 'Server error rate',
            dataSources: { primary: 'errors' },
            options: { numberPrecision: 2, unit: '%', majorColor: '> majorValue | rangeValue(majorColorEditorConfig)' },
            context: { majorColorEditorConfig: [{ value: '#118832', to: 2 }, { value: '#CBA700', from: 2, to: 5 }, { value: '#D41F1F', from: 5 }] },
        },
        viz_trend: { type: 'splunk.line', title: 'Requests by host', dataSources: { primary: 'trend' } },
        viz_note: { type: 'splunk.markdown', options: { markdown: '# Notes' } },
    },
})}]]></definition></dashboard>`;

// A classic Simple XML dashboard with a base search and a post-process tile.
const simpleXml = `<form version="1.1">
  <label>Disk</label>
  <search id="base"><query>index=os sourcetype=df | stats latest(UsePct) AS used BY host</query><earliest>-30m</earliest><latest>now</latest></search>
  <row>
    <panel>
      <single>
        <title>Fullest disk</title>
        <search base="base"><query>| stats max(used) AS "Used %"</query></search>
        <option name="numberPrecision">0.0</option>
        <option name="rangeValues">[85,95]</option>
        <option name="rangeColors">["0x53a051","0xf8be34","0xdc4e41"]</option>
      </single>
    </panel>
    <panel>
      <title>Free space</title>
      <chart>
        <search><query>index=os sourcetype=df | timechart avg(Avail) BY host</query><earliest>-24h</earliest></search>
        <option name="charting.chart">line</option>
      </chart>
    </panel>
  </row>
</form>`;

describe('splunk:tiles', () => {
    test('Dashboard Studio: joins a chained search to its base, and reads the format and the color ranges', () => {
        const [rate, trend, ...rest] = tilesOf(studio);
        assert.deepEqual(rate, {
            title: 'Server error rate',
            kind: 'single value',
            search: 'index=web sourcetype=access_combined\n| stats count(eval(status>=500)) AS errors, count AS requests | eval rate=round(errors/requests*100, 2)',
            earliest: '-24h',
            latest: 'now',
            thresholds: [2, 5],
            colors: ['#118832', '#CBA700', '#D41F1F'],
            unit: '%',
            decimals: 2,
        });
        assert.ok(trend);
        assert.equal(trend.savedSearch, 'Web Requests by Host');
        assert.equal(trend.chart, 'line');
        assert.equal(rest.length, 0, 'the markdown panel is no tile');
    });

    test('Simple XML: joins a post-process search to its base, and reads the ranges and the chart type', () => {
        const [disk, space] = tilesOf(simpleXml);
        assert.ok(disk && space);
        assert.equal(disk.title, 'Fullest disk');
        assert.equal(disk.search, 'index=os sourcetype=df | stats latest(UsePct) AS used BY host\n| stats max(used) AS "Used %"');
        assert.deepEqual(disk.thresholds, [85, 95]);
        assert.equal(disk.decimals, 1);
        assert.equal(space.title, 'Free space');
        assert.equal(space.chart, 'line');
        assert.equal(space.earliest, '-24h');
    });

    test('guesses the column a single value shows from its last step', () => {
        assert.equal(guessColumn('index=web | stats count AS requests | eval rate=errors/requests'), '<column>');
        assert.equal(guessColumn('index=os | stats max(used) AS "Used %"'), 'Used %');
        assert.equal(guessColumn('index=web | stats count'), 'count');
        assert.equal(guessColumn('index=web | table host, status'), 'host');
    });

    test('a draft card is a valid card: the worst color fails, the next warns', () => {
        const [disk] = tilesOf(simpleXml);
        const draft = draftCard(disk!);
        const { cards } = parseReportCards(draft, 'draft.yaml', {});
        const card = cards['Fullest disk']!;
        assert.deepEqual(card.fail?.when, { column: 'Used %', above: 95 });
        assert.deepEqual(card.warn?.when, { column: 'Used %', above: 85 });
        assert.deepEqual(card.highlights?.[0]?.value, { first: 'Used %' });
        assert.equal(card.icon, 'hard-drive');
    });

    test('a tile whose first color is red warns on low values', () => {
        const draft = draftCard({ title: 'Availability', kind: 'single value', search: '| stats avg(up) AS "Up %"', thresholds: [99, 99.9], colors: ['#D41F1F', '#CBA700', '#118832'] });
        const { cards } = parseReportCards(draft, 'draft.yaml', {});
        assert.deepEqual(cards.Availability?.fail?.when, { column: 'Up %', below: 99 });
    });

    test('a chained step without its pipe gets one, as Splunk adds it', () => {
        assert.equal(joinSearch(['| rest /services/search/jobs', 'fields runDuration', '| stats max(runDuration)']), '| rest /services/search/jobs\n| fields runDuration\n| stats max(runDuration)');
    });

    test("finds the dashboard inputs a search uses, which a scheduled report can't have", () => {
        assert.deepEqual(inputsOf('| rest /services/search/jobs/$sid|s$ earliest=$time.earliest$ | where x="$sid|s$"'), ['$sid|s$', '$time.earliest$']);
        assert.deepEqual(inputsOf('index=web | stats count'), []);
    });
});
