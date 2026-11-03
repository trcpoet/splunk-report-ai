import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseReportCards, ReportCardsError } from '@/reports/cards/load';
import { CATEGORIES } from '@/reports/cards/schema';
import { CATEGORY_ICONS, ICON_NAMES, ICON_RULES, iconFor, isIconName, reportIcon } from '@/reports/icons';
import { reports } from '@/splunk/fixtures/reports';

describe('iconFor', () => {
    test('gives each demo report a fitting icon of its own', () => {
        const expected: Record<string, string> = {
            'failed-logins-by-user': 'key-round',
            'web-5xx-error-rate': 'server-crash',
            'firewall-denied-top-sources': 'brick-wall-fire',
            'license-usage-by-index': 'database-zap',
            'payments-volume-latency': 'credit-card',
            'disk-space-over-85': 'hard-drive',
            'privileged-group-changes': 'user-cog',
            'vpn-sessions-by-country': 'globe-lock',
            'forwarder-health-missing-hosts': 'radio-tower',
            'web-requests-by-host': 'globe',
        };
        const icons = reports.map((report) => iconFor(report).icon);
        assert.deepEqual(Object.fromEntries(reports.map((report, index) => [report.slug, icons[index]])), expected);
        assert.equal(new Set(icons).size, icons.length, 'two demo reports share an icon');
    });

    test('says why it chose an icon', () => {
        assert.deepEqual(iconFor({ title: 'Failed Login Attempts by User', category: 'Security' }), { icon: 'key-round', reason: 'from "login" in the title' });
    });

    test('the title comes first, then the tags, then the description, then the category', () => {
        assert.equal(iconFor({ title: 'Disk usage', tags: ['firewall'], category: 'Security' }).icon, 'hard-drive');
        assert.deepEqual(iconFor({ title: 'Nightly summary', tags: ['firewall'], category: 'Security' }), { icon: 'brick-wall-fire', reason: 'from "firewall" in the tags' });
        assert.equal(iconFor({ title: 'Nightly summary', description: 'Counts DNS lookups.', category: 'Security' }).icon, 'network');
        assert.deepEqual(iconFor({ title: 'Nightly summary', category: 'Compliance' }), { icon: 'clipboard-check', reason: "the Compliance category's icon" });
    });

    test('matches whole words and plurals, and words starting with a starred word', () => {
        assert.equal(iconFor({ title: 'Logins per hour', category: 'Other' }).icon, 'key-round');
        assert.equal(iconFor({ title: 'Authentication failures', category: 'Other' }).icon, 'key-round');
        assert.equal(iconFor({ title: 'Remote-access tunnels', category: 'Other' }).icon, 'globe-lock');
        // "ram" is a whole word only: "random" isn't memory.
        assert.equal(iconFor({ title: 'Random sample', category: 'Other' }).icon, CATEGORY_ICONS.Other);
        assert.equal(iconFor({ title: 'RAM per host', category: 'Other' }).icon, 'memory-stick');
    });
});

describe('the icon list', () => {
    test('every rule and category uses a listed icon, and every category has one', () => {
        for (const { icon } of ICON_RULES) assert.ok(isIconName(icon), icon);
        for (const category of CATEGORIES) assert.ok(isIconName(CATEGORY_ICONS[category]), category);
        assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length, 'a name is listed twice');
    });

    test("a report shows its card's icon, or the guess when the card has none or an unknown one", () => {
        const report = { title: 'Disk usage', category: 'Infrastructure' as const };
        assert.equal(reportIcon({ ...report, icon: 'cloud' }), 'cloud');
        assert.equal(reportIcon({ ...report, icon: '' }), 'hard-drive');
        assert.equal(reportIcon({ ...report, icon: 'no-such-icon' }), 'hard-drive');
        assert.equal(reportIcon(report), 'hard-drive');
    });
});

describe('icon: in a card', () => {
    test('is passed on to the sync', () => {
        const { configs } = parseReportCards('Disk check:\n  slug: disk-check\n  category: Infrastructure\n  icon: cloud\n', 'test.yaml', {});
        assert.equal(configs['Disk check']?.icon, 'cloud');
    });

    test('an unknown name is a readable error that lists the names', () => {
        assert.throws(
            () => parseReportCards('Disk check:\n  slug: disk-check\n  category: Infrastructure\n  icon: disk\n', 'test.yaml', {}),
            (error: unknown) => error instanceof ReportCardsError
                && error.problems.length === 1
                && error.problems[0]!.startsWith(`Disk check → icon: "disk" isn't one of the app's icons. Use one of: shield,`)
                && error.problems[0]!.includes('hard-drive'),
        );
    });
});
