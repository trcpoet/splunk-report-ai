import { expect, test as setup } from '@playwright/test';
import { ADMIN_STATE } from '../playwright.config';

// Signs in once through the login form, as a person would, and keeps the
// session for the other tests.
setup('signs in as the admin through the login form', async ({ page }) => {
    const password = process.env.E2E_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';
    expect(password, 'Set DEMO_PASSWORD (or E2E_PASSWORD) to the demo accounts\' password.').not.toBe('');

    await page.goto('/login');
    // A click before React has hydrated the form does nothing, so wait for it.
    await page.waitForFunction(() => {
        const form = document.querySelector('form');
        return form !== null && Object.keys(form).some((key) => key.startsWith('__reactProps'));
    });
    await page.locator('input[name=email]').fill('admin@example.com');
    await page.locator('input[name=password]').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
    await page.context().storageState({ path: ADMIN_STATE });
});
