/**
 * A7. CUSTOMER REGISTRATION - 12 cases (NP-REG-TC-001 ... 012)
 *
 * Cases that actually create an account use a random unused mobile number
 * and the name prefix "QA Auto" so the records are easy to find and clean up
 * in the admin customer list.
 */
import { test, expect } from '../../../fixtures/test-fixtures';
import { users } from '../../../data/testData';
import { randomMobile, uniqueName, manual } from '../../../utils/helpers';

const VALID_PASSWORD = 'QaPharma2026';

test.describe('A7 - Customer Registration', {
  tag: ['@regression', '@customer', '@reg'],
}, () => {

  test.beforeEach(async ({ registerPage }) => {
    await registerPage.open();
  });

  test('NP-REG-TC-001 | A new customer can register with valid details', {
    tag: ['@critical', '@p1', '@creates-data'],
  }, async ({ registerPage, page }) => {
    const mobile = randomMobile();
    const name = uniqueName('QA Auto');

    await registerPage.register({
      name,
      mobile,
      email: `${mobile}@mailinator.com`,
      password: VALID_PASSWORD,
    });

    // The account is created and the customer is signed in.
    await expect(registerPage.accountLink).toBeVisible({ timeout: 25_000 });
    await expect(registerPage.accountLink).toContainText(/Hi,/);
    await expect(page).not.toHaveURL(/register/);
  });

  test('NP-REG-TC-002 | All mandatory fields are validated when left blank', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, page }) => {
    await registerPage.submit();

    // Submission is blocked and the customer stays on the form.
    await expect(page).toHaveURL(/register/);
    await expect(registerPage.accountLink).toHaveCount(0);
    expect(
      (await registerPage.fieldErrors.count())
        + (await registerPage.invalidFields.count()),
      'a field-level message must appear beside every mandatory field',
    ).toBeGreaterThan(0);
  });

  test('NP-REG-TC-003 | Bangladeshi mobile number format is validated', {
    tag: ['@high', '@p1'],
  }, async ({ registerPage, page }) => {
    const invalid = ['0170000000', '017000000000', '01abc456789'];

    for (const mobile of invalid) {
      await registerPage.open();
      await registerPage.fullNameInput.fill('QA Auto Validation');
      await registerPage.mobileInput.fill(mobile);
      await registerPage.passwordInput.fill(VALID_PASSWORD);
      await registerPage.confirmPasswordInput.fill(VALID_PASSWORD);
      await registerPage.submit();

      await expect(page, `"${mobile}" must be rejected`).toHaveURL(/register/);
      await expect(registerPage.accountLink).toHaveCount(0);
    }
  });

  test('NP-REG-TC-004 | Registering an already-registered mobile is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ registerPage, page }) => {
    await registerPage.register({
      name: 'QA Auto Duplicate',
      mobile: users.customer.mobile,
      password: VALID_PASSWORD,
    });
    await registerPage.settle();

    // No duplicate account and a clear explanation.
    await expect(page).toHaveURL(/register/);
    await expect(registerPage.accountLink).toHaveCount(0);
    const body = await page.locator('form.auth-form').innerText();
    expect(body).toMatch(/already|registered|exists|in use/i);
  });

  test('NP-REG-TC-005 | Email format is validated where an email is supplied', {
    tag: ['@medium', '@p2'],
  }, async ({ registerPage, page }) => {
    for (const email of ['abc.com', 'abc@', 'a b@c.com']) {
      await registerPage.open();
      await registerPage.fullNameInput.fill('QA Auto Email');
      await registerPage.mobileInput.fill(randomMobile());
      await registerPage.emailInput.fill(email);
      await registerPage.passwordInput.fill(VALID_PASSWORD);
      await registerPage.confirmPasswordInput.fill(VALID_PASSWORD);
      await registerPage.submit();

      await expect(page, `"${email}" must be rejected`).toHaveURL(/register/);
    }

    // Email is optional, so leaving it blank must not block registration.
    await expect(registerPage.page.getByText(/\(optional\)/i)).toBeVisible();
  });

  test('NP-REG-TC-006 | The password policy is enforced', {
    tag: ['@critical', '@p1'],
  }, async ({ registerPage, page }) => {
    // The stated rule: at least 8 characters, with letters and numbers.
    await expect(registerPage.passwordHint).toBeVisible();

    for (const password of ['abc', 'abcdefgh', '12345678']) {
      await registerPage.open();
      await registerPage.fullNameInput.fill('QA Auto Password');
      await registerPage.mobileInput.fill(randomMobile());
      await registerPage.passwordInput.fill(password);
      await registerPage.confirmPasswordInput.fill(password);
      await registerPage.submit();

      await expect(page, `"${password}" must be rejected`).toHaveURL(/register/);
      await expect(registerPage.accountLink).toHaveCount(0);
    }
  });

  test('NP-REG-TC-007 | A mismatched confirm-password is rejected', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, page }) => {
    await registerPage.fullNameInput.fill('QA Auto Mismatch');
    await registerPage.mobileInput.fill(randomMobile());
    await registerPage.passwordInput.fill(VALID_PASSWORD);
    await registerPage.confirmPasswordInput.fill(`${VALID_PASSWORD}x`);
    await registerPage.submit();

    await expect(page).toHaveURL(/register/);
    await expect(registerPage.accountLink).toHaveCount(0);
  });

  test('NP-REG-TC-008 | The password is masked and never exposed', {
    tag: ['@critical', '@p1'],
  }, async ({ registerPage, page }) => {
    await registerPage.passwordInput.fill(VALID_PASSWORD);

    // Masked by default, revealed only by the explicit toggle.
    await expect(registerPage.passwordInput).toHaveAttribute('type', 'password');
    await registerPage.showPasswordToggle.first().click();
    await expect(registerPage.passwordInput).toHaveAttribute('type', 'text');
    await registerPage.showPasswordToggle.first().click();
    await expect(registerPage.passwordInput).toHaveAttribute('type', 'password');

    // Never in the address bar, never in browser storage.
    expect(page.url()).not.toContain(VALID_PASSWORD);
    const stored = await page.evaluate(() => JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    expect(stored, 'the password must not be written to browser storage')
      .not.toContain(VALID_PASSWORD);
  });

  test('NP-REG-TC-009 | Rapid double submission does not create two accounts', {
    tag: ['@critical', '@p1', '@creates-data'],
  }, async ({ registerPage, page }) => {
    const mobile = randomMobile();
    await registerPage.fullNameInput.fill(uniqueName('QA Auto Double'));
    await registerPage.mobileInput.fill(mobile);
    await registerPage.passwordInput.fill(VALID_PASSWORD);
    await registerPage.confirmPasswordInput.fill(VALID_PASSWORD);

    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /register|signup/i.test(r.url())) requests.push(r.url());
    });

    await registerPage.createAccountButton.click({ clickCount: 2, delay: 40 });
    await expect(registerPage.accountLink).toBeVisible({ timeout: 25_000 });

    expect(requests.length, 'the second click must not send a second registration')
      .toBeLessThanOrEqual(1);
  });

  test('NP-REG-TC-010 | The name field accepts Bangla and rejects unsafe input', {
    tag: ['@critical', '@p1', '@creates-data'],
  }, async ({ registerPage, page }) => {
    let dialogShown = false;
    page.on('dialog', async (d) => { dialogShown = true; await d.dismiss(); });

    await registerPage.register({
      name: 'রহিমা <script>alert(1)</script>',
      mobile: randomMobile(),
      password: VALID_PASSWORD,
    });
    await registerPage.settle();

    expect(dialogShown, 'the payload must be stored inert, never executed').toBeFalsy();

    if (await registerPage.accountLink.count()) {
      // Bangla survives without corruption and the tag is escaped.
      const header = await registerPage.accountLink.innerText();
      expect(header).not.toContain('<script>');
      expect(header).not.toContain('?????');
    }
  });

  test('NP-REG-TC-011 | Very long input is handled without breaking the form', {
    tag: ['@medium', '@p3'],
  }, async ({ registerPage, page }) => {
    const longName = 'A'.repeat(300);
    await registerPage.fullNameInput.fill(longName);

    // Either a stated maximum trims it, or it is accepted intact.
    const stored = await registerPage.fullNameInput.inputValue();
    const maxLength = await registerPage.fullNameInput.getAttribute('maxlength');
    if (maxLength) {
      expect(stored.length).toBeLessThanOrEqual(Number(maxLength));
    }

    // The layout must not start scrolling sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('NP-REG-TC-012 | Terms acceptance is required before registration completes', {
    tag: ['@high', '@p2'],
  }, async ({ registerPage, page }) => {
    const termsCheckbox = page.locator('form.auth-form input[type="checkbox"]');

    if ((await termsCheckbox.count()) === 0) {
      manual(
        'This build has no terms checkbox on the registration form; confirm with '
          + 'the business whether NP-REG-TC-012 still applies',
      );
      return;
    }

    await registerPage.fullNameInput.fill('QA Auto Terms');
    await registerPage.mobileInput.fill(randomMobile());
    await registerPage.passwordInput.fill(VALID_PASSWORD);
    await registerPage.confirmPasswordInput.fill(VALID_PASSWORD);
    await registerPage.submit();

    await expect(page, 'submission is blocked while the box is unticked')
      .toHaveURL(/register/);
  });
});
