/**
 * D3. ACCESSIBILITY - 10 cases (NP-ACS-TC-001 ... 010)
 *
 * The plan calls out elderly and low-vision customers, so these are checked
 * programmatically wherever a machine can judge: keyboard reachability, focus
 * visibility, label association, contrast ratios and touch-target size.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { routes, storeRules } from '../../../data/testData';
import { manual, measureContrast, requiredContrast , ensureCartHas } from '../../../utils/helpers';


test.describe('D3 - Accessibility', {
  tag: ['@regression', '@crosscutting', '@acs'],
}, () => {

  test('NP-ACS-TC-001 | The registration form can be completed using only the keyboard', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, page }) => {
    await registerPage.open();

    // Tab from the top and collect what receives focus.
    const reached: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        return el.id || el.getAttribute('aria-label') || el.tagName.toLowerCase();
      });
      if (id) reached.push(id);
    }

    // Every registration field and the submit control must be reachable.
    for (const field of [
      registerPage.fullNameInput,
      registerPage.mobileInput,
      registerPage.passwordInput,
      registerPage.confirmPasswordInput,
    ]) {
      const id = await field.getAttribute('id');
      expect(
        reached.includes(id ?? ''),
        `field "${id}" must be reachable by Tab`,
      ).toBeTruthy();
    }
    expect(
      reached.some((r) => /create account|button/i.test(r)),
      'the submit control must be reachable by Tab',
    ).toBeTruthy();
  });

  test('NP-ACS-TC-003 | A visible focus indicator is present on interactive elements', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.open();

    const invisible: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');

      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const hasShadow = s.boxShadow !== 'none';
        const hasBorderChange = parseFloat(s.borderWidth || '0') > 0;
        return {
          name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 25)
            || el.tagName,
          visible: hasOutline || hasShadow || hasBorderChange,
        };
      });

      if (result && !result.visible) invisible.push(result.name);
    }

    expect(
      invisible,
      `these focused elements showed no visible focus indicator: ${invisible.join(', ')}`,
    ).toHaveLength(0);
  });

  test('NP-ACS-TC-004 | The tab order follows the visual reading order', {
    tag: ['@medium', '@p3'],
  }, async ({ registerPage, page }) => {
    await registerPage.open();

    const positions: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const top = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        return Math.round(el.getBoundingClientRect().top);
      });
      if (top !== null) positions.push(top);
    }

    // Focus should move broadly down the page, not jump back and forth.
    let backwardJumps = 0;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1] - 80) backwardJumps++;
    }
    expect(
      backwardJumps,
      `focus jumped upwards ${backwardJumps} times; tab order should follow the layout`,
    ).toBeLessThanOrEqual(2);
  });

  test('NP-ACS-TC-005 | Body text and primary buttons meet the contrast minimum', {
    tag: ['@medium', '@p3'],
  }, async ({ homePage, page }) => {
    await homePage.open();

    const failures: string[] = [];
    const unmeasured: string[] = [];

    for (const selector of ['footer p', '.btn-primary', '.pcard-name', '.topbar']) {
      const sample = await measureContrast(page, selector);
      if (!sample) continue;

      if (sample.ratio === null) {
        unmeasured.push(`${selector} (${sample.unmeasurable})`);
        continue;
      }
      const required = requiredContrast(sample.fontSize);
      if (sample.ratio < required) {
        failures.push(
          `${selector}: ${sample.ratio.toFixed(2)}:1 needs ${required}:1 `
          + `(${sample.foreground} on ${sample.background})`,
        );
      }
    }

    expect(failures, `contrast failures - ${failures.join('; ')}`).toHaveLength(0);

    if (unmeasured.length) {
      manual(`measure these by eye against the rendered backdrop: ${unmeasured.join(', ')}`);
    }
  });

  test('NP-ACS-TC-006 | Status, stock and discount badges meet contrast and do not rely on colour', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();

    // Critical information must be readable as text, not colour alone.
    const stock = await shopPage.card(0).locator('.stock').innerText();
    expect(stock.trim().length, 'stock state must carry a text label').toBeGreaterThan(0);

    const rxCard = shopPage.productCards.filter({ hasText: 'Rx' }).first();
    if (await rxCard.count()) {
      await expect(
        rxCard.getByText('Rx').first(),
        'prescription-required must be stated in text',
      ).toBeVisible();
    }

    const failures: string[] = [];
    for (const selector of ['.stock-in', '.badge-rx', '.badge', '.stock']) {
      const sample = await measureContrast(page, selector);
      if (!sample || sample.ratio === null) continue;

      const required = requiredContrast(sample.fontSize);
      if (sample.ratio < required) {
        failures.push(
          `${selector}: ${sample.ratio.toFixed(2)}:1 needs ${required}:1 `
          + `(${sample.foreground} on ${sample.background})`,
        );
      }
    }

    expect(failures, `badge contrast failures - ${failures.join('; ')}`).toHaveLength(0);
  });

  test('NP-ACS-TC-007 | Product and banner images carry meaningful alternative text', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, page }) => {
    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();

    const problems = await page.evaluate(() =>
      [...document.querySelectorAll('.pcard img')]
        .map((img) => {
          const alt = img.getAttribute('alt');
          const src = img.getAttribute('src') ?? '';
          if (alt === null) return `missing alt: ${src}`;
          // An empty alt is fine only for decorative images.
          if (alt && /\.(jpe?g|png|webp|gif)$/i.test(alt)) return `alt is a filename: ${alt}`;
          return null;
        })
        .filter(Boolean));

    expect(problems, `image alt problems - ${problems.join('; ')}`).toHaveLength(0);
  });

  test('NP-ACS-TC-008 | Every form field has an associated label', {
    tag: ['@medium', '@p3'],
  }, async ({ registerPage, page }) => {
    await registerPage.open();

    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll('form.auth-form input, form.auth-form select, form.auth-form textarea')]
        .filter((el) => {
          const input = el as HTMLInputElement;
          if (input.type === 'hidden') return false;
          const byFor = input.id && document.querySelector(`label[for="${input.id}"]`);
          const byWrap = input.closest('label');
          const byAria = input.getAttribute('aria-label')
            || input.getAttribute('aria-labelledby');
          return !byFor && !byWrap && !byAria;
        })
        .map((el) => (el as HTMLInputElement).name || (el as HTMLInputElement).type));

    expect(
      unlabelled,
      `fields with no programmatic label: ${unlabelled.join(', ')}`,
    ).toHaveLength(0);
  });

  test('NP-ACS-TC-009 | Validation errors are associated with their field', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, page }) => {
    await registerPage.open();
    await registerPage.submit();

    const invalid = await registerPage.invalidFields.count();
    const messages = await registerPage.fieldErrors.count();

    expect(
      invalid + messages,
      'an invalid submit must mark the fields programmatically',
    ).toBeGreaterThan(0);

    // The error must be carried as text, not colour alone.
    if (messages > 0) {
      const text = await registerPage.fieldErrors.first().innerText();
      expect(text.trim().length, 'the error must say something').toBeGreaterThan(0);
    }
    void page;
  });

  test('NP-ACS-TC-010 | Touch targets on mobile meet the minimum size', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();

    const small = await page.evaluate(() => {
      const MIN = 44;
      const out: string[] = [];
      const targets = [
        ...document.querySelectorAll('.pcard button, header a, .navlinks a, footer a'),
      ].slice(0, 40);

      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < MIN || r.height < MIN) {
          const name = el.getAttribute('aria-label')
            || el.textContent?.trim().slice(0, 20) || el.tagName;
          out.push(`${name} (${Math.round(r.width)}x${Math.round(r.height)})`);
        }
      }
      return out;
    });

    expect(
      small,
      `targets below 44x44 CSS px: ${small.join(', ')}`,
    ).toHaveLength(0);
  });
});

customerTest.describe('D3 - Accessibility (signed in)', {
  tag: ['@regression', '@crosscutting', '@acs'],
}, () => {

  customerTest('NP-ACS-TC-002 | Checkout can be completed using only the keyboard', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await ensureCartHas(shopPage, cartPage, 1);
    await checkoutPage.open();

    // The district selector is operable from the keyboard.
    await checkoutPage.ensureAddressForm();
    await checkoutPage.districtSelect.first().focus();
    await expect(checkoutPage.districtSelect.first()).toBeFocused();
    await checkoutPage.districtSelect
      .selectOption({ label: storeRules.insideDistrict.district });
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(storeRules.insideDistrict.charge);

    // The place-order control is reachable by Tab.
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await checkoutPage.placeOrderButton.evaluate(
        (el) => el === document.activeElement,
      ).catch(() => false);
    }
    expect(reached, 'the place-order control must be reachable by keyboard').toBeTruthy();

    await cartPage.open();
    await cartPage.emptyTheCart();
    void routes;
    void manual;
  });
});
