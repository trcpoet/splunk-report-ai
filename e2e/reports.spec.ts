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

test('"Explain report and SPL" sits under Copy SPL query, and opens a panel with the search', async ({ page }) => {
    const errors = watchForErrors(page);
    const { reports } = (await (await page.request.get('/api/reports')).json()) as { reports: ReportSummary[] };
    const [first] = reports.toSorted(byLastRun);
    expect(first, 'the admin should see at least one report').toBeDefined();
    if (!first) return;
    const { report } = (await (await page.request.get(`/api/reports/${first.slug}`)).json()) as { report: SplunkReport };

    await page.goto(`/reports/${report.slug}`);
    const actions = page.locator('.report-actions').filter({ visible: true });
    const labels = await actions.evaluate((group) => [...group.children].filter((child) => child.tagName === 'BUTTON').map((button) => button.textContent.trim()));
    expect(labels[1]).toBe('Copy SPL query');
    expect(labels[2]).toMatch(/^Explain report and SPL/);

    const button = actions.getByRole('button', { name: /Explain report and SPL/ });
    await button.click();
    const panel = page.locator('dialog.explain-panel[open]');
    await expect(panel.getByRole('heading', { name: 'The search (SPL)' })).toBeVisible();
    await expect(panel.locator('pre.spl')).toContainText(report.spl.split('\n')[0] ?? '');
    // The AI's text, or why there is none (CI has no AI key).
    await expect(panel.locator('.explain-section').first().locator('p').first()).not.toBeEmpty({ timeout: 20_000 });

    await screenshot(page, `explain-${report.slug}`);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();

    // With AI off, the explain request answers 503 and the panel says AI is off;
    // the browser logs that 503 as a console error, which is expected here.
    expect(errors.filter((error) => !error.includes('status of 503'))).toEqual([]);
});
