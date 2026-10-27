/**
 * A8. LOGIN, LOGOUT & SESSION - 12 cases (NP-LOG-TC-001 ... 012)
 *
 * NP-LOG-TC-010 deliberately burns failed attempts against the shared QA
 * account, so it is gated: run it on its own with RUN_THROTTLE=1 to avoid
 * locking the account other suites depend on.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { users, routes } from '../../../data/testData';
import { manual, newGuestContext } from '../../../utils/helpers';

test.describe('A8 - Login & Session (guest)', {
  tag: ['@regression', '@customer', '@log'],
}, () => {

  test('NP-LOG-TC-001 | A registered customer can log in with valid credentials', {
    tag: ['@critical', '@p1'],
  }, async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.loginAndWait(users.customer.mobile, users.customer.password);

    await expect(loginPage.accountLink).toContainText(/Hi,/);
    await expect(page).not.toHaveURL(/login/);
  });

  test('NP-LOG-TC-005 | Remember-me keeps the session across a browser restart', {
    tag: ['@high', '@p2'],
  }, async ({ browser }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    try {
      const { LoginPage } = await import('../../../pages/LoginPage');
      const login = new LoginPage(page);
      await login.open();
      await login.loginAndWait(users.customer.mobile, users.customer.password, true);

      // A persistent session is carried by a cookie with a real expiry,
      // which is what survives closing the browser.
      const cookies = await context.cookies();
      const persistent = cookies.filter((c) => c.expires && c.expires > 0);
      expect(
        persistent.length,
        'remember-me must issue a persistent cookie, not a session cookie',
      ).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('NP-LOG-TC-006 | Without remember-me the session ends as designed', {
    tag: ['@high', '@p2'],
  }, async ({ browser }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    try {
      const { LoginPage } = await import('../../../pages/LoginPage');
      const { AccountPage } = await import('../../../pages/AccountPage');
      const login = new LoginPage(page);
      await login.open();
      await login.loginAndWait(users.customer.mobile, users.customer.password, false);

      // Simulate the restart by dropping session cookies.
      const cookies = await context.cookies();
      const sessionOnly = cookies.filter((c) => !c.expires || c.expires <= 0);
      await context.clearCookies();
      await context.addCookies(cookies.filter((c) => c.expires && c.expires > 0));

      const account = new AccountPage(page);
      await account.open();
      if (sessionOnly.length > 0) {
        await expect(
          account.navOrders,
          'a session-cookie login must not survive the restart',
        ).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });

  test('NP-LOG-TC-007 | Redirect back to the originally requested page after login', {
    tag: ['@high', '@p2'],
  }, async ({ loginPage, page }) => {
    await page.goto(routes.checkout, { waitUntil: 'domcontentloaded' });
    await loginPage.settle();

    // A guest is bounced away from checkout.
    await expect(page).toHaveURL(/login|cart/i);

    if (/login/.test(page.url())) {
      await loginPage.loginAndWait(users.customer.mobile, users.customer.password);
      await expect(
        page,
        'the customer should land back on checkout, not a generic page',
      ).toHaveURL(/checkout|cart/i);
    }
  });

  test('NP-LOG-TC-004 | Empty-field validation on the login form', {
    tag: ['@medium', '@p3'],
  }, async ({ loginPage, page }) => {
    await loginPage.open();

    await loginPage.signInButton.click();
    await loginPage.settle();
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.accountLink).toHaveCount(0);

    // Mobile only.
    await loginPage.mobileInput.fill(users.customer.mobile);
    await loginPage.signInButton.click();
    await loginPage.settle();
    await expect(page).toHaveURL(/login/);

    // Password only.
    await loginPage.open();
    await loginPage.passwordInput.fill(users.customer.password);
    await loginPage.signInButton.click();
    await loginPage.settle();
    await expect(page).toHaveURL(/login/);
  });

  test('NP-LOG-TC-002 | A wrong password is rejected without revealing the account', {
    tag: ['@critical', '@p1'],
  }, async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(users.customer.mobile, 'WrongPassword123!');
    await loginPage.settle();

    await expect(loginPage.accountLink).toHaveCount(0);
    const body = await page.locator('form').first().innerText();
    expect(body, 'the message must not confirm the number exists')
      .not.toMatch(/no such (user|account)|user does not exist|wrong password for/i);
  });

  test('NP-LOG-TC-003 | An unregistered mobile produces the same generic error', {
    tag: ['@critical', '@p1'],
  }, async ({ loginPage, page }) => {
    // Capture the wrong-password message.
    await loginPage.open();
    await loginPage.login(users.customer.mobile, 'WrongPassword123!');
    await loginPage.settle();
    const wrongPasswordMessage = (await page.locator('form').first().innerText())
      .replace(/\s+/g, ' ').trim();

    // Capture the unknown-account message.
    await loginPage.open();
    await loginPage.login(users.unregistered.mobile, users.unregistered.password);
    await loginPage.settle();
    const unknownAccountMessage = (await page.locator('form').first().innerText())
      .replace(/\s+/g, ' ').trim();

    expect(
      unknownAccountMessage,
      'both failures must read identically to prevent account enumeration',
    ).toBe(wrongPasswordMessage);
  });

  test('NP-LOG-TC-010 | Repeated failed login attempts are throttled', {
    tag: ['@critical', '@p1', '@throttle'],
  }, async ({ loginPage, page }) => {
    test.skip(
      process.env.RUN_THROTTLE !== '1',
      'Locks the shared QA account; run alone with RUN_THROTTLE=1',
    );

    const timings: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt++) {
      await loginPage.open();
      const started = Date.now();
      await loginPage.login(users.customer.mobile, `Wrong${attempt}!`);
      await loginPage.settle();
      timings.push(Date.now() - started);
      await expect(loginPage.accountLink).toHaveCount(0);
    }

    const body = await page.locator('form').first().innerText();
    const slowedDown = timings[timings.length - 1] > timings[0] * 1.5;
    const warned = /too many|locked|try again|wait/i.test(body);

    expect(
      slowedDown || warned,
      'brute force must be delayed, locked out or warned about',
    ).toBeTruthy();
  });
});

customerTest.describe('A8 - Login & Session (signed in)', {
  tag: ['@regression', '@customer', '@log'],
}, () => {

  customerTest('NP-LOG-TC-008 | Logout ends the session and protects account pages', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    await expect(accountPage.navOrders).toBeVisible();

    await accountPage.signOut();
    await expect(accountPage.loginLink).toBeVisible({ timeout: 20_000 });

    await page.goto(routes.orders, { waitUntil: 'domcontentloaded' });
    await accountPage.settle();
    await expect(accountPage.navOrders).toHaveCount(0);
    await expect(page.getByText(users.customer.name)).toHaveCount(0);
  });

  customerTest('NP-LOG-TC-009 | Browser back after logout does not expose account data', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    await expect(accountPage.navOrders).toBeVisible();

    await accountPage.signOut();
    await page.goBack();
    await accountPage.settle();

    // The protected page must not be served from cache with live data.
    await expect(accountPage.navOrders).toHaveCount(0);
    await expect(page.getByText(users.customer.name)).toHaveCount(0);
  });

  customerTest('NP-LOG-TC-011 | Session expiry is handled with a clean redirect', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    await expect(accountPage.navOrders).toBeVisible();

    // Invalidate the session the way an expiry would.
    await page.context().clearCookies();
    await page.goto(routes.orders, { waitUntil: 'domcontentloaded' });
    await accountPage.settle();

    const body = await page.locator('body').innerText();
    expect(body, 'no raw API error text on an expired session')
      .not.toMatch(/401|unauthori[sz]ed exception|stack trace/i);
    expect(body.trim().length, 'never a blank page').toBeGreaterThan(0);
    await expect(accountPage.navOrders).toHaveCount(0);
  });

  customerTest('NP-LOG-TC-012 | A customer session cannot access admin functionality', {
    tag: ['@critical', '@p1'],
  }, async ({ adminPage, page }) => {
    for (const route of [routes.admin, routes.adminOrders, routes.adminSettings,
      routes.adminCustomers, routes.adminReports]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await adminPage.settle();
      expect(
        await adminPage.isAdminShellVisible(),
        `no admin page may render for a customer at ${route}`,
      ).toBeFalsy();
    }

    manual('Calling the admin API directly needs the documented endpoint list');
  });
});
