import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, Page, Browser } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ShopPage } from '../pages/ShopPage';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { AccountPage } from '../pages/AccountPage';
import { PrescriptionPage } from '../pages/PrescriptionPage';
import { AdminPage } from '../pages/AdminPage';
import { users, BASE_URL } from '../data/testData';

type Pages = {
  homePage: HomePage;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  shopPage: ShopPage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  accountPage: AccountPage;
  prescriptionPage: PrescriptionPage;
  adminPage: AdminPage;
};

const AUTH_DIR = path.resolve(__dirname, '..', 'playwright', '.auth');

/**
 * Budget for the one-off sign-in behind the worker-scoped state fixtures.
 *
 * A fixture inherits the 60s test timeout unless it is given its own, and a
 * cold sign-in does not fit inside it: LoginPage.open() allows a 45s
 * navigation plus a 20s hydration wait and then reloads and waits again, and
 * loginAndWait() retries the whole form once if the throttle swallows the
 * first attempt. So whenever the cached state had expired, whichever test ran
 * first paid that cost and died with "Fixture ... timeout of 60000ms exceeded
 * during setup" - a suite-infrastructure failure charged to an innocent test.
 * Size the budget for the slow path instead.
 */
const SIGN_IN_TIMEOUT = 180_000;

/**
 * Sign in once and cache the session on disk.
 *
 * The environment throttles repeated failed and rapid logins (the behaviour
 * NP-LOG-TC-010 asserts), so a suite that logged in per test would start
 * failing on authentication rather than on the thing under test. Each worker
 * authenticates at most once per role and every later test reuses the cookies.
 *
 * Keyed on `parallelIndex`, not `workerIndex`. Playwright starts a fresh
 * worker after any test that fails, and the new worker gets the next
 * `workerIndex` — so on a run with failures the key never repeated, every
 * restart missed the cache and paid a full cold sign-in. That is what left
 * .auth littered with `admin-1080.json` and what made the state fixture blow
 * its setup budget. `parallelIndex` is reused by the replacement worker, so a
 * restart now finds the session its predecessor captured.
 */
async function cachedState(
  browser: Browser,
  role: 'customer' | 'admin',
  parallelIndex: number,
): Promise<string> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const file = path.join(AUTH_DIR, `${role}-${parallelIndex}.json`);

  // Re-use a session captured in the last 20 minutes.
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 20 * 60 * 1000) {
    return file;
  }

  const account = role === 'admin' ? users.admin : users.customer;
  if (account.password.startsWith('set-')) {
    throw new Error(
      `No ${role} credentials configured. Copy .env.example to .env and fill in `
      + 'BASE_URL and the account variables, or export them before running. '
      + 'The repository ships no real credentials.',
    );
  }
  // A hand-made context inherits nothing from config.use, so restate the
  // self-signed-certificate allowance and the base URL here.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: BASE_URL });
  const page = await context.newPage();
  try {
    const login = new LoginPage(page);
    await login.open();
    await login.loginAndWait(account.mobile, account.password);
    await context.storageState({ path: file });
  } finally {
    // Never let teardown overwrite the real reason we got here: a context
    // whose owning test already timed out rejects close() with "Test ended"
    // or a missing-target protocol error, and that used to surface instead of
    // the sign-in failure underneath it.
    await context.close().catch(() => {});
  }
  return file;
}

/** Page objects on a signed-out browser. */
export const test = base.extend<Pages>({
  homePage: async ({ page }, use) => { await use(new HomePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  registerPage: async ({ page }, use) => { await use(new RegisterPage(page)); },
  shopPage: async ({ page }, use) => { await use(new ShopPage(page)); },
  productPage: async ({ page }, use) => { await use(new ProductPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  checkoutPage: async ({ page }, use) => { await use(new CheckoutPage(page)); },
  accountPage: async ({ page }, use) => { await use(new AccountPage(page)); },
  prescriptionPage: async ({ page }, use) => { await use(new PrescriptionPage(page)); },
  adminPage: async ({ page }, use) => { await use(new AdminPage(page)); },
});

/**
 * Every test starts already signed in as the QA customer.
 * `customerPage` is the same authenticated page, exposed for readability.
 */
export const customerTest = test.extend<
  { customerPage: Page },
  { customerStateFile: string }
>({
  customerStateFile: [
    async ({ browser }, use, workerInfo) => {
      await use(await cachedState(browser, 'customer', workerInfo.parallelIndex));
    },
    { scope: 'worker', timeout: SIGN_IN_TIMEOUT },
  ],
  storageState: async ({ customerStateFile }, use) => {
    await use(customerStateFile);
  },
  customerPage: async ({ page }, use) => {
    await use(page);
  },
});

/** Every test starts already signed in as the store administrator. */
export const adminTest = test.extend<
  { adminSession: AdminPage },
  { adminStateFile: string }
>({
  adminStateFile: [
    async ({ browser }, use, workerInfo) => {
      await use(await cachedState(browser, 'admin', workerInfo.parallelIndex));
    },
    { scope: 'worker', timeout: SIGN_IN_TIMEOUT },
  ],
  storageState: async ({ adminStateFile }, use) => {
    await use(adminStateFile);
  },
  adminSession: async ({ page }, use) => {
    const admin = new AdminPage(page);
    await admin.open();
    await use(admin);
  },
});

export { expect };
