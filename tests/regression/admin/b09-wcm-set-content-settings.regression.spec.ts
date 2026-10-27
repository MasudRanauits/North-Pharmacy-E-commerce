/**
 * B9. CONTENT MANAGEMENT & STORE SETTINGS - 30 cases
 * NP-WCM-TC-001 ... 007 and NP-SET-TC-001 ... 023
 *
 * Store settings drive delivery charges, the free-delivery threshold, the
 * per-item cap and the payment methods for every customer, so every save is
 * marked destructive and runs against UAT. What the settings currently hold,
 * and how those values surface on the storefront, is asserted for real.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { storeRules, routes } from '../../../data/testData';
import { manual, destructive, blocked, ensureCartHas } from '../../../utils/helpers';
import { SettingsPage } from '../../../pages/SettingsPage';

/** The delivery card every charge and cap case edits. */
const CARD = 'Delivery & ordering';
/** The other two settings cards these cases edit. */
const PAY = 'Payment methods';
const SOCIAL = 'Social links';

/**
 * Switch a wallet on in settings, prove it reaches the customer's payment
 * choices, and switch it back off again.
 *
 * NP-SET-TC-018 and 019 are the same journey for bKash and Nagad, and both
 * leave the live payment configuration changed in between, so the restore is
 * in a finally and runs whatever the assertions do.
 */
async function expectWalletReachesCheckout(
  settings: SettingsPage,
  name: 'bKash' | 'Nagad',
  walletNumber: string,
  ctx: {
    shopPage: import('../../../pages/ShopPage').ShopPage;
    cartPage: import('../../../pages/CartPage').CartPage;
    checkoutPage: import('../../../pages/CheckoutPage').CheckoutPage;
    page: import('@playwright/test').Page;
  },
) {
  const { shopPage, cartPage, checkoutPage, page } = ctx;
  // The settings card holds both "bKash" and "bKash number", so the toggle
  // has to be anchored. Checkout labels the choice in its own words, so match
  // the name anywhere there.
  const wallet = new RegExp(`^${name}`);
  const numberLabel = `${name} number`;
  const option = page.getByText(new RegExp(name, 'i')).first();

  await settings.open();
  await settings.edit(PAY);
  const wasOn = await settings.toggleIsOn(PAY, wallet);
  const hadNumber = await settings.field(PAY, numberLabel).inputValue();
  await settings.cancel(PAY);

  try {
    await settings.edit(PAY);
    await settings.setToggle(PAY, wallet, true);
    await settings.field(PAY, numberLabel).fill(walletNumber);
    expect(
      await settings.save(PAY),
      'a wallet with a number must be accepted',
    ).toBeTruthy();

    await ensureCartHas(shopPage, cartPage, 1);
    await checkoutPage.open();
    await expect(
      option,
      'a payment method switched on in settings must be offered at checkout',
    ).toBeVisible();
  } finally {
    // Put the switch and the number back in one edit. Doing them in two
    // passes leaves the number stored against a switched-off wallet, because
    // the second pass sees an already-empty field and saves nothing.
    await settings.open();
    await settings.edit(PAY);
    await settings.setToggle(PAY, wallet, wasOn);
    await settings.field(PAY, numberLabel).fill(hadNumber);
    await settings.save(PAY);

    await cartPage.open();
    await cartPage.emptyTheCart();
  }

  // And it must disappear again once it is switched back off.
  if (!wasOn) {
    await ensureCartHas(shopPage, cartPage, 1);
    await checkoutPage.open();
    await expect(
      option,
      'a wallet switched back off must no longer be offered',
    ).toHaveCount(0);
    await cartPage.open();
    await cartPage.emptyTheCart();
  }
}

