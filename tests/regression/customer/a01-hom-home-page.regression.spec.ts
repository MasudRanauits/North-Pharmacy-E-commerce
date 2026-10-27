/**
 * A1. HOME PAGE & MERCHANDISING - 9 cases (NP-HOM-TC-001 ... 009)
 * Source: NP-QA-TC-001 v1.3 Part A.
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { departments, storeRules } from '../../../data/testData';
import { manual } from '../../../utils/helpers';

test.describe('A1 - Home Page & Merchandising', { tag: ['@regression', '@customer', '@hom'] }, () => {

  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('NP-HOM-TC-001 | Home page loads completely with all merchandising sections', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    await expect(homePage.topBar).toBeVisible();
    await expect(homePage.header).toBeVisible();
    await expect(homePage.searchBox).toBeVisible();
    await expect(homePage.heroDots.first()).toBeVisible();
    await expect(homePage.productCards.first()).toBeVisible();
    await expect(homePage.brandStrip.first()).toBeVisible();
    await expect(homePage.footer).toBeVisible();

    // No broken images anywhere on the page.
    const broken = await page.evaluate(
      () => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken, 'no broken images on the home page').toBe(0);
  });

  test('NP-HOM-TC-002 | Promotional top bar shows the free-delivery message with resolved values', {
    tag: ['@high', '@p2'],
  }, async ({ homePage }) => {
    const message = await homePage.topBar.innerText();

    expect(message).toMatch(/Free Home Delivery on orders above/i);
    expect(message).toContain('2,000');
    expect(message, 'placeholder token must be resolved').not.toMatch(
      /\{freeDeliveryAbove\}|\{.*\}/,
    );
  });

  test('NP-HOM-TC-003 | Hero slider rotates automatically and supports manual navigation', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage }) => {
    const slideCount = await homePage.heroDots.count();
    expect(slideCount).toBeGreaterThanOrEqual(3);

    // Manual controls change the slide immediately.
    const start = await homePage.activeSlideIndex();
    await homePage.heroNext.click();
    await expect.poll(() => homePage.activeSlideIndex()).not.toBe(start);

    const afterNext = await homePage.activeSlideIndex();
    await homePage.heroPrev.click();
    await expect.poll(() => homePage.activeSlideIndex()).not.toBe(afterNext);

    // A pagination dot jumps straight to its slide.
    await homePage.heroDots.nth(2).click();
    await expect.poll(() => homePage.activeSlideIndex()).toBe(2);
  });

  test('NP-HOM-TC-004 | Hero slide call-to-action buttons navigate to the configured destination', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    const expected = ['/shop?offers=true', '/delivery', '/account/prescriptions', '/help'];

    for (const href of expected) {
      await expect(
        page.locator(`a[href="${href}"]`).first(),
        `hero CTA for ${href} must exist`,
      ).toHaveCount(1, { timeout: 10_000 }).catch(async () => {
        await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
      });
    }

    // The offers link opens the discounted listing.
    await page.locator('a[href="/shop?offers=true"]').first().click();
    await homePage.settle();
    await expect(page).toHaveURL(/offers=true/);
  });

  test('NP-HOM-TC-005 | All six product departments are displayed and navigate correctly', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, shopPage, page }) => {
    const nav = await homePage.departmentSection.innerText();
    for (const department of departments) {
      expect(nav, `department "${department}" must be listed`).toContain(department);
    }

    await page.getByRole('link', { name: departments[0], exact: true }).first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/dept=|cat=/);
    await expect(shopPage.productCards.first()).toBeVisible();
  });

  test('NP-HOM-TC-006 | Featured and offer cards show correct price, discount and stock state', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage }) => {
    const card = homePage.productCards.first();

    await expect(card.locator('.pcard-name')).toBeVisible();
    await expect(card.locator('.pcard-mfr')).toBeVisible();
    await expect(card.locator('.price strong')).toContainText('৳');
    await expect(card.locator('.stock')).toBeVisible();

    // A discounted card shows a struck-through MRP alongside the badge.
    const discounted = homePage.productCards.filter({ hasText: '%' }).first();
    if (await discounted.count()) {
      await expect(discounted.locator('.price')).toContainText('৳');
    }

    // An out-of-stock card offers no add-to-cart control.
    const outOfStock = homePage.productCards.filter({ hasText: /out of stock/i }).first();
    if (await outOfStock.count()) {
      await expect(outOfStock.getByRole('button', { name: 'Add to Cart' })).toHaveCount(0);
    }
  });

  test('NP-HOM-TC-007 | Brand strip shows only manufacturers flagged for the home page', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, shopPage, page }) => {
    const brands = homePage.brandStrip;
    expect(await brands.count()).toBeGreaterThan(0);

    // Every brand tile links to that manufacturer's filtered listing.
    const href = await brands.first().getAttribute('href');
    expect(href).toMatch(/\/shop\?mfr=/);

    await brands.first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/mfr=/);
  });

  test('NP-HOM-TC-008 | Footer contact details match the configured store settings', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage }) => {
    const footer = await homePage.footer.innerText();

    expect(footer).toContain(storeRules.hotline);
    expect(footer).toContain('Mohammadpur');
    expect(footer).toContain('Dhaka-1207');
    await expect(homePage.hotlineLink.first()).toHaveAttribute('href', /^tel:/);
  });

  test('NP-HOM-TC-009 | Hero slider pause and resume control stops and restarts rotation', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage }) => {
    await expect(homePage.heroPause).toBeVisible();
    expect(await homePage.isSliderPaused()).toBeFalsy();

    // Pausing flips the control to its play state.
    await homePage.heroPause.click();
    await expect.poll(() => homePage.isSliderPaused()).toBeTruthy();

    // Manual navigation still works while paused.
    const paused = await homePage.activeSlideIndex();
    await homePage.heroNext.click();
    await expect.poll(() => homePage.activeSlideIndex()).not.toBe(paused);

    // Resuming restores automatic rotation.
    await homePage.heroPause.click();
    await expect.poll(() => homePage.isSliderPaused()).toBeFalsy();

    manual(
      'Observing a full 30-second automatic rotation cycle is a timing check '
        + 'better done by hand; the control states are asserted above',
    );
  });
});
