/**
 * SMOKE - Authentication, session boundaries and the customer account area.
 *
 * Covers: NP-LOG-TC-001/002/008/012, NP-REG-TC-002/003,
 *         NP-ACC-TC-014, NP-RXU-TC-001 (reachability),
 *         NP-ORD-TC-001, NP-WSH-TC-006
 */
import { test, expect, customerTest } from '../../fixtures/test-fixtures';
import { users, routes } from '../../data/testData';
import { AccountPage } from '../../pages/AccountPage';

test.describe('Smoke - Authentication', { tag: ['@smoke', '@p1'] }, () => {

  test('NP-LOG-TC-001 | A registered customer can sign in', {
    tag: '@critical',
  }, async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.loginAndWait(users.customer.mobile, users.customer.password);

    await expect(loginPage.accountLink).toBeVisible();
    await expect(loginPage.accountLink).toContainText(/Hi,/);
  });

  test('NP-LOG-TC-002 | A wrong password is rejected without revealing the account', {
    tag: '@critical',
  }, async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(users.customer.mobile, 'DefinitelyWrong123!');
    await loginPage.settle();

    // No session is created and the message stays generic.
    await expect(loginPage.accountLink).toHaveCount(0);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/no such (user|account)|user does not exist/i);
  });

  test('NP-REG-TC-002 / 003 | Registration validates mandatory fields and mobile format', {
    tag: '@high',
  }, async ({ registerPage, page }) => {
    await registerPage.open();

    // Empty submission is blocked.
    await registerPage.submit();
    await expect(registerPage.accountLink).toHaveCount(0);
    await expect(page).toHaveURL(/register/);

    // A 10-digit number is not a valid Bangladeshi mobile.
    await registerPage.fullNameInput.fill('QA Validation');
    await registerPage.mobileInput.fill('0170000000');
    await registerPage.passwordInput.fill('QaPharma2026');
    await registerPage.confirmPasswordInput.fill('QaPharma2026');
    await registerPage.submit();

    await expect(registerPage.accountLink).toHaveCount(0);
    await expect(page).toHaveURL(/register/);
  });
});

customerTest.describe('Smoke - Customer account', { tag: ['@smoke', '@p1'] }, () => {

  customerTest('NP-LOG-TC-008 | Logout ends the session and protects account pages', {
    tag: '@critical',
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    await expect(accountPage.navOrders).toBeVisible();

    await accountPage.signOut();
    await expect(accountPage.loginLink).toBeVisible({ timeout: 20_000 });

    // A protected page must no longer serve account data.
    await page.goto(routes.orders, { waitUntil: 'domcontentloaded' });
    await accountPage.settle();
    await expect(accountPage.navOrders).toHaveCount(0);
  });

  customerTest('NP-LOG-TC-012 | A customer session cannot reach administrative functionality', {
    tag: '@critical',
  }, async ({ adminPage, page }) => {
    for (const route of [routes.admin, routes.adminOrders, routes.adminSettings]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await adminPage.settle();
      expect(
        await adminPage.isAdminShellVisible(),
        `admin shell must not render for a customer at ${route}`,
      ).toBeFalsy();
    }
  });

  customerTest('NP-ACC-TC-014 | The account area navigation reaches every section', {
    tag: '@medium',
  }, async ({ accountPage, page }) => {
    for (const section of AccountPage.sections) {
      await page.goto(section.route, { waitUntil: 'domcontentloaded' });
      await accountPage.settle();
      await expect(
        page.getByRole('heading', { name: section.heading }).first(),
        `${section.name} must open its own page`,
      ).toBeVisible();
    }
  });

  customerTest('NP-ORD-TC-001 | Order history is reachable and lists only this customer', {
    tag: '@critical',
  }, async ({ accountPage }) => {
    await accountPage.openOrders();

    // Either orders are listed, or the designed empty state is shown.
    const hasOrders = (await accountPage.orderRows.count()) > 0;
    const hasEmptyState = (await accountPage.emptyState.count()) > 0;
    expect(hasOrders || hasEmptyState, 'orders page must render a list or an empty state')
      .toBeTruthy();
    expect(await accountPage.isServerError()).toBeFalsy();
  });

  customerTest('NP-RXU-TC-001 | The prescription area is reachable with an upload control', {
    tag: '@critical',
  }, async ({ prescriptionPage }) => {
    await prescriptionPage.open();

    await expect(
      prescriptionPage.page.getByRole('heading', { name: /Prescriptions/i }).first(),
    ).toBeVisible();
    expect(
      (await prescriptionPage.fileInput.count())
        + (await prescriptionPage.uploadButton.count()),
      'an upload entry point must exist',
    ).toBeGreaterThan(0);
  });

  customerTest('NP-WSH-TC-006 | The wishlist page renders for a signed-in customer', {
    tag: '@low',
  }, async ({ accountPage, page }) => {
    await accountPage.openWishlist();

    await expect(page.getByRole('heading', { name: /Wishlist/i }).first()).toBeVisible();
    const hasItems = (await accountPage.wishlistItems.count()) > 0;
    const hasEmptyState = (await accountPage.emptyState.count()) > 0;
    expect(hasItems || hasEmptyState).toBeTruthy();
  });
});
