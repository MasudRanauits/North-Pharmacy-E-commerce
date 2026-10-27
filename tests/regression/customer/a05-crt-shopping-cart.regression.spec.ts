/**
 * A5. SHOPPING CART - 14 cases (NP-CRT-TC-001 ... 014)
 *
 * The order summary lists Items at MRP and shows the saving on a separate
 * Discount row, so the payable subtotal is Items - Discount.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { storeRules, users } from '../../../data/testData';
import { manual, destructive, newGuestContext } from '../../../utils/helpers';

test.describe('A5 - Shopping Cart (guest)', {
  tag: ['@regression', '@customer', '@crt'],
}, () => {

  test.beforeEach(async ({ cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  test('NP-CRT-TC-001 | A product can be added to the cart from the listing', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    const name = await shopPage.productNames.first().innerText();
    const unit = Number(
      (await shopPage.productPrices.first().innerText()).replace(/[^\d.]/g, ''),
    );

    await shopPage.addCardToCart(0);
    await expect.poll(() => shopPage.cartCount()).toBe(1);

    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(1);
    await expect(cartPage.lineNames.first()).toContainText(name);
    expect(await cartPage.lineTotal(0)).toBeCloseTo(unit, 2);
  });

  test('NP-CRT-TC-002 | A product can be added directly from a listing card', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, page }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    // The customer stays on the listing.
    await expect(page).toHaveURL(/\/shop/);
    await expect.poll(() => shopPage.cartCount()).toBe(1);

    await cartPage.open();
    await expect(cartPage.qtyInputs.first()).toHaveValue('1');
  });

  test('NP-CRT-TC-003 | Adding the same product twice raises the quantity', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const unit = await cartPage.unitPrice(0);
    await cartPage.increaseButtons.first().click();
    await cartPage.settle();

    expect(await cartPage.itemCount(), 'no duplicate line is created').toBe(1);
    await expect(cartPage.qtyInputs.first()).toHaveValue('2');
    expect(await cartPage.lineTotal(0)).toBeCloseTo(unit * 2, 2);
  });

  test('NP-CRT-TC-004 | Quantity can be increased and decreased from the cart', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();
    const unit = await cartPage.unitPrice(0);

    await qty.fill('3');
    await qty.blur();
    await cartPage.settle();

    // 3 -> 4 -> 5 -> 4, recalculating after every change.
    for (const expected of [4, 5]) {
      await cartPage.increaseButtons.first().click();
      await expect(qty).toHaveValue(String(expected));
      // The line total is recalculated asynchronously; wait for it to settle.
      await expect
        .poll(() => cartPage.lineTotal(0), { timeout: 10_000 })
        .toBeCloseTo(unit * expected, 1);
    }

    await cartPage.decreaseButtons.first().click();
    await expect(qty).toHaveValue('4');
    await expect
      .poll(() => cartPage.lineTotal(0), { timeout: 10_000 })
      .toBeCloseTo(unit * 4, 1);
  });

  test('NP-CRT-TC-005 | A line can be removed from the cart', {
    tag: ['@high', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await shopPage.addCardToCart(1);
    await shopPage.addCardToCart(2);

    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(3);
    const names = await cartPage.lineNames.allInnerTexts();

    await cartPage.removeButtons.nth(1).click();
    await cartPage.settle();

    expect(await cartPage.itemCount()).toBe(2);
    const remaining = await cartPage.lineNames.allInnerTexts();
    expect(remaining).toEqual([names[0], names[2]]);

    // Subtotal equals the sum of the remaining line totals.
    const lineSum = (await cartPage.lineTotal(0)) + (await cartPage.lineTotal(1));
    const payable = (await cartPage.summaryAmount(/^Items \(\d+\)$/))
      - (await cartPage.discount());
    expect(payable).toBeCloseTo(lineSum, 2);
  });

  test('NP-CRT-TC-006 | The entire cart can be cleared', {
    tag: ['@medium', '@p2'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    for (const i of [0, 1, 2]) await shopPage.addCardToCart(i);

    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(3);

    await cartPage.emptyTheCart();
    await expect(cartPage.emptyState).toBeVisible();
    expect(await cartPage.cartCount()).toBe(0);
    await expect(cartPage.continueShoppingLink.or(
      cartPage.page.getByRole('link', { name: /Start shopping/i }),
    ).first()).toBeVisible();
  });

  test('NP-CRT-TC-007 | Cart subtotal equals the sum of all line totals', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    for (const i of [0, 1, 2]) await shopPage.addCardToCart(i);
    await cartPage.open();

    const lines = await cartPage.itemCount();
    let lineSum = 0;
    for (let i = 0; i < lines; i++) lineSum += await cartPage.lineTotal(i);

    const items = await cartPage.summaryAmount(/^Items \(\d+\)$/);
    const discount = await cartPage.discount();
    const delivery = await cartPage.summaryAmount(/^Delivery/);
    const total = await cartPage.summaryAmount(/^Total$/);

    expect(items - discount, 'payable subtotal = sum of line totals')
      .toBeCloseTo(lineSum, 2);
    expect(total, 'total = subtotal - discount + delivery')
      .toBeCloseTo(items - discount + delivery, 2);
  });

  test('NP-CRT-TC-008 | The per-item maximum of 200 units is enforced in the cart', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));
    expect(max).toBeLessThanOrEqual(storeRules.maxQtyPerItem);

    // 199 and 200 are accepted.
    for (const accepted of ['199', String(Math.min(200, max))]) {
      await qty.fill(accepted);
      await qty.blur();
      await expect(qty).toHaveValue(accepted);
    }

    // 201 and 250 are clamped or rejected — never stored.
    for (const attempt of ['201', '250']) {
      await qty.fill(attempt);
      await qty.blur();
      await expect
        .poll(() => qty.inputValue().then(Number), { timeout: 10_000 })
        .toBeLessThanOrEqual(max);
    }
  });

  test('NP-CRT-TC-009 | The guest cart persists across a page reload', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, page }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await shopPage.addCardToCart(1);

    await cartPage.open();
    const before = await cartPage.itemCount();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await cartPage.settle();

    expect(await cartPage.itemCount(), 'the cart survives a reload').toBe(before);

    manual(
      'Closing and reopening the browser is outside a Playwright context; '
        + 'verify the documented restore-or-clear rule by hand',
    );
  });

  test('NP-CRT-TC-011 | A price change in the admin is reflected in an existing cart', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Changing a live product price affects every other tester');
  });

  test('NP-CRT-TC-012 | A hidden or deleted product is handled gracefully in the cart', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Hiding a live product affects the shared catalogue');
  });

  test('NP-CRT-TC-013 | Delivery preview and free-delivery progress in the cart', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const payable = (await cartPage.summaryAmount(/^Items \(\d+\)$/))
      - (await cartPage.discount());
    const delivery = await cartPage.summaryAmount(/^Delivery/);

    if (payable < storeRules.freeDeliveryThreshold) {
      expect(delivery).toBe(storeRules.insideDistrict.charge);
      // The gap quoted must equal threshold - subtotal.
      const text = await cartPage.freeDeliveryProgress.first().innerText();
      const quoted = Number(text.replace(/[^\d.]/g, ''));
      expect(quoted).toBeCloseTo(storeRules.freeDeliveryThreshold - payable, 1);
    } else {
      expect(delivery).toBe(0);
    }
  });

  test('NP-CRT-TC-014 | The empty-cart state is displayed correctly', {
    tag: ['@low', '@p3'],
  }, async ({ cartPage }) => {
    await cartPage.open();

    await expect(cartPage.emptyState).toBeVisible();
    await expect(
      cartPage.page.getByRole('link', { name: /Start shopping|Continue shopping/i }).first(),
    ).toBeVisible();
    // No checkout control is offered on an empty cart.
    await expect(cartPage.checkoutButton).toHaveCount(0);
  });
});

customerTest.describe('A5 - Shopping Cart (signed in)', {
  tag: ['@regression', '@customer', '@crt'],
}, () => {

  customerTest('NP-CRT-TC-010 | The guest cart merges into the account cart on login', {
    tag: ['@critical', '@p1'],
  }, async ({ cartPage, browser }) => {
    // Start from a known-empty account cart.
    await cartPage.open();
    await cartPage.emptyTheCart();

    const guestContext = await newGuestContext(browser);
    const guestPage = await guestContext.newPage();
    try {
      const { ShopPage } = await import('../../../pages/ShopPage');
      const { LoginPage } = await import('../../../pages/LoginPage');
      const { CartPage } = await import('../../../pages/CartPage');

      const shop = new ShopPage(guestPage);
      await shop.open('?inStock=true');
      await shop.addCardToCart(0);
      await shop.addCardToCart(1);
      const guestLines = await shop.cartCount();

      const login = new LoginPage(guestPage);
      await login.open();
      await login.loginAndWait(users.customer.mobile, users.customer.password);

      const mergedCart = new CartPage(guestPage);
      await mergedCart.open();
      expect(
        await mergedCart.itemCount(),
        'no guest line may be lost on login',
      ).toBeGreaterThanOrEqual(guestLines);

      await mergedCart.emptyTheCart();
    } finally {
      await guestContext.close();
    }
  });
});
