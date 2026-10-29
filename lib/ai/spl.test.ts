import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { z } from 'zod';
import { checkSpl, pipeCommands, queryFromSteps, SplAnswerSchema, splunkSearchUrl, stepLine } from '@/lib/ai/spl';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';

describe('queryFromSteps', () => {
    test('joins the steps with a pipe command per line', () => {
        const query = queryFromSteps([
            { code: 'index=web sourcetype=access_combined', explanation: '' },
            { code: 'stats count BY host', explanation: '' },
            { code: '| sort - count', explanation: '' },
        ]);
        assert.equal(query, 'index=web sourcetype=access_combined\n| stats count BY host\n| sort - count');
    });
});

describe('stepLine', () => {
    test('writes the base search as it is, and later steps after one pipe', () => {
        assert.equal(stepLine({ code: ' index=web ', explanation: '' }, 0), 'index=web');
        assert.equal(stepLine({ code: '| stats count', explanation: '' }, 1), '| stats count');
        assert.equal(stepLine({ code: 'eval x=1,\n  y=2', explanation: '' }, 2), '| eval x=1, y=2');
    });
});

describe('pipeCommands', () => {
    test('finds the command after every pipe, including in subsearches', () => {
        assert.deepEqual(
            pipeCommands('index=web [search index=fw | fields src_ip] | stats count BY src_ip | outputlookup x.csv'),
            ['fields', 'stats', 'outputlookup'],
        );
    });

    test('ignores pipes inside double quotes', () => {
        assert.deepEqual(pipeCommands('index=web "a | delete" | eval note="x | sendemail" | table host'), ['eval', 'table']);
    });

    test("an apostrophe doesn't hide the commands after it", () => {
        assert.deepEqual(pipeCommands("index=main user=o'brien | outputlookup users.csv"), ['outputlookup']);
    });

    test('a quote that never closes hides nothing', () => {
        assert.deepEqual(pipeCommands('index=main "oops | delete'), ['delete']);
    });
});

describe('checkSpl', () => {
    test("every report's own search is read-only", () => {
        for (const report of fixtures) {
            assert.equal(checkSpl(report.spl).readOnly, true, report.slug);
        }
    });

    test("an apostrophe in a search term doesn't make a writing search look read-only", () => {
        assert.equal(checkSpl("index=main user=o'brien | outputlookup users.csv").readOnly, false);
    });

    test('flags commands that change data or act outside the search', () => {
        const check = checkSpl('index=wineventlog EventCode=4625\n| stats count BY user\n| outputlookup failed.csv\n| sendemail to=x@example.com');
        assert.equal(check.readOnly, false);
        assert.ok(check.warnings.some((warning) => warning.startsWith('outputlookup')));
        assert.ok(check.warnings.some((warning) => warning.startsWith('sendemail')));
    });

    test('warns when no index is named, or every index is searched', () => {
        assert.match(checkSpl('sourcetype=access_combined | stats count').warnings.join(' '), /No index/);
        assert.match(checkSpl('index=* error | stats count').warnings.join(' '), /index=\*/);
        assert.deepEqual(checkSpl('index=web | stats count').warnings, []);
    });

    test("doesn't ask generating commands for an index", () => {
        assert.deepEqual(checkSpl('| tstats count WHERE index=web BY host').warnings, []);
    });
});

describe('splunkSearchUrl', () => {
    test('is null without SPLUNK_WEB_URL', () => {
        assert.equal(splunkSearchUrl(undefined, 'index=web'), null);
    });

    test('links to the search page with the query filled in', () => {
        assert.equal(
            splunkSearchUrl('https://splunk.example.com/en-US/', 'index=web | stats count'),
            'https://splunk.example.com/en-US/app/search/search?q=search%20index%3Dweb%20%7C%20stats%20count',
        );
        assert.match(splunkSearchUrl('https://splunk.example.com', '| tstats count')!, /q=%7C%20tstats/);
    });
});

describe('SplAnswerSchema', () => {
    test('converts to the JSON Schema sent to Gemini, with every field required', () => {
        const schema = z.toJSONSchema(SplAnswerSchema) as { required: string[]; properties: Record<string, { maxItems?: number }> };
        assert.deepEqual([...schema.required].sort(), ['assumptions', 'fields', 'followUps', 'steps', 'summary', 'timeRange']);
        assert.equal(schema.properties.steps.maxItems, 15);
    });
});
