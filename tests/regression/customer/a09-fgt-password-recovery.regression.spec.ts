/**
 * A9. PASSWORD RECOVERY - 8 cases (NP-FGT-TC-001 ... 008)
 *
 * STATE OF THIS BUILD: online reset is switched off. The page says
 * "Online reset isn't available right now. Please call our hotline and we'll
 * help you reset your password." and the Send code button is permanently
 * disabled, so no code can be issued.
 *
 * The cases below therefore verify the one thing that IS testable — that the
 * unavailability is communicated clearly and nothing can be submitted — and
 * mark the rest Blocked with that reason, which is the status NP-QA-TC-001
 * section 7.2 defines for "a defect elsewhere prevents execution".
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { users, storeRules } from '../../../data/testData';
import { manual, blocked } from '../../../utils/helpers';

/** True when the build is advertising that online reset is unavailable. */
async function resetIsOffline(page: import('@playwright/test').Page): Promise<boolean> {
  // Wait for the form to finish rendering before reading the notice, which
  // paints a moment after the shell.
  await page
    .locator('form.auth-form')
    .getByRole('button', { name: /Send code|continue|next|reset/i })
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => { /* fall through and read whatever rendered */ });

  // Read the whole panel: the notice is split across child elements, so a
  // single getByText locator does not see the complete sentence.
  const panel = await page.locator('form.auth-form').innerText().catch(() => '');
  return /online reset is.{0,3}t available/i.test(panel)
    || /call our hotline/i.test(panel);
}

test.describe('A9 - Password Recovery', {
  tag: ['@regression', '@customer', '@fgt'],
}, () => {

  test.beforeEach(async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.forgotPasswordLink.click();
    await page.waitForLoadState('domcontentloaded');
    await loginPage.settle();
  });

  test('NP-FGT-TC-001 | Available recovery channels are listed correctly', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    await expect(page).toHaveURL(/forgot|reset|recover/i);
    await expect(page.getByRole('heading', { name: /Reset your password/i })).toBeVisible();

    const mobileField = page.locator('form.auth-form input[placeholder="01XXXXXXXXX"]');
    await expect(mobileField.first()).toBeVisible();

    if (await resetIsOffline(page)) {
      // Switched off: the customer must be told, and given the hotline.
      const body = await page.locator('.container.page').innerText();
      expect(body, 'the customer must be told why and what to do instead')
        .toMatch(/call our hotline/i);
      await expect(
        page.getByRole('button', { name: /Send code/i }),
        'nothing may be submittable while reset is unavailable',
      ).toBeDisabled();

      blocked(
        'Online password reset is switched off on this build — the page offers '
          + `the hotline (${storeRules.hotline}) instead and Send code is disabled`,
      );
      return;
    }

    await mobileField.first().fill(users.customer.mobile);
    const submit = page.locator('form.auth-form')
      .getByRole('button', { name: /continue|send|next|reset/i }).first();
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await page.waitForLoadState('domcontentloaded');

    const body = await page.locator('.container.page').innerText();
    expect(body, 'a channel must never show the full contact detail')
      .not.toContain(users.customer.mobile);
  });

  test('NP-FGT-TC-003 | An unregistered number produces a non-enumerating response', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      // With reset off there is no response that could leak account existence,
      // which is the outcome this case protects.
      await expect(page.getByRole('button', { name: /Send code/i })).toBeDisabled();
      blocked('Online password reset is switched off, so no code can be requested');
      return;
    }

    const mobileField = page.locator('form.auth-form input[placeholder="01XXXXXXXXX"]');
    await mobileField.first().fill(users.unregistered.mobile);
    const submit = page.locator('form.auth-form')
      .getByRole('button', { name: /continue|send|next|reset/i }).first();
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await page.waitForLoadState('domcontentloaded');

    const body = await page.locator('.container.page').innerText();
    expect(
      body,
      'the response must not confirm or deny that the account exists',
    ).not.toMatch(/not registered|no account|does not exist|unknown number/i);
  });

  test('NP-FGT-TC-008 | Resend requests are throttled', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so there is nothing to resend');
      return;
    }

    const mobileField = page.locator('form.auth-form input[placeholder="01XXXXXXXXX"]');
    await mobileField.first().fill(users.customer.mobile);
    const submit = page.locator('form.auth-form')
      .getByRole('button', { name: /continue|send|next|reset/i }).first();
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await page.waitForLoadState('domcontentloaded');

    const resend = page.getByRole('button', { name: /resend/i }).first();
    test.skip((await resend.count()) === 0, 'No resend control on this step');

    await resend.click();
    await page.waitForTimeout(500);

    const disabled = await resend.isDisabled().catch(() => false);
    const body = await page.locator('.container.page').innerText();
    const cooldown = /wait|seconds|try again/i.test(body);

    expect(
      disabled || cooldown,
      'resend must be disabled for a cooldown or rate limited',
    ).toBeTruthy();
  });

  test('NP-FGT-TC-002 | A reset code is sent to the selected channel', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so no code is dispatched');
      return;
    }
    manual('Reading the SMS or email that carries the reset code needs a person');
  });

  test('NP-FGT-TC-004 | An incorrect reset code is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so no code can be entered');
      return;
    }
    manual('Requires a real code to have been issued to the channel first');
  });

  test('NP-FGT-TC-005 | A reset code expires and cannot be reused', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so no code can be reused');
      return;
    }
    manual('Requires completing a real reset, which changes the shared QA password');
  });

  test('NP-FGT-TC-006 | The new password honours the password policy', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so the reset step is unreachable');
      return;
    }
    manual('Reachable only after entering a valid code from the SMS or email channel');
  });

  test('NP-FGT-TC-007 | Login succeeds with the new password and fails with the old', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    if (await resetIsOffline(page)) {
      blocked('Online password reset is switched off, so no password can be reset');
      return;
    }
    manual(
      'Changes the shared QA account password; run by hand on a disposable '
        + 'account, then confirm old sessions are invalidated',
    );
  });
});
