import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ReportSummary, SplunkReport } from '@/lib/reports';

// The report list and a report page, signed in as the admin, who sees every
// report. Works against the dummy reports and against a real Splunk.
// E2E_SCREENSHOTS=<folder> also saves a screenshot of each page checked.

const MAX_CARDS = 20;

// Console errors and uncaught exceptions, so a test can say there were none.
function watchForErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return errors;
}

async function screenshot(page: Page, name: string) {
    const folder = process.env.E2E_SCREENSHOTS;
    if (!folder) return;
    mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
}

// The list's order: newest last run first, no run last, then by title.
const byLastRun = (a: ReportSummary, b: ReportSummary) => {
    const time = ({ lastRun }: ReportSummary) => (lastRun ? Date.parse(lastRun) : Number.NEGATIVE_INFINITY);
    return time(a) === time(b) ? a.title.localeCompare(b.title) : time(b) - time(a);
};

test('the home page lists at most 20 reports, newest run first, each with its latest number', async ({ page }) => {
    const errors = watchForErrors(page);
    const response = await page.request.get('/api/reports');
    expect(response.ok()).toBe(true);
    const { reports } = (await response.json()) as { reports: ReportSummary[] };
    expect(reports.length, 'the admin should see at least one report').toBeGreaterThan(0);

    await page.goto('/');
    const cards = page.locator('#reports .report-card').filter({ visible: true });
    await expect(cards.first()).toBeVisible();

    const titles = await cards.locator('.title').allInnerTexts();
    expect(titles.length).toBeLessThanOrEqual(MAX_CARDS);
    expect(titles).toEqual(reports.toSorted(byLastRun).slice(0, MAX_CARDS).map(({ title }) => title));

    // A report that has run shows its headline number; one that hasn't says so.
    for (const card of await cards.all()) {
        const badge = await card.locator('.status-badge').innerText();
        if (badge.includes('No runs yet')) continue;
        await expect(card.locator('.card-headline .value')).not.toBeEmpty();
    }

    if (reports.length > MAX_CARDS) await expect(page.getByRole('group', { name: 'Report pages' })).toBeVisible();

    await screenshot(page, 'home');
    expect(errors).toEqual([]);
});

test('a report page shows its chart and its results table', async ({ page }) => {
    const errors = watchForErrors(page);
    const { reports } = (await (await page.request.get('/api/reports')).json()) as { reports: ReportSummary[] };

    // The first report, newest first, whose latest results have a chart.
    let charted: SplunkReport | undefined;
    for (const { slug } of reports.toSorted(byLastRun)) {
        const { report } = (await (await page.request.get(`/api/reports/${slug}`)).json()) as { report: SplunkReport };
        if (report.chart && report.rows.length > 0) {
            charted = report;
            break;
        }
    }
    expect(charted, 'at least one report should have a chart').toBeDefined();
    if (!charted) return;

    await page.goto(`/reports/${charted.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: charted.title })).toBeVisible();
    await expect(page.locator('.chart-card svg.recharts-surface').first()).toBeVisible();

    const table = page.locator('table.results-table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr').first()).toBeVisible();

    await screenshot(page, `report-${charted.slug}`);
    expect(errors).toEqual([]);
});