adminTest.describe('B9a - Website Content Management', {
  tag: ['@regression', '@admin', '@wcm'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openContent();
  });

  adminTest('NP-WCM-TC-001 | The home top bar message and tagline can be edited', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await expect(page.getByRole('heading', { name: /Website content/i }).first())
      .toBeVisible();
    expect(await adminSession.isServerError()).toBeFalsy();

    destructive('Editing the top bar changes the live home page for every visitor');
  });

  adminTest('NP-WCM-TC-002 | Placeholder tokens resolve to live settings values', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // The customer-facing half is fully checkable: no raw token may escape.
    await adminSession.goto(routes.home);
    const topBar = await page.locator('.topbar').innerText();

    expect(topBar, 'the token must be replaced by the configured value')
      .not.toMatch(/\{\{?\s*\w+\s*\}?\}/);
    expect(topBar).toContain('2,000');

    const body = await page.locator('body').innerText();
    expect(body, 'no unresolved placeholder anywhere on the home page')
      .not.toMatch(/\{freeDeliveryAbove\}|\{deliveryCharge\}|\{homeDistrict\}/);

    destructive('Changing the threshold to prove the token re-resolves');
  });

  adminTest('NP-WCM-TC-003 | Hero slides can be added, edited, reordered and removed', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // Read-only: the configured slides render with working controls.
    await adminSession.goto(routes.home);
    const dots = page.locator('button.hero-dot');
    expect(await dots.count(), 'hero slides must be configured').toBeGreaterThan(0);

    destructive('Adding, reordering or deleting slides changes the live home page');
  });

  adminTest('NP-WCM-TC-004 | Static pages can be created and edited with rich text', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    // Read-only: the existing pages render their formatting cleanly.
    for (const route of [routes.terms, routes.privacy]) {
      await adminSession.goto(route);
      const body = await page.locator('.container.page').innerText();
      expect(body.trim().length, `${route} must have content`).toBeGreaterThan(40);
      expect(body, `${route} must not leak raw markup`).not.toMatch(/<\/?(p|div|h[1-6])>/i);
    }

    destructive('Creating or editing a page changes the live site');
  });

  adminTest('NP-WCM-TC-005 | FAQs can be created, edited, reordered and deleted', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(routes.help);
    expect(await adminSession.isServerError()).toBeFalsy();
    const body = await page.locator('.container.page').innerText();
    expect(body.trim().length).toBeGreaterThan(40);

    destructive('Editing FAQs changes the live help page');
  });

  adminTest('NP-WCM-TC-006 | The image library supports upload, replacement and deletion', {
    tag: ['@medium', '@p3'],
  }, async ({ page }) => {
    // Record what the build actually offers before declaring the case blocked.
    const upload = page.locator('input[type="file"]');
    expect(await upload.count(), 'the content editor exposes one picture input').toBe(1);
    await expect(
      upload,
      'the upload is restricted to image types',
    ).toHaveAttribute('accept', /image\/(jpeg|png|webp)/);

    const around = await upload.evaluate(
      (el) => (el.closest('div,section,label') as HTMLElement | null)?.innerText ?? '',
    );
    expect(around, 'the only upload is the per-slide picture').toMatch(/Own picture/i);

    blocked(
      'No image library exists in this build. The only upload is the per-slide '
      + '"Own picture" replacement on the Home page tab — there is no library '
      + 'listing to upload into and no delete control, so replacement and '
      + 'deletion cannot be exercised.',
    );
  });

  adminTest('NP-WCM-TC-007 | Unsaved content changes are protected', {
    tag: ['@low', '@p3'],
  }, async ({ adminSession, page }) => {
    const save = page.getByRole('button', { name: 'Save changes' }).first();
    const discard = page.getByRole('button', { name: 'Discard changes' }).first();

    // Nothing edited yet, so there is nothing to save or throw away.
    await expect(save, 'Save is inert until something changes').toBeDisabled();
    await expect(discard, 'Discard is inert until something changes').toBeDisabled();

    // The content fields carry no explicit type attribute, so match on the
    // element rather than on input[type=text].
    const firstField = page.locator('.adm-main input').nth(1);
    const original = await firstField.inputValue();

    await firstField.fill(`${original} QA-EDIT`);
    await expect(save, 'an edit must arm Save').toBeEnabled();
    await expect(discard, 'an edit must arm Discard').toBeEnabled();

    // Leaving with work in hand must be challenged rather than silently lost.
    // A beforeunload guard shows a dialog and, once it is dismissed, the
    // navigation itself is aborted — so either signal means the edit was
    // protected.
    let warned = false;
    page.once('dialog', (d) => { warned = true; d.dismiss().catch(() => {}); });
    const navigated = await adminSession.goto(routes.home)
      .then(() => true)
      .catch(() => false);
    const leftWithoutWarning = navigated && !warned;

    // Put the content back the way it was found. A blocked navigation leaves
    // us on the editor already; going back there again would just hit the
    // same guard, so only return when the move actually happened.
    if (navigated) await adminSession.openContent();
    if (await discard.isEnabled().catch(() => false)) {
      await discard.click();
      await adminSession.settle();
    }

    expect(
      leftWithoutWarning,
      'navigating away with unsaved content changes must warn, or keep the edit',
    ).toBeFalsy();

    await expect(page.locator('.adm-main input').nth(1)).toHaveValue(original);
  });
});

