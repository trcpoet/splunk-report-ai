import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { sortByLastRun, type ReportSummary, type SplunkReport } from '@/lib/reports';

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

test('the home page lists at most 20 reports, newest run first, each with its latest number', async ({ page }) => {
    const errors = watchForErrors(page);
    const response = await page.request.get('/api/reports');
    expect(response.ok()).toBe(true);
    const { reports } = (await response.json()) as { reports: ReportSummary[] };
    expect(reports.length, 'the admin should see at least one report').toBeGreaterThan(0);

    await page.goto('/');
    // The loading placeholders look like cards, so wait for the real list.
    await expect(page.locator('#reports').getByText(/^Showing /)).toBeVisible();
    const cards = page.locator('#reports .report-card').filter({ visible: true });

    const titles = await cards.locator('.title').allInnerTexts();
    const expected = sortByLastRun(reports).slice(0, MAX_CARDS);
    expect(titles.length).toBeLessThanOrEqual(MAX_CARDS);
    expect(titles).toEqual(expected.map(({ title }) => title));

    // Each card shows the number its report's latest results give, if any: a
    // report whose runs all failed, or that hasn't run, has none.
    for (const [i, summary] of expected.entries()) {
        const headline = cards.nth(i).locator('.card-headline .value');
        if (summary.headline) await expect(headline).toHaveText(summary.headline.value);
        else await expect(headline).toHaveCount(0);
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
    for (const { slug } of sortByLastRun(reports)) {
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
