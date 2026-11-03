import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { filtersToSearch, NO_FILTERS, parseFilters } from '@/reports/filters';
import type { ReportCategory } from '@/reports/reports';

const categories: ReportCategory[] = ['Security', 'Operations', 'Infrastructure'];
const parse = (search: string) => parseFilters(new URLSearchParams(search), categories);

describe('parseFilters', () => {
    test('reads the search, status, category and page from the address', () => {
        assert.deepEqual(parse('?q=disk%20space&status=warning&category=infrastructure&page=2'), { query: 'disk space', status: 'warning', category: 'Infrastructure', page: 1 });
        assert.deepEqual(parse('?status=healthy'), { ...NO_FILTERS, status: 'success' });
        assert.deepEqual(parse('?status=late'), { ...NO_FILTERS, status: 'late' });
        assert.deepEqual(parse('?status=no-runs'), { ...NO_FILTERS, status: 'none' });
    });

    test('ignores what it does not know, instead of showing nothing', () => {
        assert.deepEqual(parse('?status=success&category=Finance&page=0'), NO_FILTERS);
        assert.deepEqual(parse('?page=1.5'), NO_FILTERS);
        assert.deepEqual(parse('?page=-3'), NO_FILTERS);
        assert.deepEqual(parse(''), NO_FILTERS);
    });

    test('takes any capitals in a status or category', () => {
        assert.deepEqual(parse('?status=WARNING&category=SECURITY'), { ...NO_FILTERS, status: 'warning', category: 'Security' });
    });
});

describe('filtersToSearch', () => {
    test('writes only what differs from no filters', () => {
        assert.equal(filtersToSearch('', NO_FILTERS), '');
        assert.equal(filtersToSearch('', { query: 'disk', status: 'success', category: 'Infrastructure', page: 2 }), '?q=disk&status=healthy&category=infrastructure&page=3');
    });

    test('keeps the address\'s other parameters, and drops filters set back to all', () => {
        assert.equal(filtersToSearch('?utm=mail&status=warning&page=2', { ...NO_FILTERS, category: 'Security' }), '?utm=mail&category=security');
    });

    test('reads back what it writes', () => {
        const filters = { query: 'web 5xx & more', status: 'late' as const, category: 'Operations' as const, page: 4 };
        assert.deepEqual(parse(filtersToSearch('', filters)), filters);
    });
});
