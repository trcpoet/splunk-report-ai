import type { ReportCategory, ReportHealth } from '@/reports/reports';

// The home page's report filters, kept in the address so a filtered list can
// be shared or bookmarked, and so coming back from a report finds it as it
// was: /?q=disk&status=warning&category=infrastructure&page=2. Pure, so the
// list (src/reports/components/ReportBrowser.tsx) and the tests share it.

// 'late' isn't a status: a late report keeps its newest run's status too, so
// it shows under both.
export type StatusFilter = ReportHealth | 'late' | 'all';

export type Filters = {
    query: string;
    status: StatusFilter;
    category: ReportCategory | 'all';
    // From 0; the address counts from 1.
    page: number;
};

export const NO_FILTERS: Filters = { query: '', status: 'all', category: 'all', page: 0 };

// The chips, in order, with the word each one puts in the address.
export const STATUS_FILTERS: { label: string; value: StatusFilter; param: string }[] = [
    { label: 'All statuses', value: 'all', param: '' },
    { label: 'Healthy', value: 'success', param: 'healthy' },
    { label: 'Warning', value: 'warning', param: 'warning' },
    { label: 'Failed', value: 'failed', param: 'failed' },
    { label: 'Late', value: 'late', param: 'late' },
    { label: 'No runs yet', value: 'none', param: 'no-runs' },
];

// What the address says, checked: an unknown status or category, or a page
// that isn't a whole number from 1, is ignored rather than showing nothing.
export function parseFilters(params: Pick<URLSearchParams, 'get'>, categories: readonly ReportCategory[]): Filters {
    const status = STATUS_FILTERS.find(({ param }) => param && param === params.get('status')?.toLowerCase())?.value ?? 'all';
    const wanted = params.get('category')?.toLowerCase();
    const category = categories.find((name) => name.toLowerCase() === wanted) ?? 'all';
    const page = Number(params.get('page'));
    return {
        query: params.get('q') ?? '',
        status,
        category,
        page: Number.isInteger(page) && page >= 1 ? page - 1 : 0,
    };
}

// The address's query string for these filters ('' for none), keeping any
// other parameters it already has. Defaults are left out, so a plain list is
// a plain address.
export function filtersToSearch(current: string, { query, status, category, page }: Filters): string {
    const params = new URLSearchParams(current);
    const set = (name: string, value: string) => (value ? params.set(name, value) : params.delete(name));
    set('q', query);
    set('status', STATUS_FILTERS.find(({ value }) => value === status)?.param ?? '');
    set('category', category === 'all' ? '' : category.toLowerCase());
    set('page', page > 0 ? String(page + 1) : '');
    const search = params.toString();
    return search ? `?${search}` : '';
}
