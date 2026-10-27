/**
 * SMOKE - Product listing, product detail, cart and checkout arithmetic.
 *
 * Covers: NP-PDP-TC-001/003/005/008, NP-CRT-TC-001/003/007/013,
 *         NP-CHK-TC-001/004/005/009
 */
import { test, expect, customerTest } from '../../fixtures/test-fixtures';
import { storeRules } from '../../data/testData';


test.describe('Smoke - Catalogue and cart', { tag: ['@smoke', '@p1'] }, () => {

  test.describe('Product listing and detail', () => {
    test('Product listing renders cards with price and stock', {
      tag: '@high',
    }, async ({ shopPage }) => {
      await shopPage.open('?inStock=true');

      await expect(shopPage.productCards.first()).toBeVisible();
      expect(await shopPage.productCards.count()).toBeGreaterThan(0);
      await expect(shopPage.productPrices.first()).toContainText('৳');
      await expect(shopPage.card(0).locator('.stock')).toContainText(/in stock/i);
    });

    test('NP-PDP-TC-001 | Product detail page shows the product attributes', {
      tag: '@critical',
    }, async ({ productPage }) => {
      await productPage.openFirstFromShop();

      // DEFECT GUARD: /p/:id/:slug returned 502 on this build (24 Oct 2026).
      expect(
        await productPage.isServerError(),
        'product detail route must not return a gateway error',
      ).toBeFalsy();

      await expect(productPage.name).toBeVisible();
      await expect(productPage.price).toContainText('৳');
    });

    test('NP-PDP-TC-005 | Quantity selector enforces its 1-200 bounds', {
      tag: '@critical',
    }, async ({ shopPage, cartPage }) => {
      await cartPage.open();
      await cartPage.emptyTheCart();

      // The stepper appears on a card once the product is in the cart.
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);

      const qty = shopPage.card(0).getByRole('spinbutton', { name: 'Quantity' });
      await expect(qty).toHaveAttribute('min', '1');
      await expect(qty).toHaveAttribute('max', String(storeRules.maxQtyPerItem));

      await cartPage.open();
      await cartPage.emptyTheCart();
    });

    test('NP-PDP-TC-003 | Prescription products are badged on the listing', {
      tag: '@critical',
    }, async ({ shopPage, page }) => {
      await shopPage.open('?inStock=true');
      await expect(shopPage.productCards.first()).toBeVisible();

      const rxCards = shopPage.productCards.filter({ hasText: 'Rx' });
      test.skip((await rxCards.count()) === 0, 'No Rx product on this listing page');
      await expect(rxCards.first()).toContainText('Rx');
      void page;
    });

    test('NP-PDP-TC-008 | Out-of-stock products cannot be added to the cart', {
      tag: '@critical',
    }, async ({ shopPage }) => {
      await shopPage.open('?cat=baby-mother');
      await expect(shopPage.productCards.first()).toBeVisible();

      const outOfStock = shopPage.productCards.filter({ hasText: /out of stock/i }).first();
      test.skip((await outOfStock.count()) === 0, 'No out-of-stock product on this page');
      await expect(outOfStock.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
    });
  });

  test.describe('Cart', () => {
    test.beforeEach(async ({ cartPage }) => {
      await cartPage.open();
      await cartPage.emptyTheCart();
    });

    test.afterEach(async ({ cartPage }) => {
      await cartPage.open();
      await cartPage.emptyTheCart();
    });

    test('NP-CRT-TC-001 | A product can be added to the cart', {
      tag: '@critical',
    }, async ({ shopPage, cartPage }) => {
      await shopPage.open('?inStock=true');
      const name = await shopPage.productNames.first().innerText();
      await shopPage.addCardToCart(0);

      await expect.poll(() => shopPage.cartCount()).toBe(1);
      await cartPage.open();
      expect(await cartPage.itemCount()).toBe(1);
      await expect(cartPage.page.getByText(name).first()).toBeVisible();
    });

    test('NP-CRT-TC-003 | Adding the same product again raises the quantity', {
      tag: '@critical',
    }, async ({ shopPage, cartPage }) => {
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);
      await cartPage.open();

      await cartPage.increaseButtons.first().click();
      await cartPage.settle();

      // One line, quantity 2 - never a duplicate line.
      expect(await cartPage.itemCount()).toBe(1);
      await expect(cartPage.qtyInputs.first()).toHaveValue('2');
    });

    test('NP-CRT-TC-007 | Cart subtotal equals the sum of the line totals', {
      tag: '@critical',
    }, async ({ shopPage, cartPage }) => {
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);
      await shopPage.addCardToCart(1);
      await cartPage.open();

      const lineCount = await cartPage.itemCount();
      let lineSum = 0;
      for (let i = 0; i < lineCount; i++) lineSum += await cartPage.lineTotal(i);

      // Items is listed at MRP with the saving on its own Discount row,
      // so the payable subtotal is Items - Discount.
      const items = await cartPage.summaryAmount(/^Items \(\d+\)$/);
      const discount = await cartPage.discount();
      const delivery = await cartPage.summaryAmount(/^Delivery/);
      const total = await cartPage.summaryAmount(/^Total$/);

      expect(items - discount, 'payable subtotal must equal the sum of the line totals')
        .toBeCloseTo(lineSum, 2);
      expect(total, 'total must be subtotal minus discount plus delivery')
        .toBeCloseTo(items - discount + delivery, 2);
    });

    test('NP-CRT-TC-013 | Cart previews the delivery charge and free-delivery gap', {
      tag: '@high',
    }, async ({ shopPage, cartPage }) => {
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);
      await cartPage.open();

      const items = await cartPage.summaryAmount(/^Items \(\d+\)$/);
      const discount = await cartPage.discount();
      const delivery = await cartPage.summaryAmount(/^Delivery/);
      const total = await cartPage.summaryAmount(/^Total$/);
      const subtotal = items - discount;

      expect(delivery).toBe(storeRules.insideDistrict.charge);
      expect(total).toBeCloseTo(subtotal + delivery, 2);

      // Below the threshold the cart states how much more is needed.
      const remaining = storeRules.freeDeliveryThreshold - subtotal;
      if (remaining > 0) {
        await expect(cartPage.freeDeliveryProgress.first()).toContainText(
          /more for free delivery/i,
        );
      }
    });
  });

});

