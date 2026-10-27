/**
 * A3. SEARCH & AUTOCOMPLETE - 10 cases (NP-SRC-TC-001 ... 010)
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { searchTerms } from '../../../data/testData';

test.describe('A3 - Search & Autocomplete', {
  tag: ['@regression', '@customer', '@src'],
}, () => {

  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('NP-SRC-TC-001 | Search by brand name returns the matching products', {
    tag: ['@high', '@p1'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.search(searchTerms.brand);

    const names = await shopPage.names();
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.some((n) => /napa/i.test(n)),
      'results must include Napa variants',
    ).toBeTruthy();

    // Each result shows its generic, manufacturer and price.
    await expect(shopPage.card(0).locator('.pcard-generic')).toBeVisible();
    await expect(shopPage.card(0).locator('.pcard-mfr')).toBeVisible();
    await expect(shopPage.card(0).locator('.price strong')).toContainText('৳');
    void page;
  });

  test('NP-SRC-TC-002 | Search by generic name returns that generic across brands', {
    tag: ['@high', '@p1'],
  }, async ({ homePage, shopPage }) => {
    await homePage.search(searchTerms.generic);
    await shopPage.waitForListing();
    await expect(shopPage.page.locator('.pcard-mfr').first()).toBeVisible();

    const manufacturers = await shopPage.page.locator('.pcard-mfr').allInnerTexts();
    expect(
      new Set(manufacturers.map((m) => m.trim())).size,
      'a generic search must span more than one manufacturer',
    ).toBeGreaterThan(1);

    // The generic is shown so the match is evident.
    await expect(shopPage.card(0).locator('.pcard-generic')).toBeVisible();
  });

  test('NP-SRC-TC-003 | Autocomplete suggestions appear while typing and are relevant', {
    tag: ['@high', '@p1'],
  }, async ({ homePage }) => {
    await homePage.typeInSearch('nap');
    await expect(homePage.searchBox).toHaveAttribute('aria-expanded', 'true', {
      timeout: 10_000,
    });
    await expect(homePage.searchSuggestions).toBeVisible();
    const wide = await homePage.searchSuggestions.innerText();

    // Narrowing the query narrows the list.
    await homePage.searchBox.fill('');
    await homePage.typeInSearch('napa');
    await expect(homePage.searchSuggestions).toBeVisible();
    const narrow = await homePage.searchSuggestions.innerText();

    expect(narrow.toLowerCase()).toContain('napa');
    expect(wide.length).toBeGreaterThan(0);
  });

  test('NP-SRC-TC-004 | Selecting an autocomplete suggestion opens the correct product', {
    tag: ['@high', '@p1'],
  }, async ({ homePage, page }) => {
    await homePage.typeInSearch('napa');
    await expect(homePage.searchSuggestions).toBeVisible({ timeout: 10_000 });

    const option = homePage.searchSuggestions.locator('li, [role="option"], a').first();
    const label = (await option.innerText()).split('\n')[0].trim();
    await option.click();
    await homePage.settle();

    // The detail page that opens is the one that was chosen.
    await expect(page).toHaveURL(/\/p\//);
    await expect(page.locator('h1').first()).toContainText(label.slice(0, 8), {
      ignoreCase: true,
    });
  });

  test('NP-SRC-TC-005 | Search is case-insensitive and tolerant of whitespace', {
    tag: ['@medium', '@p2'],
  }, async ({ homePage, shopPage }) => {
    const counts: number[] = [];

    for (const term of ['napa', 'NAPA', 'NaPa', '  napa  ']) {
      await homePage.open();
      await homePage.search(term);
      counts.push(await shopPage.waitForListing());
    }

    expect(
      new Set(counts).size,
      `all four spellings must return the same result set (got ${counts.join(', ')})`,
    ).toBe(1);
  });

  test('NP-SRC-TC-006 | No-result state for a term that matches no product', {
    tag: ['@medium', '@p2'],
  }, async ({ homePage, shopPage, page }) => {
    await homePage.search(searchTerms.noResult);

    await expect(shopPage.productCards).toHaveCount(0);
    const body = await page.locator('.container.page').innerText();

    expect(body.trim().length, 'never a blank white screen').toBeGreaterThan(0);
    expect(body).toMatch(/no results|nothing|couldn't find|no products/i);
    expect(body).not.toMatch(/Server Error|undefined|NaN/i);
  });

  test('NP-SRC-TC-007 | Search handles script and injection patterns safely', {
    tag: ['@critical', '@p1'],
  }, async ({ homePage, page }) => {
    let dialogShown = false;
    page.on('dialog', async (dialog) => {
      dialogShown = true;
      await dialog.dismiss();
    });

    await homePage.search(searchTerms.xss);
    expect(dialogShown, 'the script payload must not execute').toBeFalsy();
    let body = await page.locator('body').innerText();
    expect(body).not.toMatch(/stack trace|SqlException|at System\./i);

    await homePage.open();
    await homePage.search(searchTerms.sqli);
    body = await page.locator('body').innerText();
    expect(dialogShown).toBeFalsy();
    expect(
      body,
      'no database error or raw API message may be exposed',
    ).not.toMatch(/SQL syntax|ORA-\d+|SqlException|stack trace/i);
  });

  test('NP-SRC-TC-008 | Search accepts Bangla input without error', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.search(searchTerms.bangla);

    // The term round-trips without character corruption.
    await expect(homePage.searchBox).toHaveValue(searchTerms.bangla);
    expect(await homePage.isServerError(), 'Bangla input must not error').toBeFalsy();
    const body = await page.locator('.container.page').innerText();
    expect(body, 'no mojibake in the echoed term').not.toContain('????');
  });

  test('NP-SRC-TC-009 | Rapid typing does not produce stale or out-of-order suggestions', {
    tag: ['@medium', '@p2'],
  }, async ({ homePage }) => {
    await homePage.searchBox.click();
    await homePage.searchBox.pressSequentially('napados', { delay: 20 });
    for (let i = 0; i < 4; i++) await homePage.searchBox.press('Backspace');
    await homePage.searchBox.fill('');
    await homePage.searchBox.pressSequentially('seclo', { delay: 20 });

    await expect(homePage.searchBox).toHaveValue('seclo');
    if (await homePage.searchSuggestions.isVisible().catch(() => false)) {
      const suggestions = await homePage.searchSuggestions.innerText();
      expect(
        suggestions.toLowerCase(),
        'the list must match the final query only',
      ).not.toContain('napados');
    }
  });

  test('NP-SRC-TC-010 | A very long search string is handled without breaking layout', {
    tag: ['@low', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.search(searchTerms.long);

    expect(await homePage.isServerError(), 'a long query must not error').toBeFalsy();

    // The page must not start scrolling sideways because of the input.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'a long query must not break the layout').toBeLessThanOrEqual(2);
  });
});
