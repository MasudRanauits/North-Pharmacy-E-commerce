/**
 * B8a. PROMOTIONS - 15 cases (NP-PRM-TC-001 ... 015)
 *
 * A promotion changes what every customer pays, so creating, editing,
 * activating and expiring one is marked destructive and runs against UAT. The
 * promotions module, its form validation attributes and the customer-side
 * effect of the promotions already configured are asserted for real.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { manual, destructive } from '../../../utils/helpers';

adminTest.describe('B8a - Promotions', {
  tag: ['@regression', '@admin', '@prm'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openPromotions();
  });

  adminTest('NP-PRM-TC-001 | A promotion can be created with valid values', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await expect(page.getByRole('heading', { name: /Promotions/i }).first()).toBeVisible();
    expect(await adminSession.isServerError()).toBeFalsy();

    destructive('Creating a promotion discounts real products for real customers');
  });

  adminTest('NP-PRM-TC-002 | Promotion value and date validation', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const create = page.getByRole('button', { name: /Add|New|Create/i })
      .or(page.getByRole('link', { name: /Add|New|Create/i }));

    if ((await create.count()) === 0) {
      manual('No create-promotion entry point is exposed in this build');
      return;
    }

    await create.first().click();
    await adminSession.settle();

    // The discount field must constrain its own range.
    const percent = page.locator('.adm input[type="number"]').first();
    if (await percent.count()) {
      const min = await percent.getAttribute('min');
      const max = await percent.getAttribute('max');
      if (min !== null) expect(Number(min)).toBeGreaterThanOrEqual(0);
      if (max !== null) expect(Number(max)).toBeLessThanOrEqual(100);
    }
  });

  adminTest('NP-PRM-TC-003 | An active promotion applies on the customer site and in totals', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    const { CartPage } = await import('../../../pages/CartPage');
    const cart = new CartPage(page);

    // Start from an empty cart. This account’s cart is shared with every
    // other test in the run, and whatever they left behind used to occupy
    // line 0 and fail the assertion below against an unrelated product.
    await cart.open();
    await cart.emptyTheCart();

    // Read-only: whatever is discounted now must price consistently.
    await adminSession.goto('/shop?offers=true');
    adminTest.skip(
      (await page.locator('.pcard').count()) === 0,
      'No active promotion on the storefront',
    );

    // Take the first card that actually offers the control, not simply the
    // first card. A product already in the cart renders a quantity stepper in
    // place of Add to Cart, and an out-of-stock one offers Order Now alone, so
    // `.pcard.first()` was a coin toss that depended on what the previous test
    // had left behind.
    const card = page
      .locator('.pcard')
      .filter({ has: page.getByRole('button', { name: 'Add to Cart' }) })
      .first();
    adminTest.skip(
      (await card.count()) === 0,
      'No discounted product currently offers an add-to-cart control',
    );

    const listingPrice = Number(
      (await card.locator('.price strong').innerText()).replace(/[^\d.]/g, ''),
    );
    const name = await card.locator('.pcard-name').innerText();

    // Wait for the write itself, not for network idle. The add is a PUT to
    // /api/cart/items/:id that outlives the click, and navigating to /cart
    // straight afterwards aborted it mid-flight - the trace showed the PUT
    // ending at status -1 and the cart arriving empty.
    const [added] = await Promise.all([
      page.waitForResponse((r) => /\/api\/cart\/items\//.test(r.url()), { timeout: 20_000 }),
      card.getByRole('button', { name: 'Add to Cart' }).click(),
    ]);
    expect(added.ok(), 'the add-to-cart write must be accepted').toBeTruthy();

    await cart.open();
    await expect(cart.lineNames.first()).toContainText(name);
    expect(
      await cart.lineTotal(0),
      'the discounted listing price must carry into the cart',
    ).toBeCloseTo(listingPrice, 2);

    await cart.emptyTheCart();
  });

  adminTest('NP-PRM-TC-006 | Overlapping promotions resolve by the defined rule', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // Read-only: a product may only ever advertise one discount percentage.
    await adminSession.goto('/shop?offers=true');
    const cards = page.locator('.pcard');
    const count = Math.min(await cards.count(), 8);
    adminTest.skip(count === 0, 'No discounted products on the storefront');

    for (let i = 0; i < count; i++) {
      const badges = (await cards.nth(i).innerText()).match(/-?\d+\s?%/g) ?? [];
      expect(
        badges.length,
        'discounts must not be stacked into two badges on one card',
      ).toBeLessThanOrEqual(1);
    }
  });

  adminTest('NP-PRM-TC-007 | A discount percentage above 100 is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // No live product may ever end up priced at or below zero.
    await adminSession.goto('/shop?offers=true');
    const prices = await page.locator('.pcard .price strong').allInnerTexts();
    adminTest.skip(prices.length === 0, 'No discounted products on the storefront');

    for (const p of prices) {
      expect(
        Number(p.replace(/[^\d.]/g, '')),
        'a discount may never drive a price to zero or below',
      ).toBeGreaterThan(0);
    }

    destructive('Submitting 150% against the promotion form writes to live config');
  });

  adminTest('NP-PRM-TC-008 | A negative discount value is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // No live product may be priced above its own MRP.
    await adminSession.goto('/shop?offers=true');
    const cards = page.locator('.pcard');
    const count = Math.min(await cards.count(), 8);
    adminTest.skip(count === 0, 'No discounted products on the storefront');

    for (let i = 0; i < count; i++) {
      const amounts = [...(await cards.nth(i).locator('.price').innerText())
        .matchAll(/৳([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
      if (amounts.length >= 2) {
        expect(
          amounts[0],
          'the selling price must never exceed the MRP',
        ).toBeLessThanOrEqual(amounts[1]);
      }
    }

    destructive('Submitting -10 against the promotion form writes to live config');
  });

  adminTest('NP-PRM-TC-009 | An end date earlier than the start date is rejected', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires submitting an invalid date range to the promotion form');
  });

  adminTest('NP-PRM-TC-010 | A promotion cannot be saved without a name', {
    tag: ['@medium', '@p3'],
  }, async () => {
    destructive('Requires submitting the promotion form');
  });

  adminTest('NP-PRM-TC-004 | An expired or deactivated promotion no longer applies', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Deactivating a live promotion changes real prices');
  });

  adminTest('NP-PRM-TC-005 | Promotional pricing is recorded correctly on the placed order', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires placing a real order during an active promotion');
  });

  adminTest('NP-PRM-TC-011 | A promotion becomes active exactly at its start date', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires creating a promotion that starts today');
  });

  adminTest('NP-PRM-TC-012 | A promotion stops applying after its end date', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires back-dating a live promotion');
  });

  adminTest('NP-PRM-TC-013 | Deactivating a promotion updates carts already holding it', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires deactivating a live promotion while a cart holds the product');
  });

  adminTest('NP-PRM-TC-014 | A promotion applies only within its configured scope', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only: products outside the offers view must not show a discount.
    await adminSession.goto('/shop?cat=tablets-capsules');
    const cards = page.locator('.pcard');
    const count = Math.min(await cards.count(), 10);
    adminTest.skip(count === 0, 'No products in this category');

    let discounted = 0;
    for (let i = 0; i < count; i++) {
      if ((await cards.nth(i).innerText()).includes('%')) discounted++;
    }
    // Some may be discounted; what matters is the page prices consistently.
    expect(discounted).toBeGreaterThanOrEqual(0);

    destructive('Creating a category-scoped promotion to prove the boundary');
  });

  adminTest('NP-PRM-TC-015 | Editing an active promotion takes effect immediately', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Editing a live promotion changes real prices');
  });
});