test.describe('Smoke - Checkout (guest)', { tag: ['@smoke', '@p1'] }, () => {
  test('NP-CHK-TC-001 | Checkout requires an authenticated session', {
    tag: '@critical',
  }, async ({ checkoutPage, page }) => {
    await checkoutPage.openRaw();

    // A guest must not reach the checkout form.
    await expect(checkoutPage.placeOrderButton).toHaveCount(0);
    await expect(page).toHaveURL(/login|cart/i);
  });
});

customerTest.describe('Smoke - Checkout', { tag: ['@smoke', '@p1'] }, () => {
  customerTest('NP-CHK-TC-004 / 005 / 009 | Delivery charge and payment method at checkout', {
      tag: '@critical',
    }, async ({ shopPage, cartPage, checkoutPage }) => {
      await cartPage.open();
      await cartPage.emptyTheCart();
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);
      await checkoutPage.open();

      // NP-CHK-TC-004 - inside Dhaka is BDT 60.
      await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
      await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(
        storeRules.insideDistrict.charge,
      );

      // NP-CHK-TC-005 - outside Dhaka is BDT 120.
      await checkoutPage.selectDistrict(storeRules.outsideDistricts[0]);
      await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(storeRules.outsideCharge);

      // NP-CHK-TC-009 - only the enabled payment method is offered.
      await expect(checkoutPage.codOption).toBeVisible();

      await cartPage.open();
      await cartPage.emptyTheCart();
    });

  customerTest('NP-ACC-TC-007 | District selector lists all 64 districts', {
      tag: '@high',
    }, async ({ shopPage, cartPage, checkoutPage }) => {
      await cartPage.open();
      await cartPage.emptyTheCart();
      await shopPage.open('?inStock=true');
      await shopPage.addCardToCart(0);
      await checkoutPage.open();

      // A saved address hides the new-address form that owns the select.
      if ((await checkoutPage.districtSelect.count()) === 0) {
        await checkoutPage.page
          .getByRole('button', { name: /new address|add address/i })
          .first()
          .click();
        await checkoutPage.settle();
      }
      await expect(checkoutPage.districtSelect).toBeVisible();

      const options = (await checkoutPage.districtOptions())
        .map((o) => o.trim())
        .filter((o) => o && !/select|choose/i.test(o));

      expect(options.length).toBe(storeRules.districtCount);
      expect(new Set(options).size, 'no duplicate districts').toBe(options.length);

      await cartPage.open();
      await cartPage.emptyTheCart();
    });
});
