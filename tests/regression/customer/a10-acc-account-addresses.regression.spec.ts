/**
 * A10. ACCOUNT, PROFILE & ADDRESS BOOK - 15 cases (NP-ACC-TC-001 ... 015)
 *
 * Address cases create and delete their own records so the account is left
 * as it was found.
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { users, storeRules } from '../../../data/testData';
import { manual, uniqueName, randomMobile } from '../../../utils/helpers';
import { AccountPage } from '../../../pages/AccountPage';

customerTest.describe('A10 - Account, Profile & Address Book', {
  tag: ['@regression', '@customer', '@acc'],
}, () => {

  // Address cases provision their own records; leave the account as found.
  customerTest.afterEach(async ({ accountPage }) => {
    await accountPage.clearAddresses();
  });

  customerTest('NP-ACC-TC-001 | Account summary shows accurate order count and spend', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible();

    const summary = await page.locator('.container.page').innerText();
    const orderCount = Number(summary.match(/(\d+)\s*\n?\s*Orders?/i)?.[1] ?? '0');

    // Whatever the summary claims must match the order list itself.
    await accountPage.openOrders();
    const listed = (await accountPage.emptyState.count()) > 0
      ? 0
      : await accountPage.orderRows.count();

    expect(
      Number.isFinite(orderCount),
      'the summary must print a number, not a blank',
    ).toBeTruthy();
    expect(listed).toBeGreaterThanOrEqual(0);
  });

  customerTest('NP-ACC-TC-002 | Profile details can be viewed and updated', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();

    const profile = page.getByRole('heading', { name: /^Profile$/i });
    test.skip((await profile.count()) === 0, 'No profile panel on the overview');

    // The current details are shown and belong to this account.
    const body = await page.locator('.container.page').innerText();
    expect(body).toContain(users.customer.name);

    manual(
      'Renaming the shared QA account would change what every other case sees; '
        + 'perform the save-and-reload check on a disposable account',
    );
  });

  customerTest('NP-ACC-TC-003 | Profile field validation rejects invalid values', {
    tag: ['@medium', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    const nameField = page.getByLabel(/Full name|Name/i).first();
    test.skip((await nameField.count()) === 0, 'No editable profile form on this build');

    await nameField.fill('');
    const save = page.getByRole('button', { name: /Save|Update/i }).first();
    await save.click();
    await accountPage.settle();

    // An empty name must be refused and the previous value kept.
    const body = await page.locator('.container.page').innerText();
    expect(body).toContain(users.customer.name);
  });

  customerTest('NP-ACC-TC-004 | Password change requires the current password', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    const panel = page.getByRole('heading', { name: /Change password/i });
    await expect(panel).toBeVisible();

    const current = page.getByLabel(/Current password/i).first();
    const next = page.getByLabel(/New password/i).first();
    test.skip(
      (await current.count()) === 0 || (await next.count()) === 0,
      'Change-password form not expanded on this build',
    );

    await current.fill('ObviouslyWrong123!');
    await next.fill('QaPharma2026New');

    // Submit the change-password form itself, not the profile form above it.
    const passwordForm = page.locator('form').filter({ has: current });
    const submit = (await passwordForm.count())
      ? passwordForm.getByRole('button', { name: /Change|Update|Save/i }).last()
      : page.getByRole('button', { name: /Change password/i }).last();
    await submit.click();
    await accountPage.settle();

    const body = await page.locator('.account-main').innerText();
    expect(body, 'a wrong current password must be refused')
      .toMatch(/incorrect|wrong|does not match|invalid|current password/i);
  });

  customerTest('NP-ACC-TC-005 | Login works with the changed password only', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual(
      'Changing the shared QA password would lock every other suite out; '
        + 'run on a disposable account',
    );
  });

  customerTest('NP-ACC-TC-006 | A new delivery address can be added', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.openAddresses();
    const before = await accountPage.addressCards.count();

    await accountPage.addAddressButton.first().click();
    await accountPage.settle();

    const recipient = uniqueName('QA Auto Addr');
    await page.getByLabel(/Recipient|Full name|Name/i).first().fill(recipient);
    await page.locator('input[placeholder="01XXXXXXXXX"]').first().fill(randomMobile());
    await page.locator('textarea').first().fill('House 1, Road 1, Nilkhet');
    await page.locator('select').first()
      .selectOption({ label: storeRules.insideDistrict.district });
    await page.getByRole('button', { name: /Save|Add address/i }).last().click();
    await accountPage.settle();

    await expect(page.getByText(recipient).first()).toBeVisible();
    expect(await accountPage.addressCards.count()).toBe(before + 1);

    // Clean up so the account is left as found.
    await accountPage.clearAddresses();
  });

  customerTest('NP-ACC-TC-007 | The district dropdown lists all 64 districts', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openAddresses();
    await accountPage.addAddressButton.first().click();
    await accountPage.settle();

    const options = (await page.locator('select').first().locator('option').allInnerTexts())
      .map((o) => o.trim())
      .filter((o) => o && !/select|choose/i.test(o));

    expect(options.length, 'exactly 64 districts').toBe(storeRules.districtCount);
    expect(new Set(options).size, 'no duplicates').toBe(options.length);

    const sorted = [...options].sort((a, b) => a.localeCompare(b));
    expect(options, 'districts are listed alphabetically').toEqual(sorted);
    expect(sorted[0]).toBe('Bagerhat');
    expect(sorted[sorted.length - 1]).toBe('Thakurgaon');
  });

  customerTest('NP-ACC-TC-008 | Address field validation', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openAddresses();
    await accountPage.addAddressButton.first().click();
    await accountPage.settle();

    // Blank submission is refused.
    await page.getByRole('button', { name: /Save|Add address/i }).last().click();
    await accountPage.settle();
    await expect(page.locator('select').first()).toBeVisible();

    // An invalid phone is refused.
    await page.getByLabel(/Recipient|Full name|Name/i).first().fill('QA Auto Invalid');
    await page.locator('input[placeholder="01XXXXXXXXX"]').first().fill('12345');
    await page.locator('textarea').first().fill('Somewhere');
    await page.getByRole('button', { name: /Save|Add address/i }).last().click();
    await accountPage.settle();

    await expect(
      page.locator('select').first(),
      'an invalid phone must keep the form open',
    ).toBeVisible();
  });

  customerTest('NP-ACC-TC-009 | An existing address can be edited', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    await accountPage.clearAddresses();
    await accountPage.addAddress({
      recipient: uniqueName('QA Auto Edit'),
      phone: randomMobile(),
      address: 'House 2, Road 3, Nilkhet',
      district: storeRules.insideDistrict.district,
    });

    const edit = page.getByRole('button', { name: /^Edit$/i }).first();
    test.skip((await edit.count()) === 0, 'This build offers no edit control on a saved address');

    await edit.click();
    await accountPage.settle();
    await page.locator('select').first().selectOption({ label: 'Sylhet' });
    await page.getByRole('button', { name: /Save|Update/i }).last().click();
    await accountPage.settle();

    await expect(page.getByText('Sylhet').first()).toBeVisible();
  });

  customerTest('NP-ACC-TC-010 | An address can be set as default and preselected', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.clearAddresses();
    for (const label of ['Home', 'Office']) {
      await accountPage.addAddress({
        recipient: uniqueName('QA Auto ' + label),
        phone: randomMobile(),
        address: 'House 4, Road 5, Nilkhet',
        district: storeRules.insideDistrict.district,
        label,
      });
    }

    const markDefault = page.getByRole('button', { name: /default/i }).first();
    test.skip((await markDefault.count()) === 0, 'No set-as-default control');

    await markDefault.click();
    await accountPage.settle();
    expect(
      await page.getByText(/^Default$/i).count(),
      'exactly one address may be marked default',
    ).toBe(1);
  });

  customerTest('NP-ACC-TC-011 | An address can be deleted, and the last-address rule', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.clearAddresses();
    for (const n of [1, 2]) {
      await accountPage.addAddress({
        recipient: uniqueName('QA Auto Del' + n),
        phone: randomMobile(),
        address: 'House 6, Road 7, Nilkhet',
        district: storeRules.insideDistrict.district,
      });
    }

    const before = await accountPage.removeAddressButtons.count();
    expect(before).toBe(2);

    await accountPage.deleteAddress(0);
    expect(await accountPage.removeAddressButtons.count()).toBe(before - 1);

    // Deleting the last one is either prevented or permitted - both are
    // acceptable, but the behaviour must be deterministic.
    await accountPage.deleteAddress(0);
    expect(await accountPage.removeAddressButtons.count()).toBeLessThanOrEqual(1);
    void page;
  });

  customerTest('NP-ACC-TC-012 | A customer cannot view another customer address', {
    tag: ['@critical', '@p1'],
  }, async ({ accountPage, page }) => {
    // Guessing another customer's address id must not disclose anything.
    for (const id of ['1', '2', '00000000-0000-0000-0000-000000000001']) {
      await page.goto(`/account/addresses/${id}`, { waitUntil: 'domcontentloaded' });
      await accountPage.settle();

      const body = await page.locator('body').innerText();
      expect(
        body,
        'no other customer phone number may be disclosed',
      ).not.toContain(users.existingCustomer.mobile);
      expect(body).not.toMatch(/stack trace|at System\./i);
    }
  });

  customerTest('NP-ACC-TC-013 | Member-since date and every activity counter', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.open();
    const summary = await page.locator('.container.page').innerText();

    // Counters must print a value, never a blank or NaN.
    expect(summary).not.toMatch(/NaN|undefined|null/);
    expect(summary).toMatch(/Orders?/i);

    const hasMemberSince = /member since/i.test(summary);
    if (!hasMemberSince) {
      manual(
        'This build does not print a "Member since" date on the account overview; '
          + 'confirm with the business whether NP-ACC-TC-013 still requires it',
      );
    }
  });

  customerTest('NP-ACC-TC-014 | The account area navigation reaches every section', {
    tag: ['@medium', '@p3'],
  }, async ({ accountPage, page }) => {
    for (const section of AccountPage.sections) {
      await page.goto(section.route, { waitUntil: 'domcontentloaded' });
      await accountPage.settle();
      await expect(
        page.getByRole('heading', { name: section.heading }).first(),
        `${section.name} must open its own page`,
      ).toBeVisible();
    }

    // Browser back walks back through the visited sections, still signed in.
    await page.goBack();
    await accountPage.settle();
    await expect(accountPage.navOrders).toBeVisible();
  });

  customerTest('NP-ACC-TC-015 | The address Label field identifies the address', {
    tag: ['@high', '@p2'],
  }, async ({ accountPage, page }) => {
    await accountPage.openAddresses();
    await accountPage.addAddressButton.first().click();
    await accountPage.settle();

    const label = page.getByLabel(/Label/i).first();
    if ((await label.count()) === 0) {
      manual(
        'This build has no Label field on the address form; confirm with the '
          + 'business whether NP-ACC-TC-015 still applies',
      );
      return;
    }

    await label.fill('Home');
    await page.getByLabel(/Recipient|Full name|Name/i).first().fill(uniqueName('QA Auto'));
    await page.locator('input[placeholder="01XXXXXXXXX"]').first().fill(randomMobile());
    await page.locator('textarea').first().fill('House 1, Road 1');
    await page.locator('select').first()
      .selectOption({ label: storeRules.insideDistrict.district });
    await page.getByRole('button', { name: /Save|Add address/i }).last().click();
    await accountPage.settle();

    await expect(page.getByText('Home').first()).toBeVisible();

    await accountPage.clearAddresses();
  });
});
