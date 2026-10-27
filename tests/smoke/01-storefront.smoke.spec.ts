/**
 * SMOKE - Storefront shell, home page, navigation and search.
 *
 * Build-verification subset of NP-QA-TC-001 v1.3. Every case here is a
 * Critical or High severity P1/P2 case whose failure means the build is not
 * worth testing further. Nothing in the smoke suite writes data.
 *
 * Covers: NP-HOM-TC-001/002/006, NP-NAV-TC-011/012/015/016,
 *         NP-SRC-TC-001/003/007
 */
import { test, expect } from '../../fixtures/test-fixtures';
import { categories, storeRules, searchTerms } from '../../data/testData';

test.describe('Smoke - Storefront', { tag: ['@smoke', '@p1'] }, () => {

  test('NP-HOM-TC-001 | Home page loads with all merchandising sections', {
    tag: '@high',
  }, async ({ homePage, page }) => {
    await homePage.open();

    await expect(homePage.topBar).toBeVisible();
    await expect(homePage.header).toBeVisible();
    await expect(homePage.searchBox).toBeVisible();
    await expect(homePage.heroDots.first()).toBeVisible();
    await expect(homePage.allCategoriesButton).toBeVisible();
    await expect(homePage.productCards.first()).toBeVisible();
    await expect(homePage.footer).toBeVisible();
    await expect(page).toHaveTitle(/North Pharmacy/i);
  });

  test('NP-HOM-TC-002 | Top bar shows the free-delivery message with resolved values', {
    tag: '@high',
  }, async ({ homePage }) => {
    await homePage.open();

    const message = await homePage.topBar.innerText();
    expect(message).toMatch(/Free Home Delivery on orders above/i);
    expect(message).toContain('2,000');
    // The placeholder token must never leak to the customer.
    expect(message).not.toMatch(/\{.*\}/);
  });

  test('NP-HOM-TC-006 | Featured product cards show price and stock state', {
    tag: '@critical',
  }, async ({ homePage }) => {
    await homePage.open();
    const card = homePage.productCards.first();

    await expect(card.locator('.pcard-name')).toBeVisible();
    await expect(card.locator('.price strong')).toBeVisible();
    await expect(card.locator('.stock')).toBeVisible();
    await expect(card.locator('.price strong')).toContainText('৳');
  });

  test('NP-NAV-TC-011 | All Categories panel opens on click and closes again', {
    tag: '@high',
  }, async ({ homePage }) => {
    await homePage.open();

    await homePage.openAllCategories();
    await expect(homePage.categoryLink(/Tablets & Capsules/)).toBeVisible();

    // Clicking the toggle again dismisses it.
    await homePage.allCategoriesButton.click();
    await expect(homePage.categoryLink(/Tablets & Capsules/)).toBeHidden();
  });

  test('NP-NAV-TC-012 | Category stock counts are rendered in the panel', {
    tag: '@critical',
  }, async ({ homePage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    const panel = await page.locator('.allcats').innerText();
    // Every category carries either an in-stock count or a product count.
    expect(panel).toMatch(/\d[\d,]*\s+(in stock|products)/);
    expect(panel).toMatch(/Tablets & Capsules[\s\S]*?[\d,]+ in stock/);
  });

  test('NP-NAV-TC-016 | All eleven configured categories are listed', {
    tag: '@high',
  }, async ({ homePage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    const panel = await page.locator('.allcats').innerText();
    for (const category of categories) {
      expect(panel, `category "${category.name}" must appear`).toContain(category.name);
    }
  });

  test('NP-NAV-TC-015 | Shop and Offers open their listings', {
    tag: '@high',
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();

    await page.getByRole('link', { name: 'Shop', exact: true }).first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/\/shop/);
    await expect(shopPage.productCards.first()).toBeVisible();

    await homePage.open();
    await page.getByRole('link', { name: 'Offers', exact: true }).first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/offers=true/);
  });

  test('NP-SRC-TC-001 | Search by brand name returns matching products', {
    tag: '@high',
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await homePage.search(searchTerms.brand);

    await expect(page).toHaveURL(/q=|search/i);
    await expect(shopPage.productCards.first()).toBeVisible();
    await expect(shopPage.productNames.first()).toContainText(/napa/i);
  });

  test('NP-SRC-TC-003 | Autocomplete suggestions appear while typing', {
    tag: '@high',
  }, async ({ homePage }) => {
    await homePage.open();
    await homePage.typeInSearch(searchTerms.partial);

    await expect(homePage.searchBox).toHaveAttribute('aria-expanded', 'true', {
      timeout: 10_000,
    });
    await expect(homePage.searchSuggestions).toBeVisible();
  });

  test('NP-SRC-TC-007 | Search handles script and injection payloads safely', {
    tag: '@critical',
  }, async ({ homePage, page }) => {
    let dialogShown = false;
    page.on('dialog', async (dialog) => {
      dialogShown = true;
      await dialog.dismiss();
    });

    await homePage.open();
    await homePage.search(searchTerms.xss);
    expect(dialogShown, 'no script may execute from the search term').toBeFalsy();

    await homePage.open();
    await homePage.search(searchTerms.sqli);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/SQL|stack trace|SqlException|ORA-\d+/i);
    expect(dialogShown).toBeFalsy();
  });

  test('Storefront delivery rules are published as configured', {
    tag: '@high',
  }, async ({ homePage }) => {
    await homePage.open();
    const body = await homePage.page.locator('body').innerText();

    expect(body).toContain(`৳${storeRules.insideDistrict.charge}`);
    expect(body).toContain(`৳${storeRules.outsideCharge}`);
    expect(body).toContain('2,000');
  });
});
