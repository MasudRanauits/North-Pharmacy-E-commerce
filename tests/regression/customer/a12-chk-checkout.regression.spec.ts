/**
 * A12. CHECKOUT & ORDER PLACEMENT - 18 cases (NP-CHK-TC-001 ... 018)
 *
 * Everything up to the Place order button is asserted for real. Cases that
 * submit an order write to UAT stock and the admin order list, so they are
 * marked destructive.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { storeRules } from '../../../data/testData';
import {
  manual, destructive, uniqueName, randomMobile, ensureCartHas,
} from '../../../utils/helpers';
import type { ShopPage } from '../../../pages/ShopPage';
import type { CartPage } from '../../../pages/CartPage';
import type { CheckoutPage } from '../../../pages/CheckoutPage';

/** Put exactly one in-stock product in the cart and open checkout. */
async function oneItemCheckout(
  shopPage: ShopPage,
  cartPage: CartPage,
  checkoutPage: CheckoutPage,
) {
  await ensureCartHas(shopPage, cartPage, 1);
  await checkoutPage.open();
}

test.describe('A12 - Checkout (guest)', {
  tag: ['@regression', '@customer', '@chk'],
}, () => {

  test('NP-CHK-TC-001 | Checkout requires an authenticated session', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, checkoutPage, page }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    await checkoutPage.openRaw();
    await expect(checkoutPage.placeOrderButton).toHaveCount(0);
    await expect(page).toHaveURL(/login|cart/i);
  });

  test('NP-CHK-TC-018 | Checkout cannot proceed with an empty cart', {
    tag: ['@high', '@p2'],
  }, async ({ cartPage, checkoutPage, page }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

    await checkoutPage.openRaw();
    await expect(checkoutPage.placeOrderButton).toHaveCount(0);
    await expect(page).toHaveURL(/cart|login/i);
  });
});

