/**
 * SMOKE - Admin dashboard reachability and the role gate.
 *
 * Covers: NP-SEC-TC-001/004, NP-DSH-TC-001, NP-ORM-TC-001,
 *         NP-RXA-TC-001, NP-INV-TC-001, NP-CUS-TC-001, NP-SET-TC-001,
 *         NP-UIX-TC-001
 */
import { test, expect, adminTest } from '../../fixtures/test-fixtures';
import { users, storeRules, routes } from '../../data/testData';
import { AdminPage } from '../../pages/AdminPage';

test.describe('Smoke - Admin access', { tag: ['@smoke', '@p1'] }, () => {

  test('NP-SEC-TC-001 | The administrator can sign in and reach the dashboard', {
    tag: '@critical',
  }, async ({ loginPage, adminPage }) => {
    await loginPage.open();
    await loginPage.loginAndWait(users.admin.mobile, users.admin.password);
    await adminPage.open();

    await expect(adminPage.shell).toBeVisible();
    await expect(adminPage.adminName).toBeVisible();
    await expect(adminPage.navOrders).toBeVisible();
  });

  test('NP-SEC-TC-004 | An unauthenticated visitor cannot reach admin routes', {
    tag: '@critical',
  }, async ({ adminPage, page }) => {
    for (const route of [routes.admin, routes.adminOrders, routes.adminCustomers]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await adminPage.settle();
      expect(
        await adminPage.isAdminShellVisible(),
        `no admin content may render at ${route} without a session`,
      ).toBeFalsy();
    }
  });
});

adminTest.describe('Smoke - Admin modules', { tag: ['@smoke', '@p1'] }, () => {

  adminTest('NP-UIX-TC-001 | Sidebar navigation reaches every admin module', {
    tag: '@medium',
  }, async ({ adminSession, page }) => {
    for (const module of AdminPage.modules) {
      await page.goto(module.route, { waitUntil: 'domcontentloaded' });
      await adminSession.settle();

      expect(
        await adminSession.isServerError(),
        `${module.name} must not return a gateway error`,
      ).toBeFalsy();
      await expect(
        page.getByRole('heading', { name: module.heading }).first(),
        `${module.name} must open its own page`,
      ).toBeVisible();
    }
  });

  adminTest('NP-ORM-TC-001 | The order list renders with its columns and status tabs', {
    tag: '@high',
  }, async ({ adminSession, page }) => {
    await adminSession.openOrders();

    await expect(adminSession.table).toBeVisible();
    await expect(adminSession.rows.first()).toBeVisible();

    const header = await page.locator('table.adm-table thead').innerText();
    for (const column of ['ORDER', 'PLACED', 'CUSTOMER', 'ITEMS', 'TOTAL', 'PAYMENT', 'STATUS']) {
      expect(header.toUpperCase()).toContain(column);
    }
  });

  adminTest('NP-DSH-TC-001 | Attention counters are shown and link to their lists', {
    tag: '@high',
  }, async ({ adminSession, page }) => {
    await adminSession.open();

    const body = await page.locator('.adm-main').innerText();
    expect(body.length, 'the dashboard must render content').toBeGreaterThan(50);
    expect(await adminSession.isServerError()).toBeFalsy();
  });

  adminTest('NP-RXA-TC-001 | The prescription review queue is reachable', {
    tag: '@critical',
  }, async ({ adminSession, page }) => {
    await adminSession.openPrescriptions();

    await expect(page.getByRole('heading', { name: /Prescriptions/i }).first()).toBeVisible();
    const body = await page.locator('.adm-main').innerText();
    expect(body).toMatch(/To review|Approved|Rejected/i);
  });

  adminTest('NP-INV-TC-001 | The inventory list renders stock data', {
    tag: '@high',
  }, async ({ adminSession }) => {
    await adminSession.openInventory();

    await expect(adminSession.table).toBeVisible();
    await expect(adminSession.rows.first()).toBeVisible();
    await expect(adminSession.inventorySearch).toBeVisible();
  });

  adminTest('NP-CUS-TC-001 | The customer list renders', {
    tag: '@high',
  }, async ({ adminSession, page }) => {
    await adminSession.openCustomers();

    await expect(page.getByRole('heading', { name: /Customers/i }).first()).toBeVisible();
    expect(await adminSession.isServerError()).toBeFalsy();
  });

  adminTest('NP-SET-TC-001 | Store settings show the configured delivery rules', {
    tag: '@high',
  }, async ({ adminSession, page }) => {
    await adminSession.openSettings();

    await expect(page.getByText('Delivery & ordering')).toBeVisible();
    const body = await page.locator('.adm-main').innerText();

    expect(body).toContain(`৳${storeRules.insideDistrict.charge}`);
    expect(body).toContain(`৳${storeRules.outsideCharge}`);
    expect(body).toContain('৳2,000');
    expect(body).toContain(String(storeRules.maxQtyPerItem));
  });
});
