/**
 * D1. BROWSER & DEVICE COMPATIBILITY - 20 cases (NP-CMP-TC-001 ... 020)
 *
 * These cases are written once and executed per browser project. Run them on
 * every platform in the matrix:
 *
 *   npx playwright test tests/regression/cross-cutting/d01-cmp --project=chromium
 *   npx playwright test tests/regression/cross-cutting/d01-cmp --project=firefox
 *   npx playwright test tests/regression/cross-cutting/d01-cmp --project=mobile-chrome
 *   npx playwright test tests/regression/cross-cutting/d01-cmp --project=mobile-safari
 *
 * Chromium stands in for Chrome and Edge (same engine); a real Edge and a
 * physical iPhone still need a pass by hand, which the annotated cases say.
 */
import { test, expect, customerTest, adminTest } from '../../../fixtures/test-fixtures';
import { storeRules, searchTerms, routes } from '../../../data/testData';
import { manual, collectConsoleErrors , ensureCartHas } from '../../../utils/helpers';
import { AdminPage } from '../../../pages/AdminPage';

test.describe('D1 - Browser & Device Compatibility', {
  tag: ['@regression', '@crosscutting', '@cmp'],
}, () => {

  test('NP-CMP-TC-001 | The full customer journey completes on this browser', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, shopPage, cartPage, page }, testInfo) => {
    await homePage.open();
    await expect(homePage.header).toBeVisible();

    // Browse -> search -> listing -> cart, on whichever engine is running.
    await homePage.search(searchTerms.brand);
    await expect(shopPage.productCards.first()).toBeVisible();

    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(1);
    await cartPage.emptyTheCart();

    expect(testInfo.project.name, 'recorded for the compatibility matrix').toBeTruthy();
    void page;
  });

  test('NP-CMP-TC-003 | The core journey completes on Microsoft Edge', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual(
      'Edge shares the Chromium engine, so NP-CMP-TC-001 on --project=chromium '
        + 'covers the rendering. A real Edge pass still needs a Windows machine '
        + 'with Edge installed (channel: "msedge").',
    );
  });

  test('NP-CMP-TC-005 | The core journey completes on Mozilla Firefox', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, shopPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'firefox', 'Run with --project=firefox');

    await homePage.open();
    await homePage.search(searchTerms.brand);
    await expect(shopPage.productCards.first()).toBeVisible();

    // Form controls and the autocomplete behave like the baseline.
    await homePage.open();
    await homePage.typeInSearch('nap');
    await expect(homePage.searchBox).toHaveAttribute('aria-expanded', 'true', {
      timeout: 10_000,
    });
  });

  test('NP-CMP-TC-006 | The full customer journey completes on Chrome for Android', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, shopPage, cartPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chrome', 'Run with --project=mobile-chrome');

    await homePage.open();
    await expect(homePage.header).toBeVisible();

    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();
    await shopPage.addCardToCart(0);

    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(1);
    await cartPage.emptyTheCart();
  });

  test('NP-CMP-TC-008 | The core journey completes on Safari for iOS', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, shopPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-safari', 'Run with --project=mobile-safari');

    await homePage.open();
    await expect(homePage.header).toBeVisible();
    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();

    manual(
      'WebKit in Playwright is close to, but not identical to, Safari on a real '
        + 'iPhone; a physical-device pass is still required',
    );
  });

  test('NP-CMP-TC-013 | The 64-district dropdown behaves correctly on this browser', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    // The district list is the same control the checkout and address book use.
    await homePage.goto(routes.register);
    void page;

    manual(
      'The district select is reachable only from the address book or checkout, '
        + 'which need a signed-in customer; covered per browser by NP-CMP-TC-009',
    );
  });

  test('NP-CMP-TC-014 | Bangla and English fonts render correctly', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    await homePage.open();

    // The currency symbol is Bangla script and appears on every price.
    const prices = await page.locator('.pcard .price strong').allInnerTexts();
    expect(prices.length).toBeGreaterThan(0);
    for (const price of prices.slice(0, 5)) {
      expect(price, 'the Taka sign must render, not a box or question mark')
        .toContain('৳');
      expect(price).not.toContain('?');
    }

    // A Bangla query round-trips through the search field intact.
    await homePage.search(searchTerms.bangla);
    await expect(homePage.searchBox).toHaveValue(searchTerms.bangla);

    manual('Judging glyph shaping, conjuncts and clipped ascenders needs a person');
  });

  test('NP-CMP-TC-015 | Currency and number formatting are identical on this browser', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, page }) => {
    await shopPage.open('?inStock=true');
    const prices = await page.locator('.pcard .price strong').allInnerTexts();
    expect(prices.length).toBeGreaterThan(0);

    for (const price of prices.slice(0, 10)) {
      expect(
        price.trim(),
        `"${price}" must use the same ৳ + grouped-decimal format on every browser`,
      ).toMatch(/^৳[\d,]+(\.\d{1,2})?$/);
    }
  });

  test('NP-CMP-TC-016 | The search autocomplete behaves consistently on this browser', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    await homePage.open();
    await homePage.typeInSearch('nap');

    await expect(homePage.searchBox).toHaveAttribute('aria-expanded', 'true', {
      timeout: 10_000,
    });
    await expect(homePage.searchSuggestions).toBeVisible();

    // The dropdown must not be clipped behind another element.
    const box = await homePage.searchSuggestions.boundingBox();
    expect(box, 'the suggestion list must have a real on-screen box').toBeTruthy();
    expect(box!.height).toBeGreaterThan(0);
    void page;
  });

  test('NP-CMP-TC-019 | No browser console errors occur on the key pages', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    const pages = [routes.home, routes.shop, routes.cart, routes.login, routes.help];

    const errors = await collectConsoleErrors(page, async () => {
      for (const route of pages) {
        await homePage.goto(route);
      }
    });

    // Certificate noise from the IP test host is an environment artefact.
    const real = errors.filter(
      (e) => !/certificate|ERR_CERT|favicon/i.test(e),
    );
    expect(real, `console errors: ${real.join(' | ')}`).toHaveLength(0);
  });

  test('NP-CMP-TC-020 | Tablet rendering in both orientations', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, shopPage, page }) => {
    for (const size of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);

      await homePage.open();
      await expect(homePage.header).toBeVisible();

      await shopPage.open('?inStock=true');
      await expect(shopPage.productCards.first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `no sideways scroll at ${size.width}x${size.height}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  // --- Cases needing a physical device or a real file picker ---
  test('NP-CMP-TC-010 | Prescription upload from camera and gallery on Android', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual('A camera capture and a gallery pick need a physical Android device');
  });

  test('NP-CMP-TC-011 | Prescription upload from camera and photo library on iOS', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual(
      'A camera capture, a photo-library pick and HEIC handling need a real iPhone',
    );
  });

  test('NP-CMP-TC-012 | Date pickers render and function on every supported browser', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual(
      'The date pickers live in the admin reports and promotion forms; native '
        + 'mobile date controls need a physical device to judge',
    );
  });

  test('NP-CMP-TC-017 | Session and remember-me persistence behaves correctly', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual(
      'Closing and reopening a real browser is outside a Playwright context; the '
        + 'cookie-level rule is covered by NP-LOG-TC-005 and NP-LOG-TC-006',
    );
  });

  test('NP-CMP-TC-018 | Report export and invoice download work on each desktop browser', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual('Opening the downloaded file and judging print layout needs a person');
  });
});

customerTest.describe('D1 - Compatibility (signed in)', {
  tag: ['@regression', '@crosscutting', '@cmp'],
}, () => {

  customerTest('NP-CMP-TC-009 | Checkout completes on this browser', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await ensureCartHas(shopPage, cartPage, 1);
    await checkoutPage.open();

    // The district change must recalculate on every engine.
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(storeRules.insideDistrict.charge);

    await checkoutPage.selectDistrict(storeRules.outsideDistricts[0]);
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(storeRules.outsideCharge);

    // All 64 districts are reachable here too (NP-CMP-TC-013).
    const options = (await checkoutPage.districtOptions())
      .map((o) => o.trim())
      .filter((o) => o && !/select|choose/i.test(o));
    expect(options.length).toBe(storeRules.districtCount);

    await expect(checkoutPage.placeOrderButton).toBeVisible();
    await cartPage.open();
    await cartPage.emptyTheCart();
  });
});

adminTest.describe('D1 - Compatibility (admin)', {
  tag: ['@regression', '@crosscutting', '@cmp'],
}, () => {

  adminTest('NP-CMP-TC-002 | The complete admin suite operates on this browser', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    for (const module of AdminPage.modules) {
      await page.goto(module.route, { waitUntil: 'domcontentloaded' });
      await adminSession.settle();
      expect(
        await adminSession.isServerError(),
        `${module.name} must render on this browser`,
      ).toBeFalsy();
    }

    await adminSession.openOrders();
    await expect(adminSession.table).toBeVisible();
  });

  adminTest('NP-CMP-TC-004 | The admin suite operates on Microsoft Edge', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual(
      'Edge shares the Chromium engine; NP-CMP-TC-002 on --project=chromium covers '
        + 'the rendering, but a real Edge pass is still required',
    );
  });

  adminTest('NP-CMP-TC-007 | The admin smoke journey on Chrome for Android', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }, testInfo) => {
    adminTest.skip(
      testInfo.project.name !== 'mobile-chrome',
      'Run with --project=mobile-chrome',
    );

    await adminSession.open();
    await expect(adminSession.shell).toBeVisible();

    await adminSession.openOrders();
    await expect(adminSession.table).toBeVisible();
    void page;
  });
});