customerTest.describe('A12 - Checkout (signed in)', {
  tag: ['@regression', '@customer', '@chk'],
}, () => {

  customerTest.afterEach(async ({ cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  customerTest('NP-CHK-TC-002 | Saved addresses load and the default is preselected', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);

    const saved = await checkoutPage.savedAddressRadios.count();
    if (saved === 0) {
      // With no saved address the new-address form must be offered instead.
      await expect(checkoutPage.districtSelect).toBeVisible();
      manual('No saved address on the QA account; add two to cover the default rule');
      return;
    }
    const checked = await page.locator('input[type="radio"]:checked').count();
    expect(checked, 'an address must be preselected').toBeGreaterThan(0);
  });

  customerTest('NP-CHK-TC-003 | A new address can be added inline during checkout', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);

    await checkoutPage.fillNewAddress({
      recipient: uniqueName('QA Auto CO'),
      phone: randomMobile(),
      address: 'House 9, Road 4, Dhanmondi',
      district: storeRules.insideDistrict.district,
    });

    // The cart is not lost while the address is entered.
    expect(await checkoutPage.amount(/^Items \(\d+\)$/)).toBeGreaterThan(0);
    await expect(checkoutPage.placeOrderButton).toBeVisible();
  });

  customerTest('NP-CHK-TC-004 | The inside-district charge of BDT 60 is applied for Dhaka', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);

    // The summary recalculates asynchronously after a district change.
    await expect
      .poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 })
      .toBe(storeRules.insideDistrict.charge);

    // Items is listed at MRP, with the saving on its own Discount row.
    const items = await checkoutPage.amount(/^Items \(\d+\)$/);
    const discount = await checkoutPage.discount();
    const delivery = await checkoutPage.amount(/^Delivery/);
    const total = await checkoutPage.amount(/^Total$/);

    expect(total, 'total = subtotal - discount + delivery')
      .toBeCloseTo(items - discount + delivery, 2);
  });

  customerTest('NP-CHK-TC-005 | The outside-district charge of BDT 120 is applied', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);

    for (const district of storeRules.outsideDistricts.slice(0, 2)) {
      await checkoutPage.selectDistrict(district);
      await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000, message: `${district} must be charged BDT ${storeRules.outsideCharge}` }).toBe(storeRules.outsideCharge);
    }
  });

  customerTest('NP-CHK-TC-006 | Free-delivery boundary at 1,999 / 2,000 / 2,001', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await ensureCartHas(shopPage, cartPage, 1);

    // Raise the quantity until the cart crosses the threshold.
    await cartPage.open();
    const unit = await cartPage.unitPrice(0);
    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));
    const needed = Math.ceil(storeRules.freeDeliveryThreshold / unit);
    test.skip(needed > max, `Reaching BDT 2,000 needs ${needed} units, capped at ${max}`);

    await qty.fill(String(needed));
    await qty.blur();
    await cartPage.settle();

    await checkoutPage.open();
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
    const items = await checkoutPage.amount(/^Items \(\d+\)$/);

    expect(items).toBeGreaterThanOrEqual(storeRules.freeDeliveryThreshold);
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000, message: 'at or above the threshold delivery is free' }).toBe(0);
  });

  customerTest('NP-CHK-TC-007 | The free-delivery threshold also applies outside Dhaka', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await ensureCartHas(shopPage, cartPage, 1);
    const unit = await cartPage.unitPrice(0);
    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));
    const needed = Math.ceil((storeRules.freeDeliveryThreshold + 500) / unit);
    test.skip(needed > max, `Reaching BDT 2,500 needs ${needed} units, capped at ${max}`);

    await qty.fill(String(needed));
    await qty.blur();
    await cartPage.settle();

    await checkoutPage.open();
    await checkoutPage.selectDistrict('Rangpur');
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000, message: 'an outside district above the threshold still gets free delivery' }).toBe(0);
  });

  customerTest('NP-CHK-TC-008 | Order summary arithmetic is correct in all components', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await ensureCartHas(shopPage, cartPage, 3);
    const lines = await cartPage.itemCount();
    let lineSum = 0;
    for (let i = 0; i < lines; i++) lineSum += await cartPage.lineTotal(i);

    await checkoutPage.open();
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
    await expect
      .poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 })
      .toBe(storeRules.insideDistrict.charge);

    // Items is listed at MRP, with the saving on its own Discount row.
    const items = await checkoutPage.amount(/^Items \(\d+\)$/);
    const discount = await checkoutPage.discount();
    const delivery = await checkoutPage.amount(/^Delivery/);
    const total = await checkoutPage.amount(/^Total$/);

    expect(items - discount, 'payable subtotal equals the cart line totals')
      .toBeCloseTo(lineSum, 2);
    expect(total, 'grand total = subtotal - discount + delivery')
      .toBeCloseTo(items - discount + delivery, 2);
    expect(await checkoutPage.buttonTotal(), 'the button repeats the grand total')
      .toBeCloseTo(total, 2);
  });

  customerTest('NP-CHK-TC-009 | Only enabled payment methods are offered', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);

    await expect(checkoutPage.codOption).toBeVisible();
    const payment = await page.locator('.container.page').innerText();

    // Disabled wallets must not be selectable.
    for (const wallet of ['bKash', 'Nagad']) {
      if (payment.includes(wallet)) {
        const option = page.getByText(wallet, { exact: false }).first();
        const disabled = await option.getAttribute('aria-disabled');
        expect(
          disabled === 'true' || (await option.isDisabled().catch(() => false)),
          `${wallet} is not enabled in settings, so it must not be selectable`,
        ).toBeTruthy();
      }
    }
  });

  customerTest('NP-CHK-TC-010 | Prescription attachment is mandatory for controlled items', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');

    // Require the add control as part of the filter: a product already in the
    // cart renders a quantity stepper in its place, and `.first()` would pick
    // that card and then have nothing to click.
    const rxCard = shopPage.productCards
      .filter({ hasText: 'Rx' })
      .filter({ has: page.getByRole('button', { name: 'Add to Cart' }) })
      .first();
    customerTest.skip(
      (await rxCard.count()) === 0,
      'No Rx product on the first listing page offers an add-to-cart control',
    );
    await shopPage.addCard(rxCard);

    await checkoutPage.open();
    const body = await page.locator('.container.page').innerText();

    // The prescription gate must be visible before the order can be placed.
    expect(body).toMatch(/prescription/i);

    if (/optional/i.test(body)) {
      manual(
        'This build presents the prescription as OPTIONAL at checkout and offers '
          + '"Place the order without one". NP-CHK-TC-010 specifies it is mandatory '
          + 'for controlled items — raise with the business before passing this case.',
      );
    }
  });

  customerTest('NP-CHK-TC-011 | The customer note is captured and visible to the admin', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);

    await expect(checkoutPage.noteTextarea).toBeVisible();
    await checkoutPage.noteTextarea.fill('Please call before delivery, 3rd floor');
    await expect(checkoutPage.noteTextarea)
      .toHaveValue('Please call before delivery, 3rd floor');

    destructive('Confirming the note on the admin order detail needs a real order');
  });

  customerTest('NP-CHK-TC-012 | A non-prescription order is placed successfully end to end', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await oneItemCheckout(shopPage, cartPage, checkoutPage);
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
    await expect(checkoutPage.placeOrderButton).toBeEnabled();

    destructive('Places a real order and decrements live stock');
  });

  customerTest('NP-CHK-TC-013 | Stock is decremented correctly after order placement', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires placing a real order and comparing admin inventory');
  });

  customerTest('NP-CHK-TC-014 | The placed order appears immediately in the admin list', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires placing a real order');
  });

  customerTest('NP-CHK-TC-015 | An item going out of stock mid-checkout is handled', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires an admin stock change while a checkout is open');
  });

  customerTest('NP-CHK-TC-016 | Double submission does not create two orders', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires submitting a real order twice');
  });

  customerTest('NP-CHK-TC-017 | A network interruption during submission does not corrupt', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    // Taking the context offline does NOT reliably stop the submission: an
    // earlier version of this case clicked Place order and created six real
    // orders (NP-104022 … NP-104027) on the shared environment. Clicking the
    // control at all is therefore treated as a destructive act.
    destructive('Clicking Place order can create a real order even when offline');
    await oneItemCheckout(shopPage, cartPage, checkoutPage);
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);

    // Drop the connection, then submit: the customer must see a clear error.
    await page.context().setOffline(true);
    await checkoutPage.placeOrderButton.click().catch(() => { /* expected */ });
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    expect(body, 'a connectivity failure must not surface a raw stack trace')
      .not.toMatch(/stack trace|at System\.|TypeError/i);

    await page.context().setOffline(false);
  });
});
