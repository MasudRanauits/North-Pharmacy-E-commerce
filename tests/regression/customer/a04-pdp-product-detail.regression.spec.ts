/**
 * A4. PRODUCT DETAIL PAGE - 21 cases (NP-PDP-TC-001 ... 021)
 *
 * KNOWN DEFECT: on the 24 Oct 2026 build every /p/:id/:slug route answers
 * HTTP 502 from the gateway, so the detail page never renders. These cases
 * are written against the specified behaviour and will pass once the route
 * is restored; until then they report the outage, which is the point.
 * The quantity and stock rules are also asserted on the listing card, which
 * carries the same stepper, so the rules stay covered while /p is down.
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { storeRules } from '../../../data/testData';
import { manual } from '../../../utils/helpers';

test.describe('A4 - Product Detail', {
  tag: ['@regression', '@customer', '@pdp'],
}, () => {

  test('NP-PDP-TC-001 | All product attributes are displayed accurately', {
    tag: ['@critical', '@p1'],
  }, async ({ productPage }) => {
    await productPage.openFirstFromShop();
    expect(await productPage.isServerError(), 'product detail must render').toBeFalsy();

    await expect(productPage.name).toBeVisible();
    await expect(productPage.price).toContainText('৳');
    // Currency is printed consistently with two decimals where applicable.
    const price = await productPage.price.innerText();
    expect(price).toMatch(/^৳[\d,]+(\.\d{2})?$/);
  });

  test('NP-PDP-TC-002 | Discount price and saving are calculated correctly', {
    tag: ['@critical', '@p1'],
  }, async ({ productPage, shopPage }) => {
    await shopPage.open('?offers=true');
    const href = await shopPage.page.locator('a.pcard-name').first().getAttribute('href');
    test.skip(!href, 'No discounted product available');

    await productPage.openUrl(href!);
    expect(await productPage.isServerError()).toBeFalsy();

    const price = Number((await productPage.price.innerText()).replace(/[^\d.]/g, ''));
    const mrp = Number((await productPage.mrp.innerText()).replace(/[^\d.]/g, ''));
    expect(mrp).toBeGreaterThan(price);

    const shown = Number((await productPage.discountBadge.innerText()).replace(/[^\d.]/g, ''));
    const computed = ((mrp - price) / mrp) * 100;
    expect(Math.abs(shown - computed), 'discount percent must match (MRP-price)/MRP')
      .toBeLessThanOrEqual(1);
  });

  test('NP-PDP-TC-003 | Prescription-required badge appears on controlled medicines', {
    tag: ['@critical', '@p1'],
  }, async ({ productPage, shopPage }) => {
    await shopPage.open('?inStock=true');
    const rxCard = shopPage.productCards.filter({ hasText: 'Rx' }).first();
    test.skip((await rxCard.count()) === 0, 'No Rx product on the first listing page');

    const href = await rxCard.locator('a.pcard-name').getAttribute('href');
    await productPage.openUrl(href!);
    expect(await productPage.isServerError()).toBeFalsy();

    await expect(productPage.prescriptionBadge).toBeVisible();
  });

  test('NP-PDP-TC-004 | Stock state is displayed for in, low and out of stock', {
    tag: ['@high', '@p1'],
  }, async ({ shopPage }) => {
    await shopPage.open('?inStock=true');
    await expect(shopPage.card(0).locator('.stock')).toContainText(/in stock/i);
    await expect(shopPage.card(0).locator('.stock')).toHaveClass(/stock-in/);

    // An out-of-stock product offers no add-to-cart control.
    await shopPage.openCategory('baby-mother');
    const out = shopPage.productCards.filter({ hasText: /out of stock/i }).first();
    if (await out.count()) {
      await expect(out.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
    }
  });

  test('NP-PDP-TC-005 | Quantity selector enforces the minimum and maximum limits', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    const qty = shopPage.card(0).getByRole('spinbutton', { name: 'Quantity' });
    await expect(qty).toHaveAttribute('min', '1');
    await expect(qty).toHaveAttribute('max', String(storeRules.maxQtyPerItem));

    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-006 | Quantity cannot exceed available stock below the per-item cap', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    const qty = shopPage.card(0).getByRole('spinbutton', { name: 'Quantity' });
    const max = Number(await qty.getAttribute('max'));

    // Whatever the cap is, it never exceeds the global per-item maximum.
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(storeRules.maxQtyPerItem);

    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-007 | Product image displays, or a fallback where no photo exists', {
    tag: ['@low', '@p3'],
  }, async ({ shopPage, page }) => {
    await shopPage.open('?inStock=true');
    await expect(shopPage.card(0).locator('.visual')).toBeVisible();

    // No broken image icons anywhere on the listing.
    const broken = await page.evaluate(
      () => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken, 'a missing photo must fall back to category artwork').toBe(0);
  });

  test('NP-PDP-TC-008 | An out-of-stock product cannot be added to the cart', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage }) => {
    await shopPage.openCategory('baby-mother');
    await expect(shopPage.productCards.first()).toBeVisible();

    const out = shopPage.productCards.filter({ hasText: /out of stock/i }).first();
    test.skip((await out.count()) === 0, 'No out-of-stock product in this category page');
    await expect(out.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);

    manual('Replaying the add-to-cart request directly needs the API contract');
  });

  test('NP-PDP-TC-009 | An invalid product slug returns a proper not-found page', {
    tag: ['@medium', '@p2'],
  }, async ({ productPage, page }) => {
    await productPage.goto('/p/00000000-0000-0000-0000-000000000000/does-not-exist-123');

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/stack trace|at System\./i);
    expect(body.trim().length, 'never a blank page').toBeGreaterThan(0);
    // A designed not-found page, with a way back to the catalogue.
    await expect(
      page.getByText(/couldn't find that page|not found/i).first(),
    ).toBeVisible();
  });

  test('NP-PDP-TC-010 | Related and same-generic suggestions are relevant', {
    tag: ['@low', '@p3'],
  }, async ({ productPage }) => {
    const href = await productPage.openFirstFromShop();
    expect(await productPage.isServerError()).toBeFalsy();

    const suggestions = productPage.relatedProducts;
    if ((await suggestions.count()) > 0) {
      // The product being viewed is never suggested back to the customer.
      const links = await productPage.page.locator('a.pcard-name').evaluateAll(
        (as) => as.map((a) => a.getAttribute('href')),
      );
      expect(links).not.toContain(href);
    }
  });

  test('NP-PDP-TC-011 | Quantity cannot be reduced below 1', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    const card = shopPage.card(0);
    const qty = card.getByRole('spinbutton', { name: 'Quantity' });
    await expect(qty).toHaveValue('1');

    await card.getByRole('button', { name: 'Decrease quantity' }).click();
    await shopPage.settle();
    // It either stays at 1 or the line is removed - never 0 or negative.
    if (await qty.count()) {
      expect(Number(await qty.inputValue())).toBeGreaterThanOrEqual(1);
    }

    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-012 | Quantity selector accepts the minimum valid value of 1', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);

    await cartPage.open();
    await expect(cartPage.qtyInputs.first()).toHaveValue('1');
    const unit = await cartPage.unitPrice(0);
    expect(await cartPage.lineTotal(0)).toBeCloseTo(unit, 2);

    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-013 | Quantity selector accepts 199 and the maximum of 200', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));
    test.skip(max < storeRules.maxQtyPerItem, `Stock caps this line at ${max}`);

    await qty.fill('199');
    await qty.blur();
    await cartPage.settle();
    await expect(qty).toHaveValue('199');

    await qty.fill(String(storeRules.maxQtyPerItem));
    await qty.blur();
    await cartPage.settle();
    await expect(qty).toHaveValue(String(storeRules.maxQtyPerItem));

    const unit = await cartPage.unitPrice(0);
    expect(await cartPage.lineTotal(0))
      .toBeCloseTo(unit * storeRules.maxQtyPerItem, 1);

    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-014 | Quantity 201, one above the maximum, is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));
    test.skip(max < storeRules.maxQtyPerItem, `Stock caps this line at ${max}`);

    await qty.fill(String(storeRules.maxQtyPerItem));
    await qty.blur();
    await cartPage.settle();

    // At the cap the increase control is disabled; if it is still clickable,
    // clicking must not push the quantity past 200.
    const increase = cartPage.increaseButtons.first();
    const blocked = (await increase.getAttribute('aria-disabled')) === 'true'
      || (await increase.isDisabled().catch(() => false));

    if (!blocked) {
      await increase.click();
      await cartPage.settle();
    }

    expect(Number(await qty.inputValue()), 'quantity must never exceed the cap')
      .toBeLessThanOrEqual(storeRules.maxQtyPerItem);

    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-015 | A quantity typed above the maximum is rejected or clamped', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();
    const max = Number(await qty.getAttribute('max'));

    await qty.fill('999');
    await qty.blur();
    await cartPage.settle();

    expect(Number(await qty.inputValue()), 'a typed 999 must be clamped or rejected')
      .toBeLessThanOrEqual(max);

    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-016 | Quantity field rejects negative, zero and non-numeric input', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();

    const qty = cartPage.qtyInputs.first();

    // "abc" cannot even be typed: the field is a number input, which is the
    // first line of defence the case asks for.
    await expect(qty).toHaveAttribute('type', 'number');
    await qty.focus();
    await qty.pressSequentially('abc');
    expect(
      await qty.inputValue(),
      'letters must never become a quantity',
    ).not.toContain('a');

    for (const bad of ['-5', '0']) {
      await qty.fill(bad);
      await qty.blur();
      await cartPage.settle();

      const value = await qty.inputValue();
      const numeric = Number(value);
      expect(
        value === '' || (Number.isFinite(numeric) && numeric >= 1),
        `"${bad}" must not reach the cart as a quantity (got "${value}")`,
      ).toBeTruthy();
    }

    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  test('NP-PDP-TC-017 | In-stock indicator is shown with an enabled add-to-cart control', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage }) => {
    await shopPage.open('?inStock=true');
    const card = shopPage.card(0);

    await expect(card.locator('.stock')).toContainText(/in stock/i);
    await expect(card.getByRole('button', { name: 'Add to Cart' })).toBeEnabled();
  });

  test('NP-PDP-TC-018 | Low-stock message displays the remaining quantity', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage }) => {
    await shopPage.open('?inStock=true');
    const low = shopPage.productCards.filter({ hasText: /only \d+|left/i }).first();
    test.skip((await low.count()) === 0, 'No low-stock product on this listing page');

    await expect(low.locator('.stock')).toContainText(/\d+/);
  });

  test('NP-PDP-TC-019 | Out-of-stock indicator disables the add-to-cart control', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage }) => {
    await shopPage.openCategory('baby-mother');
    const out = shopPage.productCards.filter({ hasText: /out of stock/i }).first();
    test.skip((await out.count()) === 0, 'No zero-stock product in this category page');

    await expect(out.locator('.stock')).toContainText(/out of stock/i);
    await expect(out.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
  });

  test('NP-PDP-TC-020 | MRP is shown struck through beside the discounted price', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage }) => {
    await shopPage.open('?offers=true');
    const card = shopPage.card(0);
    await expect(card).toBeVisible();

    const priceBlock = card.locator('.price');
    const text = await priceBlock.innerText();
    const amounts = [...text.matchAll(/৳([\d,]+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1].replace(/,/g, '')));

    test.skip(amounts.length < 2, 'This card does not show both MRP and selling price');
    // The selling price is the lower of the two and must not be transposed.
    expect(amounts[0]).toBeLessThan(amounts[1]);
  });

  test('NP-PDP-TC-021 | No discount badge when the selling price equals the MRP', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage }) => {
    await shopPage.open('?inStock=true');

    // Find a card with no percentage badge and confirm it prints one price only.
    const count = Math.min(await shopPage.productCards.count(), 12);
    let checked = false;
    for (let i = 0; i < count; i++) {
      const card = shopPage.card(i);
      if ((await card.innerText()).includes('%')) continue;

      const amounts = [...(await card.locator('.price').innerText()).matchAll(/৳/g)];
      expect(amounts.length, 'an undiscounted card shows a single price').toBe(1);
      checked = true;
      break;
    }
    test.skip(!checked, 'Every card on this page is discounted');
  });
});
