import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { reportConfig } from '@/reports/report-config';

describe('reportConfig', () => {
    test('reads the cards file again when it changes, as sync:watch needs', () => {
        const folder = mkdtempSync(join(tmpdir(), 'report-cards-'));
        const file = join(folder, 'cards.yaml');
        const before = process.env.REPORT_CARDS_FILE;
        try {
            process.env.REPORT_CARDS_FILE = file;
            writeFileSync(file, 'Disk check:\n  slug: disk-check\n  category: Infrastructure\n');
            utimesSync(file, 1_000, 1_000);
            assert.equal(reportConfig()['Disk check']?.category, 'Infrastructure');

            writeFileSync(file, 'Disk check:\n  slug: disk-check\n  category: Operations\n');
            utimesSync(file, 2_000, 2_000);
            assert.equal(reportConfig()['Disk check']?.category, 'Operations');
        } finally {
            if (before === undefined) delete process.env.REPORT_CARDS_FILE;
            else process.env.REPORT_CARDS_FILE = before;
            rmSync(folder, { recursive: true, force: true });
        }
    });
});
