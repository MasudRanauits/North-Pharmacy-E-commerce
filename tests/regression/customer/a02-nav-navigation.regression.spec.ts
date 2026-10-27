/**
 * A2. NAVIGATION, BROWSING, SORTING & FILTERING - 16 cases
 * (NP-NAV-TC-001 ... 016)
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { categories } from '../../../data/testData';
import { manual } from '../../../utils/helpers';

test.describe('A2 - Navigation, Browsing, Sorting & Filtering', {
  tag: ['@regression', '@customer', '@nav'],
}, () => {

  test('NP-NAV-TC-001 | Header navigation and category menu route correctly on desktop', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, shopPage, page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await homePage.open();

    await expect(homePage.navLinks.first()).toBeVisible();
    expect(await homePage.navLinks.count()).toBeGreaterThan(3);

    await page.getByRole('link', { name: 'Medicines', exact: true }).first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/dept=|cat=/);
    await expect(shopPage.productCards.first()).toBeVisible();
  });

  test('NP-NAV-TC-002 | Mobile navigation drawer functions correctly', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await homePage.open();

    // The category entry point must stay reachable at phone width.
    await expect(homePage.allCategoriesButton).toBeVisible();
    await homePage.allCategoriesButton.click();
    await expect(homePage.categoryLink(/Tablets & Capsules/)).toBeVisible();

    await homePage.categoryLink(/Tablets & Capsules/).click();
    await homePage.settle();
    await expect(page).toHaveURL(/cat=tablets-capsules/);
  });

  test('NP-NAV-TC-003 | Category listing shows only products of that category', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await shopPage.openCategory('injections');

    await expect(shopPage.productCards.first()).toBeVisible();
    await expect(shopPage.heading).toContainText(/Injections/i);
    await expect(page).toHaveURL(/cat=injections/);

    // The active filter chip reflects the chosen category.
    await expect(shopPage.filterChips.first()).toContainText(/Injections/i);
  });

  test('NP-NAV-TC-004 | Pagination navigates without repeating or skipping products', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await shopPage.openCategory('tablets-capsules');
    const pageOne = await shopPage.names();

    const next = page.getByRole('link', { name: /^2$/ })
      .or(page.getByRole('button', { name: /next|^2$/i }));
    test.skip((await next.count()) === 0, 'Listing is a single page');

    await next.first().click();
    const pageTwo = await shopPage.names();

    const overlap = pageOne.filter((n) => pageTwo.includes(n));
    expect(overlap, 'no product may repeat across pages').toHaveLength(0);
  });

  test('NP-NAV-TC-005 | Sorting by price ascending and descending orders results correctly', {
    tag: ['@medium', '@p2'],
  }, async ({ shopPage }) => {
    await shopPage.openCategory('tablets-capsules');
    await shopPage.waitForListing();

    await shopPage.sortBy('Price: low to high');
    const ascending = await shopPage.prices();
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    await shopPage.sortBy('Price: high to low');
    const descending = await shopPage.prices();
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
  });

  test('NP-NAV-TC-006 | Filtering by manufacturer returns only that manufacturer products', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await shopPage.open();
    await expect(shopPage.productCards.first()).toBeVisible();

    const manufacturerFilter = page.locator('.filter-group button').filter({
      hasText: /Square Pharmaceuticals/,
    }).first();
    test.skip((await manufacturerFilter.count()) === 0, 'Manufacturer filter not offered');

    const label = (await manufacturerFilter.innerText()).split('\n')[0].trim();
    await manufacturerFilter.click();
    await shopPage.settle();

    const shown = await shopPage.productCards.count();
    for (let i = 0; i < Math.min(shown, 5); i++) {
      await expect(shopPage.card(i).locator('.pcard-mfr')).toContainText(label.slice(0, 12));
    }
  });

  test('NP-NAV-TC-007 | Multiple filters applied together narrow results correctly', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage }) => {
    await shopPage.openCategory('tablets-capsules');
    const baseline = await shopPage.totalResults();

    await shopPage.goto('/shop?cat=tablets-capsules&inStock=true');
    const narrowed = await shopPage.totalResults();

    expect(narrowed, 'adding a filter must never increase the result count')
      .toBeLessThanOrEqual(baseline);
    await expect(shopPage.filterChips.first()).toBeVisible();
  });

  test('NP-NAV-TC-008 | Filter reset clears all filters and restores the full listing', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage }) => {
    await shopPage.goto('/shop?cat=tablets-capsules&inStock=true');
    const filtered = await shopPage.totalResults();
    await expect(shopPage.clearAllButton).toBeVisible();

    await shopPage.clearAllButton.click();
    await shopPage.settle();

    const restored = await shopPage.totalResults();
    expect(restored).toBeGreaterThanOrEqual(filtered);
    await expect(shopPage.filterChips).toHaveCount(0);
  });

  test('NP-NAV-TC-009 | No-results state when a filter combination matches nothing', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, page }) => {
    await shopPage.goto('/shop?cat=injections&minPrice=1&maxPrice=2');
    await shopPage.settle();

    const cards = await shopPage.productCards.count();
    if (cards === 0) {
      // A friendly empty state, never a blank page or an error.
      const body = await page.locator('.container.page').innerText();
      expect(body.trim().length).toBeGreaterThan(0);
      expect(body).not.toMatch(/Server Error|undefined|NaN/i);
    }
  });

  test('NP-NAV-TC-010 | Browser back and forward preserve the listing and filters', {
    tag: ['@low', '@p3'],
  }, async ({ shopPage, page }) => {
    await shopPage.goto('/shop?cat=tablets-capsules&inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();

    await shopPage.productNames.first().click();
    await shopPage.settle();

    await page.goBack();
    await shopPage.settle();
    await expect(page).toHaveURL(/cat=tablets-capsules/);
    await expect(page).toHaveURL(/inStock=true/);
  });

  test('NP-NAV-TC-011 | All Categories panel opens and closes with its own controls', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    await homePage.open();

    // The panel is a click toggle, not a hover menu.
    await homePage.allCategoriesButton.hover();
    await page.waitForTimeout(500);
    await expect(homePage.categoryLink(/Tablets & Capsules/)).toHaveCount(0);

    await homePage.openAllCategories();
    await expect(homePage.browseAllProductsLink).toBeVisible();

    await homePage.allCategoriesButton.click();
    await expect(homePage.categoryLink(/Tablets & Capsules/)).toBeHidden();
  });

  test('NP-NAV-TC-012 | Stock count beside each category matches the catalogue', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    const panelText = await page.locator('.allcats').innerText();
    const match = panelText.match(/Tablets & Capsules\s*\n?\s*([\d,]+)\s+in stock/);
    expect(match, 'Tablets & Capsules must show an in-stock count').toBeTruthy();
    const panelCount = Number(match![1].replace(/,/g, ''));

    // Cross-check against the listing filtered to in-stock products.
    await shopPage.goto('/shop?cat=tablets-capsules&inStock=true');
    const listingCount = await shopPage.totalResults();

    expect(
      panelCount,
      `panel count ${panelCount} must equal the in-stock listing count ${listingCount}`,
    ).toBe(listingCount);
  });

  test('NP-NAV-TC-013 | Wording used when a category has no products in stock', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    const panelText = await page.locator('.allcats').innerText();
    const babyLine = panelText.match(/Baby & Mother\s*\n?\s*([\d,]+)\s+(in stock|products)/);
    test.skip(!babyLine, 'Baby & Mother not present in the panel');

    // The documented rule: a zero-stock category must not read as "in stock".
    const [, , wording] = babyLine!;
    if (wording === 'products') {
      // Entering the category must then show everything as unpurchasable.
      await shopPage.openCategory('baby-mother');
      await expect(shopPage.productCards.first()).toBeVisible();
      const addButtons = await shopPage.page
        .getByRole('button', { name: 'Add to Cart' })
        .count();
      expect(addButtons, 'nothing in a zero-stock category may be purchasable').toBe(0);
    } else {
      expect(wording).toBe('in stock');
    }
  });

  test('NP-NAV-TC-014 | Browse all products link opens the full catalogue listing', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    await homePage.browseAllProductsLink.click();
    await shopPage.settle();

    await expect(page).toHaveURL(/\/shop/);
    await expect(shopPage.productCards.first()).toBeVisible();
    // The listing is unfiltered by category.
    await expect(page).not.toHaveURL(/cat=/);
  });

  test('NP-NAV-TC-015 | Shop and Offers items in the top navigation bar', {
    tag: ['@high', '@p2'],
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
    await shopPage.waitForListing();

    // Every product under Offers carries a discount.
    const cards = await shopPage.productCards.allInnerTexts();
    expect(cards.length, 'the Offers listing must show products').toBeGreaterThan(0);
    for (const [i, card] of cards.entries()) {
      expect(card, `Offers card ${i + 1} must carry a discount badge`).toContain('%');
    }
  });

  test('NP-NAV-TC-016 | All Categories panel lists every configured category', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.open();
    await homePage.openAllCategories();

    const panelText = await page.locator('.allcats').innerText();
    for (const category of categories) {
      expect(panelText, `"${category.name}" must be listed`).toContain(category.name);
    }

    // Each of the first three opens its own listing.
    for (const category of categories.slice(0, 3)) {
      await shopPage.openCategory(category.slug);
      await expect(shopPage.heading).toContainText(
        new RegExp(category.name.split(' ')[0], 'i'),
      );
    }
  });
});
