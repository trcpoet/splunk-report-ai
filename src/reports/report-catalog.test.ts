import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { reportConfig } from '@/reports/report-config';

// docs/report-catalog.md explains every report to people who don't read the
// code. These tests keep it from falling behind src/reports/report-config.ts.

const catalog = readFileSync(join(process.cwd(), 'docs', 'report-catalog.md'), 'utf8');

// The "### <report name>" sections under "## Each report", with their text.
const sections = (() => {
    const part = catalog.split(/^## Each report$/m)[1]?.split(/^## /m)[0] ?? '';
    return new Map(part.split(/^### /m).slice(1).map((section) => {
        const [title = '', ...body] = section.split('\n');
        return [title.trim(), body.join('\n')];
    }));
})();

describe('docs/report-catalog.md', () => {
    test('has a section for every report in src/reports/report-config.ts, with its slug', () => {
        for (const [name, { slug }] of Object.entries(reportConfig)) {
            const section = sections.get(name);
            assert.ok(section, `Add a "### ${name}" section to docs/report-catalog.md.`);
            assert.ok(section.includes(`\`${slug}\``), `The "${name}" section should give its slug, ${slug}.`);
        }
    });

    test('has no section for a report that src/reports/report-config.ts no longer lists', () => {
        for (const name of sections.keys()) {
            assert.ok(name in reportConfig, `"${name}" is in docs/report-catalog.md but not in src/reports/report-config.ts.`);
        }
    });

    test('lists every report in its table at a glance', () => {
        for (const name of Object.keys(reportConfig)) {
            assert.ok(catalog.includes(`| [${name}](#`), `Add "${name}" to the table at a glance.`);
        }
    });
});