adminTest.describe('B9b - Store Settings', {
  tag: ['@regression', '@admin', '@set'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openSettings();
  });

  adminTest('NP-SET-TC-001 | Store details save and appear across the customer site', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const settings = await page.locator('.adm-main').innerText();

    expect(settings).toContain('North Pharmacy');
    expect(settings).toContain(storeRules.hotline);
    expect(settings).toContain('Mohammadpur');

    // The same values must appear on the storefront.
    await adminSession.goto(routes.home);
    const footer = await page.locator('footer').innerText();
    expect(footer).toContain(storeRules.hotline);
    expect(footer).toContain('Mohammadpur');

    destructive('Changing store details rewrites the live site header and footer');
  });

  adminTest('NP-SET-TC-023 | The settings version, editor and timestamp update on save', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    const settings = await page.locator('.adm-main').innerText();

    // The audit line must name who last changed each group and when.
    expect(
      settings,
      'each settings group must carry an audit line',
    ).toMatch(/Last changed by .+|Default setup/i);
    expect(settings).toMatch(/\d{1,2}\s\w{3}\s\d{4}|Default setup/i);

    destructive('Proving the version increments requires saving a real change');
  });

  // --- Delivery and ordering: the configured values must match section 2.6 ---
  adminTest('NP-SET-TC-002 | The inside-district delivery charge takes effect at checkout', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = await page.locator('.adm-main').innerText();
    expect(settings).toContain(`৳${storeRules.insideDistrict.charge}`);

    destructive('Changing the inside charge changes what every customer pays');
  });

  adminTest('NP-SET-TC-003 | The outside-district delivery charge change takes effect', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = await page.locator('.adm-main').innerText();
    expect(settings).toContain(`৳${storeRules.outsideCharge}`);

    destructive('Changing the outside charge changes what every customer pays');
  });

  adminTest('NP-SET-TC-004 | The free delivery threshold change takes effect', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = await page.locator('.adm-main').innerText();
    expect(settings).toContain('৳2,000');

    destructive('Changing the threshold changes every delivery charge decision');
  });

  adminTest('NP-SET-TC-005 | The maximum quantity per item setting is enforced', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    const settings = await page.locator('.adm-main').innerText();
    expect(settings).toContain(String(storeRules.maxQtyPerItem));

    // The storefront stepper must honour the configured cap.
    await adminSession.goto('/shop?inStock=true');
    const card = page.locator('.pcard').first();
    const add = card.getByRole('button', { name: 'Add to Cart' });
    if (await add.count()) {
      await add.click();
      await adminSession.settle();
    }
    const qty = card.getByRole('spinbutton', { name: 'Quantity' });
    await expect(qty).toHaveAttribute('max', String(storeRules.maxQtyPerItem));

    const { CartPage } = await import('../../../pages/CartPage');
    const cart = new CartPage(page);
    await cart.open();
    await cart.emptyTheCart();
  });

  adminTest('NP-SET-TC-006 | Delivery settings reject invalid values', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const original = await settings.deliverySnapshot();
    let persisted = '';

    try {
      await settings.edit(CARD);
      // Each charge is money and the cap is a count: none may go below zero,
      // and the cap may not be blank either.
      for (const [label, bad] of [
        ['Delivery inside Dhaka', '-1'],
        ['Delivery outside Dhaka', '-1'],
        ['Free delivery from', '-1'],
        ['Maximum quantity per product', '0'],
      ] as const) {
        const input = settings.field(CARD, label);
        await input.fill(bad);
        expect(
          await SettingsPage.nativelyInvalid(input),
          `"${label}" must refuse ${bad} rather than accept it`,
        ).toBeTruthy();
      }

      await settings.save(CARD);
      // Read what was actually stored before putting the values back, so the
      // assertion is about the configuration and not about the form's mood.
      persisted = await settings.storedSummary(CARD);
    } finally {
      await settings.restoreDelivery(original);
    }

    // The build may refuse the submission outright or correct each field as it
    // loses focus — both are acceptable. What matters is that no invalid value
    // ever reaches the configuration that prices every order.
    expect(persisted, 'no delivery charge may be stored as a negative amount')
      .not.toMatch(/৳\s*-/);
    expect(persisted, 'the per-item cap may never be stored as zero')
      .not.toMatch(/Maximum quantity per product\s*\|?\s*0\b/);
  });

  adminTest('NP-SET-TC-015 | A negative delivery charge is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const original = await settings.deliverySnapshot();

    try {
      await settings.edit(CARD);
      const input = settings.field(CARD, 'Delivery inside Dhaka');
      await input.fill('-60');
      expect(
        await SettingsPage.nativelyInvalid(input),
        'a delivery charge of -60 must be refused',
      ).toBeTruthy();
      expect(await settings.save(CARD), '-60 must not reach the configuration').toBeFalsy();
    } finally {
      await settings.restoreDelivery(original);
    }

    expect(
      await settings.summary(CARD),
      'the inside-Dhaka charge must still be the configured value',
    ).toContain(`৳${original['Delivery inside Dhaka']}`);
  });

  adminTest('NP-SET-TC-016 | A non-numeric free delivery threshold is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const original = await settings.deliverySnapshot();
    let persisted = '';

    try {
      await settings.edit(CARD);
      const input = settings.field(CARD, 'Free delivery from');
      // fill() refuses to put text into a number input, so type the keys and
      // let the control do whatever it does with them.
      await input.click();
      await input.press('Control+a');
      await input.pressSequentially('abc', { delay: 30 });

      // A number input discards non-numeric keystrokes, so the field ends up
      // empty rather than holding "abc". Either way nothing numeric was
      // entered and the stored threshold must not change.
      expect(
        await input.inputValue(),
        'the threshold field must not hold text',
      ).not.toContain('abc');

      await settings.save(CARD);
      persisted = await settings.storedSummary(CARD);
    } finally {
      await settings.restoreDelivery(original);
    }

    expect(
      persisted,
      'the free-delivery threshold must survive a text submission',
    ).toContain(Number(original['Free delivery from']).toLocaleString('en-US'));
  });

  adminTest('NP-SET-TC-017 | A maximum quantity per item of zero is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const original = await settings.deliverySnapshot();

    try {
      await settings.edit(CARD);
      const input = settings.field(CARD, 'Maximum quantity per product');
      // A cap of zero would make every product on the site unbuyable.
      await input.fill('0');
      expect(
        await SettingsPage.nativelyInvalid(input),
        'a per-item cap of 0 must be refused',
      ).toBeTruthy();
      expect(await settings.save(CARD), 'a cap of 0 must not be saved').toBeFalsy();
    } finally {
      await settings.restoreDelivery(original);
    }

    expect(
      await settings.summary(CARD),
      'the per-item cap must still be the configured value',
    ).toContain(original['Maximum quantity per product']);
  });

  // --- Payment methods ---
  adminTest('NP-SET-TC-007 | Enabling a wallet payment method makes it available', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    const settings = await page.locator('.adm-main').innerText();
    expect(settings, 'the payment settings group must be present')
      .toMatch(/Payment methods/i);
    expect(settings).toMatch(/Cash/i);

    destructive('Enabling a wallet changes how real customers can pay');
  });

  adminTest('NP-SET-TC-008 | A wallet number is mandatory when its method is enabled', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const before = await settings.summary(PAY);
    let stored = '';

    try {
      await settings.edit(PAY);
      // Turn bKash on but give it nowhere to send the money.
      await settings.setToggle(PAY, /^bKash/, true);
      await settings.field(PAY, 'bKash number').fill('');

      expect(
        await settings.save(PAY),
        'a wallet cannot be switched on without the number customers pay into',
      ).toBeFalsy();
      stored = await settings.storedSummary(PAY);
    } finally {
      await settings.restoreToggle(PAY, /^bKash/, false);
    }

    expect(stored, 'bKash must still be off after the refused save').toMatch(/bKash\s*Off/i);
    expect(
      await settings.storedSummary(PAY),
      'the payment configuration must be exactly as it was found',
    ).toEqual(before);
  });

  adminTest('NP-SET-TC-018 | Enabling bKash makes it selectable at checkout', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await expectWalletReachesCheckout(
      new SettingsPage(page), 'bKash', '01711000018',
      { shopPage, cartPage, checkoutPage, page },
    );
  });

  adminTest('NP-SET-TC-019 | Enabling Nagad makes it selectable at checkout', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await expectWalletReachesCheckout(
      new SettingsPage(page), 'Nagad', '01711000019',
      { shopPage, cartPage, checkoutPage, page },
    );
  });

  adminTest('NP-SET-TC-020 | Every payment method cannot be disabled at once', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only: at least one method is live right now, so checkout works.
    await adminSession.goto(routes.home);
    void page;

    destructive(
      'Attempting to disable every method risks leaving checkout impossible',
    );
  });

  // --- Store detail fields ---
  adminTest('NP-SET-TC-011 | A store name change appears in the customer site header', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(routes.home);
    await expect(page.locator('header.header .brand-name')).toContainText('North');
    await expect(page).toHaveTitle(/North Pharmacy/i);

    destructive('Renaming the store rewrites the live header and page title');
  });

  adminTest('NP-SET-TC-012 | A hotline change appears in the footer and contact page', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    for (const route of [routes.home, routes.contact]) {
      await adminSession.goto(route);
      const footer = await page.locator('footer').innerText();
      expect(footer, `${route} must carry the configured hotline`)
        .toContain(storeRules.hotline);
    }
    await expect(page.locator('a[href^="tel:"]').first()).toHaveAttribute('href', /tel:/);

    destructive('Changing the hotline rewrites it everywhere on the live site');
  });

  adminTest('NP-SET-TC-013 | An address change appears on the customer contact page', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(routes.contact);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Mohammadpur');
    expect(body, 'the address must not be truncated').toContain('Dhaka-1207');

    destructive('Changing the store address rewrites the live contact page');
  });

  adminTest('NP-SET-TC-014 | A store email change appears where the email is displayed', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    const settings = await page.locator('.adm-main').innerText();
    const emailConfigured = !/Email\s*\n?\s*Not set/i.test(settings);

    await adminSession.goto(routes.contact);
    const mailto = page.locator('a[href^="mailto:"]');

    if (emailConfigured) {
      await expect(mailto.first()).toBeVisible();
    } else {
      // An unset email must not render an empty or broken link.
      expect(
        await mailto.count(),
        'an unset store email must not produce a dead mailto link',
      ).toBe(0);
    }
  });

  // --- Social links ---
  adminTest('NP-SET-TC-009 | Social links save, validate and render in the footer', {
    tag: ['@low', '@p3'],
  }, async ({ adminSession, page }) => {
    await adminSession.goto(routes.home);
    const socials = page.locator('footer a[href^="http"]');

    // Whatever is configured must point somewhere real, never to an empty href.
    const count = await socials.count();
    for (let i = 0; i < count; i++) {
      const href = await socials.nth(i).getAttribute('href');
      expect(href, 'a social icon must not link to an empty destination')
        .toMatch(/^https?:\/\/.+\..+/);
    }

    destructive('Saving social URLs changes the live footer');
  });

  adminTest('NP-SET-TC-021 | An invalid social media URL is rejected', {
    tag: ['@medium', '@p3'],
  }, async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();
    const before = await settings.summary(SOCIAL);
    let stored = '';

    try {
      await settings.edit(SOCIAL);
      const facebook = settings.field(SOCIAL, /^Facebook/);
      await facebook.fill('not a url');

      expect(
        await SettingsPage.nativelyInvalid(facebook),
        '"not a url" must not be accepted as a social address',
      ).toBeTruthy();
      expect(await settings.save(SOCIAL), 'an invalid URL must not be stored').toBeFalsy();
      stored = await settings.storedSummary(SOCIAL);
    } finally {
      await settings.restoreField(SOCIAL, /^Facebook/, '');
    }

    expect(stored, 'the social card must be unchanged').not.toContain('not a url');
    expect(
      await settings.storedSummary(SOCIAL),
      'the social configuration must be exactly as it was found',
    ).toEqual(before);
  });

  adminTest('NP-SET-TC-022 | Clearing a social link removes its icon from the footer', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    const settings = new SettingsPage(page);
    const url = 'https://facebook.com/northpharmacyqa';
    const footerFacebook = page.locator('footer').getByRole('link', { name: /facebook/i });

    await settings.open();
    try {
      // Set one, so there is something to clear.
      await settings.edit(SOCIAL);
      await settings.field(SOCIAL, /^Facebook/).fill(url);
      expect(await settings.save(SOCIAL), 'a valid social URL must save').toBeTruthy();

      await adminSession.goto(routes.home);
      await expect(
        footerFacebook,
        'a configured social link must show its icon in the footer',
      ).toHaveCount(1);

      // Now clear it again.
      await settings.open();
      await settings.edit(SOCIAL);
      await settings.field(SOCIAL, /^Facebook/).fill('');
      expect(await settings.save(SOCIAL), 'clearing a social link must save').toBeTruthy();

      await adminSession.goto(routes.home);
      await expect(
        footerFacebook,
        'clearing the link must take its icon out of the footer',
      ).toHaveCount(0);
    } finally {
      await settings.open();
      await settings.restoreField(SOCIAL, /^Facebook/, '');
    }
  });

  adminTest('NP-SET-TC-010 | Concurrent settings edits are detected, not silently overwritten', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    // The version stamp that makes conflict detection possible must exist.
    const settings = await page.locator('.adm-main').innerText();
    if (!/Last changed by/i.test(settings)) {
      manual(
        'No audit line is shown for any settings group, so there is nothing to '
          + 'detect a concurrent edit with; raise with the business',
      );
      return;
    }
    expect(settings).toMatch(/Last changed by .+/i);

    destructive('Proving conflict detection requires two sessions saving settings');
  });
});
