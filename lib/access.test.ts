import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { canView } from '@/lib/access';
import { DEMO_USERS } from '@/lib/demo-users';
import { reportConfig } from '@/lib/report-config';
import { reports as fixtures } from '@/lib/splunk/fixtures/reports';
import { groupsFromRecipients } from '@/lib/splunk/map';

describe('canView', () => {
    test('admins see every report, including admin-only ones', () => {
        assert.equal(canView({ role: 'admin', groups: [] }, ['secops']), true);
        assert.equal(canView({ role: 'admin', groups: [] }, []), true);
    });

    test('viewers need at least one group in common', () => {
        assert.equal(canView({ role: 'viewer', groups: ['sre', 'secops'] }, ['secops', 'soc-tier1']), true);
        assert.equal(canView({ role: 'viewer', groups: ['sre'] }, ['secops', 'soc-tier1']), false);
        assert.equal(canView({ role: 'viewer', groups: [] }, ['secops']), false);
    });

    test('a report with no groups is admin-only', () => {
        assert.equal(canView({ role: 'viewer', groups: ['secops'] }, []), false);
    });

    test('group names must match exactly', () => {
        assert.equal(canView({ role: 'viewer', groups: ['SecOps'] }, ['secops']), false);
    });
});

describe('demo users', () => {
    // allowedGroups the way the sync works them out for the dummy reports.
    const allowedGroups = (title: string, recipients: string[]) => reportConfig[title]?.groups ?? groupsFromRecipients(recipients);

    const visibleTo = (email: string) => {
        const user = DEMO_USERS.find((candidate) => candidate.email === email);
        assert.ok(user, `no demo user ${email}`);

        return fixtures
            .filter((fixture) => canView(user, allowedGroups(fixture.title, fixture.recipients)))
            .map((fixture) => fixture.slug)
            .sort();
    };

    test('each demo user sees the reports from the plan', () => {
        assert.equal(visibleTo('admin@example.com').length, fixtures.length);
        assert.deepEqual(visibleTo('soc.analyst@example.com'), ['failed-logins-by-user', 'firewall-denied-top-sources', 'privileged-group-changes']);
        assert.deepEqual(visibleTo('sre.oncall@example.com'), ['disk-space-over-85', 'forwarder-health-missing-hosts', 'web-5xx-error-rate']);
        assert.deepEqual(visibleTo('finance.analyst@example.com'), ['license-usage-by-index', 'payments-volume-latency']);
        assert.deepEqual(visibleTo('it.director@example.com'), ['failed-logins-by-user', 'vpn-sessions-by-country']);
    });
});
