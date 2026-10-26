import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { safeNextPath } from '@/lib/next-path';

describe('safeNextPath', () => {
    test('keeps paths on this site, with their query and hash', () => {
        assert.equal(safeNextPath('/reports/web-5xx-error-rate'), '/reports/web-5xx-error-rate');
        assert.equal(safeNextPath('/?tab=all#reports'), '/?tab=all#reports');
    });

    test('falls back to the home page without a usable path', () => {
        for (const next of [undefined, null, '', ['/a', '/b']]) assert.equal(safeNextPath(next), '/', String(next));
    });

    test('never leaves the site', () => {
        for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', 'javascript:alert(1)']) {
            assert.equal(safeNextPath(next), '/', next);
        }
    });

    test('never loops back to the login page', () => {
        assert.equal(safeNextPath('/login'), '/');
        assert.equal(safeNextPath('/login?next=/'), '/');
    });
});
