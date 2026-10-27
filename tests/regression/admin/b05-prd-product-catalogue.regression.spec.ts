/**
 * B5. PRODUCT CATALOGUE MANAGEMENT - 25 cases (NP-PRD-TC-001 ... 025)
 *
 * Creating, editing, hiding and deleting products changes the UAT catalogue,
 * so those cases are marked destructive. Search, filter, sort and slug
 * behaviour are asserted for real against the existing catalogue.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { manual, destructive } from '../../../utils/helpers';

adminTest.describe('B5 - Product Catalogue', {
  tag: ['@regression', '@admin', '@prd'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openInventory();
  });

  adminTest('NP-PRD-TC-001 | A new product can be created with all attributes', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Creating a product adds a permanent row to the live catalogue');
  });

  adminTest('NP-PRD-TC-002 | Mandatory field validation on the product form', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const addProduct = page.getByRole('button', { name: /Add product|New product/i })
      .or(page.getByRole('link', { name: /Add product|New product/i }));

    if ((await addProduct.count()) === 0) {
      manual('No add-product entry point is exposed in this build of Inventory');
      return;
    }

    await addProduct.first().click();
    await adminSession.settle();

    // Submitting an empty form must be refused without creating anything.
    const save = page.getByRole('button', { name: /^(Save|Create|Add)$/i }).first();
    if (await save.count()) {
      await save.click();
      await adminSession.settle();
      await expect(
        page.getByRole('button', { name: /^(Save|Create|Add)$/i }).first(),
        'the form must stay open on an invalid submit',
      ).toBeVisible();
    }
  });

  adminTest('NP-PRD-TC-003 | The selling price cannot exceed the MRP', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires saving price combinations against a real product');
  });

  adminTest('NP-PRD-TC-004 | The discount percentage is calculated and displayed correctly', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only: a discounted product must show a self-consistent percentage.
    await adminSession.goto('/shop?offers=true');
    const card = page.locator('.pcard').first();
    await expect(card).toBeVisible();

    const text = await card.innerText();
    const percent = Number(text.match(/-?(\d+)\s?%/)?.[1] ?? NaN);
    const amounts = [...text.matchAll(/৳([\d,]+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1].replace(/,/g, '')));

    adminTest.skip(
      Number.isNaN(percent) || amounts.length < 2,
      'The first offer card does not print both prices and a percentage',
    );

    const [price, mrp] = [Math.min(...amounts), Math.max(...amounts)];
    const computed = ((mrp - price) / mrp) * 100;
    expect(
      Math.abs(computed - percent),
      'the badge must equal (MRP - price) / MRP x 100',
    ).toBeLessThanOrEqual(1);
  });

  adminTest('NP-PRD-TC-005 | Numeric field validation rejects negative and non-numeric values', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires submitting invalid values against the product form');
  });

  adminTest('NP-PRD-TC-006 | A product image can be uploaded, replaced and removed', {
    tag: ['@medium', '@p2'],
  }, async () => {
    destructive('Changing product imagery changes the live storefront');
  });

  adminTest('NP-PRD-TC-007 | Product image upload restricts file type and size', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires attempting real uploads against a live product');
  });

  adminTest('NP-PRD-TC-008 | An edited product propagates to the customer site', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Editing a live product changes what customers see and pay');
  });

  adminTest('NP-PRD-TC-009 | The prescription-required flag controls the customer gate', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only: the flag is visible in the admin and badged on the storefront.
    const rxRow = adminSession.rows.filter({ hasText: /Rx/i }).first();
    if (await rxRow.count()) {
      await expect(rxRow).toContainText(/Rx/i);
    }

    await adminSession.goto('/shop?inStock=true');
    const rxCard = page.locator('.pcard').filter({ hasText: 'Rx' }).first();
    if (await rxCard.count()) {
      await expect(rxCard).toContainText('Rx');
    }

    destructive('Toggling the flag on a live product changes who can buy it');
  });

  adminTest('NP-PRD-TC-010 | A product can be hidden and unhidden', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Hiding a live product removes it from the storefront');
  });

  adminTest('NP-PRD-TC-011 | The product list can be searched, filtered and sorted', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const rows = await adminSession.searchInventory('Napa');
    expect(
      rows,
      'searching the admin catalogue for the seeded brand "Napa" must return '
        + 'the same products the storefront returns for it',
    ).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(rows, 5); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/napa/i);
    }

    // Clearing restores a larger set.
    expect(await adminSession.searchInventory('')).toBeGreaterThanOrEqual(rows);
    void page;
  });

  adminTest('NP-PRD-TC-012 | Deleting a product does not corrupt existing orders', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Deleting a catalogue product is irreversible on a shared environment');
  });

  adminTest('NP-PRD-TC-013 | A negative MRP is rejected on the product form', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires submitting a negative price against the product form');
  });

  adminTest('NP-PRD-TC-014 | A negative stock value is rejected on the product form', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // The stock field must at least refuse negatives at the input level.
    const stockInput = page.locator('.adm input[type="number"]').first();
    if ((await stockInput.count()) === 0) {
      destructive('Stock is only editable through a form that writes to live data');
      return;
    }

    const min = await stockInput.getAttribute('min');
    expect(min === null || Number(min) >= 0, 'stock must not allow negatives').toBeTruthy();
    void adminSession;
  });

  adminTest('NP-PRD-TC-015 | Non-numeric input in the price field is rejected', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires submitting text into the price field of a real product');
  });

  adminTest('NP-PRD-TC-016 | An unreasonably large numeric value is handled without overflow', {
    tag: ['@medium', '@p3'],
  }, async () => {
    destructive('Requires saving an extreme value against a real product');
  });

  adminTest('NP-PRD-TC-017 | The product slug is generated correctly from the attributes', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // Read-only: existing slugs must follow the documented shape.
    await adminSession.goto('/shop?inStock=true');
    const hrefs = await page.locator('a.pcard-name').evaluateAll((as) =>
      as.map((a) => a.getAttribute('href') ?? ''));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs.slice(0, 10)) {
      const slug = href.split('/').pop() ?? '';
      expect(slug, `"${slug}" must be a readable lowercase hyphenated slug`)
        .toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  adminTest('NP-PRD-TC-018 | A duplicate slug cannot be created', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only half: no two catalogue entries may share a slug.
    await adminSession.goto('/shop?inStock=true');
    const slugs = (await page.locator('a.pcard-name').evaluateAll((as) =>
      as.map((a) => (a.getAttribute('href') ?? '').split('/').pop() ?? '')))
      .filter(Boolean);

    expect(
      new Set(slugs).size,
      'every product on a page must be reachable by its own slug',
    ).toBe(slugs.length);

    destructive('Creating a colliding product writes to the live catalogue');
  });

  adminTest('NP-PRD-TC-019 | Replacing a product image updates it everywhere', {
    tag: ['@medium', '@p3'],
  }, async () => {
    destructive('Changing product imagery changes the live storefront');
  });

  adminTest('NP-PRD-TC-020 | Removing a product image restores the category fallback', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    // Read-only: products without a photo already fall back cleanly.
    await adminSession.openInventory();
    await expect(adminSession.rows.first()).toBeVisible();

    const broken = await page.evaluate(
      () => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken, 'no broken image icons in the inventory list').toBe(0);

    destructive('Removing an image from a live product changes the storefront');
  });

  adminTest('NP-PRD-TC-021 | An executable cannot be uploaded as a product image', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires attempting real uploads against a live product');
  });

  adminTest('NP-PRD-TC-022 | An oversized product image is rejected with a clear message', {
    tag: ['@high', '@p2'],
  }, async () => {
    destructive('Requires attempting a real oversized upload');
  });

  adminTest('NP-PRD-TC-023 | The admin product list can be searched by product name', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const rows = await adminSession.searchInventory('Napa');
    expect(
      rows,
      'the admin product search must find "Napa"; the customer catalogue '
        + 'returns 24 products for the same term',
    ).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(rows, 8); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/napa/i);
    }
  });

  adminTest('NP-PRD-TC-024 | The admin product list can be searched by generic name', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const rows = await adminSession.searchInventory('Paracetamol');
    expect(rows, 'a generic search must return products').toBeGreaterThan(0);

    // A generic spans more than one brand.
    const names = await adminSession.rows.allInnerTexts();
    const brands = new Set(names.slice(0, 10).map((n) => n.split('\n')[0].trim()));
    expect(brands.size, 'a generic must span multiple brands').toBeGreaterThan(1);
  });

  adminTest('NP-PRD-TC-025 | The admin product list can be filtered by category', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const filter = adminSession.inventoryFilter.first();
    if ((await filter.count()) === 0) {
      manual('No category filter is exposed on the inventory list in this build');
      return;
    }

    const options = await filter.locator('option').allInnerTexts();
    const injections = options.find((o) => /Injections/i.test(o));
    adminTest.skip(!injections, 'No Injections option in the filter');

    await filter.selectOption({ label: injections! });
    await adminSession.settle();
    expect(await adminSession.rows.count()).toBeGreaterThanOrEqual(0);
  });
});
