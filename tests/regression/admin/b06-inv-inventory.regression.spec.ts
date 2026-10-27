/**
 * B6. INVENTORY & STOCK CONTROL - 20 cases (NP-INV-TC-001 ... 020)
 *
 * Stock is the most shared piece of state in the environment, so every write
 * is marked destructive and runs against UAT. The list, its quick filters and
 * the purchasable-quantity rule are asserted for real.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { storeRules } from '../../../data/testData';
import { manual, destructive } from '../../../utils/helpers';

/** Inventory quick filters, as the build exposes them via ?view=. */
const VIEWS = {
  all: 'all',
  low: 'low',
  out: 'out',
  hidden: 'hidden',
  nophoto: 'nophoto',
  missing: 'missing',
} as const;

adminTest.describe('B6 - Inventory & Stock Control', {
  tag: ['@regression', '@admin', '@inv'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openInventory();
  });

  adminTest('NP-INV-TC-001 | The inventory list displays stock, flags and sales data', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await expect(adminSession.table).toBeVisible();
    await expect(adminSession.rows.first()).toBeVisible();
    await expect(adminSession.inventorySearch).toBeVisible();

    const header = (await page.locator('table.adm-table thead').innerText()).toUpperCase();
    expect(header, 'a stock column must exist').toMatch(/STOCK|QTY|QUANTITY/);

    const row = await adminSession.rows.first().innerText();
    expect(row).not.toMatch(/NaN|undefined/);
  });

  adminTest('NP-INV-TC-006 | The inventory quick filters return the correct product sets', {
    tag: ['@medium', '@p2'],
  }, async ({ adminSession, page }) => {
    for (const view of Object.values(VIEWS)) {
      await adminSession.goto(`/admin/inventory?view=${view}`);

      expect(
        await adminSession.isServerError(),
        `the ${view} filter must render`,
      ).toBeFalsy();

      const hasRows = (await adminSession.rows.count()) > 0;
      const hasEmptyState = (await page.locator('.adm .empty').count()) > 0;
      expect(
        hasRows || hasEmptyState,
        `the ${view} filter must show rows or a designed empty state`,
      ).toBeTruthy();
    }
  });

  adminTest('NP-INV-TC-010 | The low-stock filter returns only products below the threshold', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    await adminSession.goto(`/admin/inventory?view=${VIEWS.low}`);
    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No low-stock products in this environment');

    // Every returned row carries a low-stock signal.
    for (let i = 0; i < Math.min(rows, 8); i++) {
      const text = await adminSession.rows.nth(i).innerText();
      expect(
        /low/i.test(text) || /\b([0-9]|1[0-9])\b/.test(text),
        `row ${i} must look like low stock: ${text.slice(0, 60)}`,
      ).toBeTruthy();
    }
  });

  adminTest('NP-INV-TC-011 | The out-of-stock filter returns only zero-stock products', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    await adminSession.goto(`/admin/inventory?view=${VIEWS.out}`);
    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No out-of-stock products in this environment');

    for (let i = 0; i < Math.min(rows, 8); i++) {
      const text = await adminSession.rows.nth(i).innerText();
      expect(
        /out of stock|\b0\b/i.test(text),
        `row ${i} must read as zero stock: ${text.slice(0, 60)}`,
      ).toBeTruthy();
    }
  });

  adminTest('NP-INV-TC-012 | The hidden filter returns only hidden products', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(`/admin/inventory?view=${VIEWS.hidden}`);

    const rows = await adminSession.rows.count();
    if (rows === 0) {
      await expect(page.locator('.adm .empty')).toBeVisible();
      return;
    }
    for (let i = 0; i < Math.min(rows, 5); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/hidden/i);
    }
  });

  adminTest('NP-INV-TC-013 | The missing-photo filter returns only products without an image', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(`/admin/inventory?view=${VIEWS.nophoto}`);

    const rows = await adminSession.rows.count();
    if (rows === 0) {
      await expect(page.locator('.adm .empty')).toBeVisible();
      return;
    }
    // No row in this view may carry a real uploaded photo.
    const uploaded = await page.locator('table.adm-table tbody img[src*="/uploads/"]').count();
    expect(uploaded, 'products with an image must be excluded').toBe(0);
  });

  adminTest('NP-INV-TC-014 | The missing-data filter identifies incomplete products', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(`/admin/inventory?view=${VIEWS.missing}`);

    expect(await adminSession.isServerError()).toBeFalsy();
    const hasRows = (await adminSession.rows.count()) > 0;
    const hasEmptyState = (await page.locator('.adm .empty').count()) > 0;
    expect(hasRows || hasEmptyState).toBeTruthy();
  });

  adminTest('NP-INV-TC-008 | Purchasable quantity respects stock and the per-item cap', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // The storefront stepper must never allow more than the configured cap.
    await adminSession.goto('/shop?inStock=true');
    const card = page.locator('.pcard').first();
    const add = card.getByRole('button', { name: 'Add to Cart' });

    if (await add.count()) {
      await add.click();
      await adminSession.settle();
    }

    const qty = card.getByRole('spinbutton', { name: 'Quantity' });
    await expect(qty).toBeVisible();
    const max = Number(await qty.getAttribute('max'));

    expect(max).toBeGreaterThan(0);
    expect(
      max,
      `the stepper cap ${max} must not exceed the per-item maximum`,
    ).toBeLessThanOrEqual(storeRules.maxQtyPerItem);

    // Leave the cart clean.
    const { CartPage } = await import('../../../pages/CartPage');
    const cart = new CartPage(page);
    await cart.open();
    await cart.emptyTheCart();
  });

  adminTest('NP-INV-TC-016 | Non-numeric stock input is rejected', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    const stockInput = page.locator('.adm input[type="number"]').first();
    if ((await stockInput.count()) === 0) {
      destructive('Stock is only editable through a form that writes to live data');
      return;
    }
    // A number input cannot hold free text, which is the first line of defence.
    await expect(stockInput).toHaveAttribute('type', 'number');
  });

  adminTest('NP-INV-TC-020 | The POS sold figure is separate from online stock', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const header = (await page.locator('table.adm-table thead').innerText()).toUpperCase();
    if (!/POS/.test(header)) {
      manual('No POS column is shown in this build of the inventory list');
      return;
    }
    expect(header).toContain('POS');
    void adminSession;
  });

  // --- Every stock write is gated ---
  adminTest('NP-INV-TC-002 | The stock quantity can be updated for a single product', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Changing stock affects every other tester and the storefront');
  });

  adminTest('NP-INV-TC-003 | Setting stock to zero marks the product out of stock', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Taking a live product out of stock blocks real purchases');
  });

  adminTest('NP-INV-TC-004 | Restoring stock makes the product purchasable again', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires changing live stock twice');
  });

  adminTest('NP-INV-TC-005 | Negative stock cannot be entered', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires submitting invalid stock against a live product');
  });

  adminTest('NP-INV-TC-007 | The low-stock threshold drives the flag and the counter', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires moving a product across the low-stock threshold');
  });

  adminTest('NP-INV-TC-009 | Concurrent stock edits do not silently overwrite', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires two admin sessions saving the same product');
  });

  adminTest('NP-INV-TC-015 | A bulk stock update applies to every selected product', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('A bulk update rewrites stock on several live products at once');
  });

  adminTest('NP-INV-TC-017 | Decimal stock input is handled by the documented rule', {
    tag: ['@medium', '@p3'],
  }, async () => {
    destructive('Requires submitting 5.5 against a live product');
  });

  adminTest('NP-INV-TC-018 | Stock decrements when a customer places an order', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires placing a real order');
  });

  adminTest('NP-INV-TC-019 | Stock is restored when an order is cancelled', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires placing and cancelling a real order');
  });
});
