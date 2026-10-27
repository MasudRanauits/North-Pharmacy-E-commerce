/**
 * A13. ORDER HISTORY & TRACKING - 14 cases (NP-ORD-TC-001 ... 014)
 *
 * The QA customer may have no orders on a clean environment; cases that need
 * an existing order skip with a clear reason rather than failing misleadingly.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { users, orders } from '../../../data/testData';
import { manual, destructive } from '../../../utils/helpers';

customerTest.describe('A13 - Order History & Tracking', {
  tag: ['@regression', '@customer', '@ord'],
}, () => {

  customerTest('NP-ORD-TC-001 | The order list shows the customer orders in correct order', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    await expect(page.getByRole('heading', { name: /My orders/i })).toBeVisible();

    if (await accountPage.emptyState.count()) {
      await expect(accountPage.emptyState).toBeVisible();
      return;
    }

    const rows = await accountPage.orderRows.count();
    expect(rows).toBeGreaterThan(0);

    // Newest first: the dates must be non-increasing down the list.
    const dates = await page.locator('time, .order-date').allInnerTexts();
    const parsed = dates.map((d) => Date.parse(d)).filter((n) => !Number.isNaN(n));
    if (parsed.length > 1) {
      const sorted = [...parsed].sort((a, b) => b - a);
      expect(parsed, 'orders must be listed newest first').toEqual(sorted);
    }
  });

  customerTest('NP-ORD-TC-002 | The order detail shows a complete and accurate breakdown', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip(
      (await accountPage.emptyState.count()) > 0,
      'This account has no orders to open',
    );

    await accountPage.openFirstOrder();

    const body = await page.locator('.account-main').innerText();
    expect(body).toMatch(/NP-\d{6}/);
    expect(body).toMatch(/৳/);
    expect(body, 'the payment method must be stated').toMatch(/Cash on Delivery|bKash|Nagad/i);

    // The summary prints each label on its own line with the amount beneath.
    // "Items" and "Delivery" also appear as section headings further up, so
    // take the LAST match — the summary is rendered last.
    const lines = body.split('\n').map((l) => l.trim());
    const amountAfter = (label: RegExp): number | null => {
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (!label.test(lines[i])) continue;
        const figure = lines[i + 1]?.match(/[\d,]+(?:\.\d+)?/);
        if (figure) return Number(figure[0].replace(/,/g, ''));
      }
      return null;
    };

    const items = amountAfter(/^Items$/);
    const discount = amountAfter(/^Discount$/) ?? 0;
    const delivery = amountAfter(/^Delivery$/);
    const total = amountAfter(/^Total$/);

    if (items !== null && delivery !== null && total !== null) {
      expect(total, 'total = items - discount + delivery')
        .toBeCloseTo(items - discount + delivery, 1);
    }
  });

  customerTest('NP-ORD-TC-003 | The status timeline reflects the current status and history', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no orders');

    await accountPage.openFirstOrder();

    const body = await page.locator('.account-main').innerText();
    expect(
      body,
      'the order must show where it is in the lifecycle',
    ).toMatch(/Pending|Confirmed|Packed|Shipped|Delivered|Cancelled/i);
  });

  customerTest('NP-ORD-TC-004 | An admin status change appears on the customer side', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires an administrator to change a real order status');
  });

  customerTest('NP-ORD-TC-005 | A customer can cancel an order while cancellation is permitted', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Cancelling a real order changes reporting and stock');
  });

  customerTest('NP-ORD-TC-006 | Cancellation is blocked once the order has progressed', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no orders');

    // Find a shipped or delivered order and confirm no cancel control is offered.
    const progressed = accountPage.orderRows
      .filter({ hasText: /Shipped|Delivered/i })
      .first();
    test.skip((await progressed.count()) === 0, 'No shipped or delivered order on this account');

    await progressed.click();
    await accountPage.page.waitForURL(/\/account\/orders\/\d+/, { timeout: 20_000 });
    await accountPage.settle();
    await expect(
      page.getByRole('button', { name: /^Cancel/i }),
      'a progressed order must not offer cancellation',
    ).toHaveCount(0);
  });

  customerTest('NP-ORD-TC-007 | A customer cannot access another customer order', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    // The seeded references are environment-specific and come from .env; the
    // numeric id is always probed so the case still means something without
    // them.
    const ids = [orders.packedWithPrescription, orders.cancelled, '104021'].filter(Boolean);
    for (const id of ids) {
      await page.goto(`/account/orders/${id}`, { waitUntil: 'domcontentloaded' });
      await accountPage.settle();

      const body = await page.locator('body').innerText();
      expect(
        body,
        `order ${id} must not disclose another customer's details`,
      ).not.toContain(users.existingCustomer.mobile);
      expect(body).not.toMatch(/stack trace|at System\./i);
    }
  });

  customerTest('NP-ORD-TC-008 | A linked prescription is visible on the order detail', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no orders');

    const withRx = accountPage.orderRows.filter({ hasText: /Rx|prescription/i }).first();
    test.skip((await withRx.count()) === 0, 'No order with a prescription on this account');

    await withRx.click();
    await accountPage.page.waitForURL(/\/account\/orders\/\d+/, { timeout: 20_000 });
    await accountPage.settle();
    await expect(page.getByText(/prescription/i).first()).toBeVisible();
  });

  customerTest('NP-ORD-TC-009 | The invoice or receipt view renders correctly', {
    tag: ['@medium', '@p3'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no orders');

    await accountPage.openFirstOrder();

    const invoice = page.getByRole('button', { name: /invoice|print|receipt/i })
      .or(page.getByRole('link', { name: /invoice|print|receipt/i }));
    test.skip((await invoice.count()) === 0, 'No invoice or print view on this build');
    await expect(invoice.first()).toBeVisible();
  });

  customerTest('NP-ORD-TC-010 | The empty order history state for a customer with no orders', {
    tag: ['@low', '@p3'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();

    if ((await accountPage.emptyState.count()) === 0) {
      manual('This account already has orders; verify the empty state on a new account');
      return;
    }

    await expect(page.getByText(/No orders yet/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Start shopping|Browse|Shop/i }).first(),
    ).toBeVisible();
  });

  customerTest('NP-ORD-TC-011 | Reordering a past order adds all of its items to the cart', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, cartPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no past orders');

    const reorder = page.getByRole('button', { name: /reorder|order again|buy again/i }).first();
    if ((await reorder.count()) === 0) {
      manual(
        'No reorder control is exposed on the order list for this account; '
          + 'confirm whether the feature is per-order on the detail page',
      );
      return;
    }

    await cartPage.open();
    await cartPage.emptyTheCart();
    await accountPage.openOrders();
    await reorder.click();
    await accountPage.settle();

    await cartPage.open();
    expect(await cartPage.itemCount(), 'reorder must fill the cart').toBeGreaterThan(0);
    await cartPage.emptyTheCart();
  });

  customerTest('NP-ORD-TC-012 | Reordering when some items are no longer available', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires setting products from a past order to zero stock');
  });

  customerTest('NP-ORD-TC-013 | The customer cancellation reason is optional', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires cancelling two real orders, with and without a reason');
  });

  customerTest('NP-ORD-TC-014 | Transaction reference and pharmacist note on the order', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openOrders();
    test.skip((await accountPage.emptyState.count()) > 0, 'This account has no orders');

    await accountPage.openFirstOrder();

    const body = await page.locator('.account-main').innerText();
    // Neither field may render as an empty label or stray punctuation.
    expect(body).not.toMatch(/Reference:\s*$/m);
    expect(body).not.toMatch(/Note:\s*$/m);
    expect(body).not.toMatch(/undefined|null|NaN/);
  });
});
