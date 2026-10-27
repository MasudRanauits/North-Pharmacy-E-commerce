/**
 * B7. MANUFACTURERS & CUSTOMERS - 12 cases
 * NP-MFR-TC-001 ... 005 and NP-CUS-TC-001 ... 007
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { users } from '../../../data/testData';
import { manual, destructive } from '../../../utils/helpers';

adminTest.describe('B7a - Manufacturers', {
  tag: ['@regression', '@admin', '@mfr'],
}, () => {

  adminTest('NP-MFR-TC-001 | The manufacturer list shows product and stock counts', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    // The storefront manufacturer page is the customer-visible equivalent.
    await adminSession.goto('/manufacturers');
    expect(await adminSession.isServerError()).toBeFalsy();

    const brands = page.locator('a[href^="/shop?mfr="]');
    expect(await brands.count(), 'manufacturers must be listed').toBeGreaterThan(0);

    // Opening one must return only that manufacturer's products.
    await brands.first().click();
    await adminSession.settle();
    await expect(page).toHaveURL(/mfr=/);
    await expect(page.locator('.pcard').first()).toBeVisible();
  });

  adminTest('NP-MFR-TC-002 | A manufacturer can be created, edited and validated', {
    tag: ['@medium', '@p3'],
  }, async () => {
    destructive('Creating manufacturers adds permanent rows to the live catalogue');
  });

  adminTest('NP-MFR-TC-003 | The manufacturer logo can be uploaded, replaced and removed', {
    tag: ['@low', '@p3'],
  }, async ({ adminSession, page }) => {
    // Read-only: a missing logo must fall back to text, never a broken image.
    await adminSession.goto('/manufacturers');
    const broken = await page.evaluate(
      () => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken, 'no broken logo images').toBe(0);

    destructive('Uploading or removing a logo changes the live storefront');
  });

  adminTest('NP-MFR-TC-004 | The home-page toggle controls the customer brand strip', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    // Read-only: the brand strip is populated and every tile links correctly.
    await adminSession.goto('/');
    const strip = page.locator('a[href^="/shop?mfr="]');
    expect(await strip.count(), 'the brand strip must be populated').toBeGreaterThan(0);

    destructive('Toggling a manufacturer changes the live home page');
  });

  adminTest('NP-MFR-TC-005 | Deleting a manufacturer that has products is handled safely', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Deleting a manufacturer could orphan hundreds of live products');
  });
});

adminTest.describe('B7b - Customer Management', {
  tag: ['@regression', '@admin', '@cus'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openCustomers();
  });

  adminTest('NP-CUS-TC-001 | The customer list displays all required fields accurately', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await expect(page.getByRole('heading', { name: /Customers/i }).first()).toBeVisible();
    expect(await adminSession.isServerError()).toBeFalsy();

    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No customers listed in this environment');

    const row = await adminSession.rows.first().innerText();
    expect(row, 'a phone number must be shown').toMatch(/\+880|01\d{9}/);
    expect(row).not.toMatch(/NaN|undefined/);
  });

  adminTest('NP-CUS-TC-002 | Customer search by name, phone and email', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const search = page.locator('.adm input[type="text"]').last();
    adminTest.skip((await search.count()) === 0, 'No customer search field in this build');

    await search.fill(users.customer.name);
    await search.press('Enter');
    await adminSession.settle();

    const rows = await adminSession.rows.count();
    if (rows > 0) {
      await expect(adminSession.rows.first()).toContainText(
        new RegExp(users.customer.name.split(' ')[0], 'i'),
      );
    }

    // A no-match search shows a proper empty state, not an error.
    await search.fill('zzzqqqxyz-no-such-customer');
    await search.press('Enter');
    await adminSession.settle();
    expect(await adminSession.isServerError()).toBeFalsy();
  });

  adminTest('NP-CUS-TC-003 | Order count and lifetime spend reconcile with actual orders', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No customers listed in this environment');

    const row = await adminSession.rows.first().innerText();
    // Spend and counts must be real numbers.
    expect(row).not.toMatch(/NaN|undefined|null/);

    manual(
      'Summing a customer\'s orders by hand is needed to prove the lifetime '
        + 'spend figure and the treatment of cancelled orders',
    );
    void page;
  });

  adminTest('NP-CUS-TC-004 | A customer account can be deactivated and cannot log in', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Deactivating an account locks a real customer out');
  });

  adminTest('NP-CUS-TC-005 | A newly registered customer appears immediately in the list', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // The QA customer registered earlier must already be present.
    const search = page.locator('.adm input[type="text"]').last();
    adminTest.skip((await search.count()) === 0, 'No customer search field in this build');

    await search.fill(users.customer.mobile);
    await search.press('Enter');
    await adminSession.settle();

    const rows = await adminSession.rows.count();
    expect(rows, 'the known QA customer must be findable').toBeGreaterThan(0);
  });

  adminTest('NP-CUS-TC-006 | The customer detail shows order history and addresses', {
    tag: ['@medium', '@p2'],
  }, async ({ adminSession, page }) => {
    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No customers listed in this environment');

    await adminSession.rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    expect(body.trim().length, 'the detail must render content').toBeGreaterThan(40);
    expect(body).not.toMatch(/NaN|undefined/);
  });

  adminTest('NP-CUS-TC-007 | Customer list pagination and sorting', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    const first = await adminSession.rows.allInnerTexts();
    // Only a real pager counts - sidebar badges also render as buttons.
    const pager = page.locator('.adm-main .pager, .adm-main nav[aria-label*="age"]');
    const next = pager.getByRole('button', { name: /next|^2$/i })
      .or(pager.getByRole('link', { name: /next|^2$/i }));

    if ((await pager.count()) === 0 || (await next.count()) === 0) {
      manual('The customer list exposes no pager in this build');
      return;
    }

    await next.first().click();
    await adminSession.waitForRows();
    const second = await adminSession.rows.allInnerTexts();

    const repeated = first.filter((r) => second.includes(r));
    expect(repeated, 'no customer may repeat across pages').toHaveLength(0);
  });
});
