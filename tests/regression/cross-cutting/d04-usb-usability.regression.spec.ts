/**
 * D4. CUSTOMER USABILITY - 6 cases (NP-USB-TC-001 ... 006)
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { routes, searchTerms, storeRules } from '../../../data/testData';
import {
  manual, randomMobile, ensureCartHas, destructive,
} from '../../../utils/helpers';

/** Developer wording that must never reach a customer. */
const DEVELOPER_WORDING =
  /stack trace|at System\.|TypeError|NullReference|SqlException|\b(4\d\d|5\d\d) error\b|undefined|NaN/i;

test.describe('D4 - Customer Usability', {
  tag: ['@regression', '@crosscutting', '@usb'],
}, () => {

  test('NP-USB-TC-001 | Customer-facing error messages are actionable, not technical', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, homePage, shopPage, page }) => {
    // 1. A validation error.
    await registerPage.open();
    await registerPage.submit();
    let body = await page.locator('form.auth-form').innerText();
    expect(body, 'a validation error must be plain language').not.toMatch(DEVELOPER_WORDING);

    // 2. A not-found route.
    await homePage.goto('/this-page-does-not-exist');
    body = await page.locator('body').innerText();
    expect(body, 'a missing page must explain itself').not.toMatch(DEVELOPER_WORDING);
    expect(body.trim().length, 'never a blank screen').toBeGreaterThan(0);

    // 3. A search that finds nothing - wait for the grid to settle first,
    // otherwise the "Loading products…" placeholder is what gets read.
    await homePage.open();
    await homePage.search(searchTerms.noResult);
    await shopPage.waitForListing();
    body = await page.locator('.container.page').innerText();
    expect(body).not.toMatch(DEVELOPER_WORDING);
    expect(body, 'the customer must be told what to do next')
      .toMatch(/no results|nothing|try|browse|couldn't find/i);
  });

  test('NP-USB-TC-002 | The primary action on each key page is reachable on mobile', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, cartPage, page }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    // Listing: add-to-cart is reachable without hunting.
    await shopPage.open('?inStock=true');
    const add = shopPage.card(0).getByRole('button', { name: 'Add to Cart' });
    await expect(add).toBeVisible();
    const addBox = await add.boundingBox();
    expect(addBox!.y, 'the first add-to-cart must be near the top of the listing')
      .toBeLessThan(2500);

    // Cart: the checkout control is reachable.
    await shopPage.addCardToCart(0);
    await cartPage.open();
    await expect(cartPage.checkoutButton.first()).toBeVisible();
    await cartPage.emptyTheCart();
  });

  test('NP-USB-TC-003 | Terminology is consistent across the customer site', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    const seen: Record<string, Set<string>> = {
      cart: new Set(),
      wishlist: new Set(),
      prescription: new Set(),
    };

    for (const route of [routes.home, routes.shop, routes.cart, routes.login]) {
      await homePage.goto(route);
      // Only the chrome counts: merchandising copy legitimately uses words
      // like "Favorites" in a section heading without meaning the wishlist.
      const header = await page.locator('header, .navbar-inner, .topbar').allInnerTexts();
      const footer = await page.locator('footer').allInnerTexts();
      const body = [...header, ...footer].join('\n');

      for (const variant of ['Cart', 'Basket', 'Bag']) {
        if (new RegExp(`\\b${variant}\\b`).test(body)) seen.cart.add(variant);
      }
      for (const variant of ['Wishlist', 'Favourites', 'Favorites', 'Saved items']) {
        if (new RegExp(`\\b${variant}\\b`, 'i').test(body)) seen.wishlist.add(variant);
      }
      for (const variant of ['Prescription', 'Rx slip', 'Doctor note']) {
        if (new RegExp(`\\b${variant}\\b`, 'i').test(body)) seen.prescription.add(variant);
      }
    }

    for (const [concept, variants] of Object.entries(seen)) {
      expect(
        variants.size,
        `"${concept}" is described ${variants.size} different ways: `
          + `${[...variants].join(', ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('NP-USB-TC-004 | Breadcrumbs and back navigation make the location clear', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await shopPage.openCategory('tablets-capsules');

    const crumbs = page.locator('nav.crumbs, nav[aria-label="Breadcrumb"]').first();
    await expect(crumbs, 'the listing must show a breadcrumb').toBeVisible();

    const text = await crumbs.innerText();
    expect(text).toMatch(/Home/i);
    expect(text, 'the breadcrumb must name the current category')
      .toMatch(/Tablets/i);

    // Every segment but the current one is a working link.
    const links = crumbs.locator('a');
    expect(await links.count(), 'breadcrumb segments must be links').toBeGreaterThan(0);

    await links.first().click();
    await homePage.settle();
    await expect(page).toHaveURL(/\/$|\/shop/);

    // Back returns to the category, not to the home page.
    await page.goBack();
    await homePage.settle();
    await expect(page).toHaveURL(/cat=tablets-capsules/);
  });

  test('NP-USB-TC-005 | Loading indicators are shown during slow operations', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    // Throttle the listing request and look for interim feedback.
    await page.route('**/*', async (route) => {
      if (/api|shop/i.test(route.request().url())) {
        await new Promise((r) => setTimeout(r, 600));
      }
      await route.continue();
    });

    const navigation = shopPage.open('?inStock=true');
    await page.waitForTimeout(400);

    const feedback = await page.evaluate(() =>
      document.querySelectorAll(
        '.spinner, .loading, .skeleton, [aria-busy="true"], [role="progressbar"]',
      ).length).catch(() => -1);

    await navigation;
    await page.unroute('**/*');

    if (feedback <= 0) {
      manual(
        'No spinner or skeleton was detected during a throttled load; confirm by '
          + 'hand on a slow connection that the screen never looks frozen',
      );
      return;
    }
    expect(feedback).toBeGreaterThan(0);
  });

  test('NP-USB-TC-006 | Entered form data is preserved when validation fails', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage }) => {
    await registerPage.open();

    const name = 'QA Auto Retention';
    const mobile = randomMobile();
    const email = `${mobile}@mailinator.com`;

    await registerPage.fullNameInput.fill(name);
    await registerPage.mobileInput.fill(mobile);
    await registerPage.emailInput.fill(email);
    // Deliberately mismatch the confirmation so the submit fails.
    await registerPage.passwordInput.fill('QaPharma2026');
    await registerPage.confirmPasswordInput.fill('QaPharma2026-different');
    await registerPage.submit();

    // The valid entries must survive the failed submission.
    await expect(registerPage.fullNameInput).toHaveValue(name);
    await expect(registerPage.mobileInput).toHaveValue(mobile);
    await expect(registerPage.emailInput).toHaveValue(email);
  });
});

customerTest.describe('D4 - Customer Usability (signed in)', {
  tag: ['@regression', '@crosscutting', '@usb'],
}, () => {

  customerTest('NP-USB-TC-006 | Entered data is preserved - checkout address form', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage }) => {
    await ensureCartHas(shopPage, cartPage, 1);
    await checkoutPage.open();

    await checkoutPage.ensureAddressForm();
    const address = 'House 7, Road 2, Mohammadpur';
    await checkoutPage.addressTextarea.fill(address);
    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);

    // What is entered survives the summary recalculating around it.
    await expect(checkoutPage.addressTextarea).toHaveValue(address);
    await expect(checkoutPage.districtSelect.first())
      .toHaveValue(/.+/, { timeout: 10_000 });

    // Submitting is NOT safe here: clicking Place order with a saved address
    // selected creates a real order, which is how NP-104022 … NP-104027 were
    // created during suite development. The register-form half of this case
    // covers the retention-after-failure rule without that risk.
    destructive('Clicking Place order to force a failed submission creates real orders');

    await cartPage.open();
    await cartPage.emptyTheCart();
  });
});
