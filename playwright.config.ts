import { defineConfig, devices } from '@playwright/test';

/**
 * North Pharmacy — Playwright configuration.
 * Suites: tests/smoke, tests/regression, tests/E2E, tests/api.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,

  /**
   * One worker, deliberately.
   *
   * The environment issues a single shared QA customer account and a single
   * administrator. Running workers in parallel makes them fight over one cart,
   * one wishlist and one session, and repeated concurrent logins trip the
   * brute-force throttle covered by NP-LOG-TC-010. Raise this only once each
   * worker can be given its own account.
   */
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://localhost:1165',

    /* NP-QA-TC-001 §2.5: the IP test host uses a self-signed certificate.
       Accepting it is an environment artefact, not a defect. */
    ignoreHTTPSErrors: true,

    headless: false,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    // {
    //   name: 'firefox',
    //   testIgnore: /.*\.setup\.ts/,
    //   use: { ...devices['Desktop Firefox'], viewport: { width: 1920, height: 1080 } },
    // },
    // /* Mobile projects back the NP-CMP / NP-RSP cases. */
    // {
    //   name: 'mobile-chrome',
    //   testIgnore: /.*\.setup\.ts/,
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'mobile-safari',
    //   testIgnore: /.*\.setup\.ts/,
    //   use: { ...devices['iPhone 12'] },
    // },
  ],
});
