import { expect, test, type APIResponse } from '@playwright/test';
import type { ReportSummary } from '@/reports/reports';

// Who may read what, over HTTP, as src/reports/dal.ts and the auth route
// decide it: signed-out visitors get 401, a viewer gets 404 for every report
// outside their groups, and the Better Auth endpoints the app doesn't use
// answer 404 (src/app/api/auth/[...all]/route.ts). Works against the dummy
// reports and against a real Splunk, with the demo accounts.

const slugs = async (response: APIResponse) => ((await response.json()) as { reports: ReportSummary[] }).reports.map(({ slug }) => slug);

test('a viewer reads only their groups\' reports, and unused auth endpoints are closed', async ({ request, playwright, baseURL }) => {
    const password = process.env.E2E_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';
    // Better Auth refuses a POST without the site's own Origin.
    const headers = { Origin: baseURL ?? '' };
    // New contexts get the project's saved admin session unless told otherwise.
    const signedOutContext = () => playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

    const signedOut = await signedOutContext();
    expect((await signedOut.get('/api/reports')).status()).toBe(401);
    await signedOut.dispose();

    const viewer = await signedOutContext();
    const signIn = await viewer.post('/api/auth/sign-in/email', { data: { email: 'finance.analyst@example.com', password }, headers });
    expect(signIn.ok(), 'signing in as the finance analyst').toBe(true);

    // `request` is the admin, who sees every report.
    const all = await slugs(await request.get('/api/reports'));
    const visible = await slugs(await viewer.get('/api/reports'));
    const hidden = all.filter((slug) => !visible.includes(slug));
    expect(hidden.length, 'the admin should see reports the finance analyst can\'t').toBeGreaterThan(0);
    for (const slug of hidden) expect((await viewer.get(`/api/reports/${slug}`)).status(), slug).toBe(404);

    // A wrong current password, so even an open endpoint couldn't change the shared one.
    const changePassword = await viewer.post('/api/auth/change-password', { data: { currentPassword: 'not-the-password', newPassword: 'not-the-password-2' }, headers });
    expect(changePassword.status()).toBe(404);
    await viewer.dispose();
});
