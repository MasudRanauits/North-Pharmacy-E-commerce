import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { users } from '../data/testData';

const customerFile = 'playwright/.auth/user.json';
const adminFile = 'playwright/.auth/admin.json';

/**
 * Optional: sign in once and reuse the session across specs.
 *
 * The suites use the `customerPage` / `adminSession` fixtures instead, which
 * log in per test and keep cases independent (required by NP-QA-TC-001 7.2,
 * where every case must be attributable on its own). Wire these up as a
 * `setup` project in playwright.config.ts if you later want shared state.
 */
setup('authenticate as customer', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.open();
  await loginPage.login(users.customer.mobile, users.customer.password);

  await expect(loginPage.accountLink).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: customerFile });
});

setup('authenticate as administrator', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.open();
  await loginPage.login(users.admin.mobile, users.admin.password);

  await expect(loginPage.accountLink).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: adminFile });
});
