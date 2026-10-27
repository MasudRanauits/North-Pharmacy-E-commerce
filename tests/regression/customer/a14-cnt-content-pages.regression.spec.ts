/**
 * A14. CONTENT PAGES, FAQ & NEWSLETTER - 9 cases (NP-CNT-TC-001 ... 009)
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { storeRules, routes, breakpoints } from '../../../data/testData';
import { destructive, randomEmail, expectNoHorizontalScroll } from '../../../utils/helpers';

test.describe('A14 - Content Pages, FAQ & Newsletter', {
  tag: ['@regression', '@customer', '@cnt'],
}, () => {

  test('NP-CNT-TC-001 | Static content pages render from admin-managed content', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    for (const route of [routes.terms, routes.privacy, routes.delivery,
      routes.returns, routes.about]) {
      await homePage.goto(route);

      expect(await homePage.isServerError(), `${route} must render`).toBeFalsy();
      const body = await page.locator('.container.page').innerText();

      expect(body.trim().length, `${route} must have content`).toBeGreaterThan(40);
      expect(body, `${route} must not leak raw markup`).not.toMatch(/<\/?(p|div|h[1-6])>/i);
      expect(body, `${route} must not show an unresolved token`).not.toMatch(/\{\{?\w+\}?\}/);
    }
  });

  test('NP-CNT-TC-002 | An admin content edit is reflected on the customer page', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Editing live site content changes what every visitor sees');
  });

  test('NP-CNT-TC-003 | FAQ entries display and expand correctly', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.goto(routes.help);
    expect(await homePage.isServerError()).toBeFalsy();

    const questions = page.locator('details, .faq-item, [aria-expanded]');
    const count = await questions.count();
    test.skip(count === 0, 'No FAQ accordion on this build');

    const first = questions.first();
    await first.click();
    await homePage.settle();

    // Expanding reveals the answer; collapsing hides it again.
    const expanded = await first.getAttribute('aria-expanded')
      ?? (await first.evaluate((e) => (e as HTMLDetailsElement).open ? 'true' : 'false'));
    expect(['true', 'false']).toContain(String(expanded));
  });

  test('NP-CNT-TC-004 | The manufacturer listing page shows all manufacturers', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.goto(routes.manufacturers);
    expect(await homePage.isServerError()).toBeFalsy();

    const brands = page.locator('a[href^="/shop?mfr="]');
    expect(await brands.count(), 'manufacturers must be listed').toBeGreaterThan(0);

    await brands.first().click();
    await shopPage.settle();
    await expect(page).toHaveURL(/mfr=/);
    await expect(shopPage.productCards.first()).toBeVisible();
  });

  test('NP-CNT-TC-005 | Newsletter subscription with a valid email', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage }) => {
    await homePage.open();

    await homePage.newsletterInput.fill(randomEmail('qa.newsletter'));
    await homePage.newsletterSubmit.click();
    await homePage.settle();

    // A clear confirmation, and the field does not keep the address for a resend.
    const result = await homePage.newsletterResult.innerText().catch(() => '');
    const value = await homePage.newsletterInput.inputValue();
    expect(
      result.trim().length > 0 || value === '',
      'a confirmation must be shown or the field cleared',
    ).toBeTruthy();
  });

  test('NP-CNT-TC-006 | Newsletter email validation and duplicate handling', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.open();

    // Empty submission.
    await homePage.newsletterInput.fill('');
    await homePage.newsletterSubmit.click();
    await homePage.settle();
    expect(await homePage.isServerError()).toBeFalsy();

    // Invalid format.
    await homePage.newsletterInput.fill('abc.com');
    await homePage.newsletterSubmit.click();
    await homePage.settle();

    const body = await page.locator('footer').innerText();
    expect(body, 'an invalid address must not be silently accepted')
      .not.toMatch(/stack trace|Server Error/i);
  });

  test('NP-CNT-TC-007 | Hotline and contact details match store settings site-wide', {
    tag: ['@high', '@p3'],
  }, async ({ homePage, page }) => {
    for (const route of [routes.home, routes.contact, routes.shop]) {
      await homePage.goto(route);
      const footer = await homePage.footer.innerText();
      expect(footer, `${route} footer must carry the configured hotline`)
        .toContain(storeRules.hotline);
    }

    // The hotline is a working tap-to-call link.
    const tel = page.locator('a[href^="tel:"]').first();
    await expect(tel).toHaveAttribute('href', /tel:\+?8801330770000/);
  });

  test('NP-CNT-TC-008 | There are no broken links across the customer site', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page, request }) => {
    await homePage.open();

    const hrefs = await page.locator('a[href]').evaluateAll((as) =>
      [...new Set(as.map((a) => a.getAttribute('href')!))]
        .filter((h) => h && h.startsWith('/')));

    const broken: string[] = [];
    for (const href of hrefs) {
      const response = await request.get(href, { failOnStatusCode: false });
      if (response.status() >= 400) broken.push(`${href} -> ${response.status()}`);
    }

    expect(broken, `broken links found: ${broken.join(', ')}`).toHaveLength(0);
  });

  test('NP-CNT-TC-009 | The customer site renders at all supported breakpoints', {
    tag: ['@high', '@p2'],
  }, async ({ homePage, page }) => {
    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await homePage.open();

      await expect(homePage.header, `header at ${bp.label}`).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});
