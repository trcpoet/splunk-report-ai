import { defineConfig } from '@playwright/test';

// Browser tests (npm run e2e) against an app that is already running: at
// E2E_BASE_URL, or http://localhost:3000. They sign in as the admin with
// DEMO_PASSWORD (or E2E_PASSWORD), and run in the Chrome installed on the
// machine, which GitHub's runners have too, so no browser is downloaded.
// The same tests run against the dummy reports and against a real Splunk.

// Locally the password is in .env.local; CI sets it in the environment.
try {
    process.loadEnvFile('.env.local');
} catch {
    // No .env.local: the environment has the settings.
}

export const ADMIN_STATE = 'e2e/.auth/admin.json';

export default defineConfig({
    testDir: 'e2e',
    outputDir: 'e2e/results',
    timeout: 60_000,
    // Better Auth limits how often anyone can sign in, so one worker signs in
    // once (auth.setup.ts) and the tests reuse that session.
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
        channel: 'chrome',
        headless: true,
        viewport: { width: 1280, height: 900 },
        reducedMotion: 'reduce',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'sign-in', testMatch: /auth\.setup\.ts/ },
        { name: 'reports', testMatch: /.*\.spec\.ts/, dependencies: ['sign-in'], use: { storageState: ADMIN_STATE } },
    ],
});
