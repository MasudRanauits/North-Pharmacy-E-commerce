import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly mobileInput: Locator;
  readonly passwordInput: Locator;
  readonly showPasswordToggle: Locator;
  readonly rememberMe: Locator;
  readonly signInButton: Locator;
  readonly createAccountLink: Locator;
  readonly forgotPasswordLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.mobileInput = page.locator('input[placeholder="01XXXXXXXXX"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.showPasswordToggle = page.getByRole('button', { name: /Show password|Hide password/ });
    // "Keep me signed in" is TICKED by default on this build, so set the state
    // explicitly rather than clicking, which would toggle it the wrong way.
    this.rememberMe = page.locator('label:has-text("Keep me signed in") input[type="checkbox"]');
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.createAccountLink = page.getByRole('link', { name: /Create an account/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /Forgot your password/i });
    this.errorMessage = page.locator('.field-error, .form-error, [role="alert"], .error');
  }

  async open() {
    await this.goto('/login');

    // The form hydrates after the shell, and a second browser context on a
    // busy machine occasionally never finishes the first attempt. Reload once
    // before giving up, and report what was on screen if it still fails.
    try {
      await this.mobileInput.waitFor({ state: 'visible', timeout: 20_000 });
      return;
    } catch {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.settle();
    }

    try {
      await this.mobileInput.waitFor({ state: 'visible', timeout: 20_000 });
    } catch {
      const seen = (await this.page.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 200);
      throw new Error(
        `The sign-in form never rendered at ${this.page.url()}. On screen: "${seen}"`,
      );
    }
  }

  /**
   * @param rememberMe `undefined` leaves the control as the build ships it
   *                   (ticked); pass true/false to set it explicitly.
   */
  async login(mobile: string, password: string, rememberMe?: boolean) {
    await this.mobileInput.fill(mobile);
    await this.passwordInput.fill(password);
    if (rememberMe !== undefined && (await this.rememberMe.count())) {
      await this.rememberMe.setChecked(rememberMe);
    }
    await this.signInButton.click();
  }

  /** Whether "Keep me signed in" is currently ticked. */
  async isRememberMeChecked(): Promise<boolean> {
    if ((await this.rememberMe.count()) === 0) return false;
    return this.rememberMe.isChecked();
  }

  /** Log in and wait until the header shows the signed-in state. */
  async loginAndWait(mobile: string, password: string, rememberMe?: boolean) {
    await this.login(mobile, password, rememberMe);
    try {
      await expect(this.accountLink).toBeVisible({ timeout: 20_000 });
      return;
    } catch {
      // A burst of sign-ins in one file can trip the brute-force throttle that
      // NP-LOG-TC-010 asserts. Pause and try once more before failing, so a
      // throttle does not masquerade as a broken login.
      await this.page.waitForTimeout(5_000);
    }

    // Check whether that first attempt actually worked before retrying it.
    // The header lives on the storefront shell, so a sign-in that lands
    // somewhere without it — or simply paints slowly — looks like a failure
    // here. Re-opening /login in that state is a dead end: the build redirects
    // a visitor who already has a session, so the form never appears and the
    // retry reports "the sign-in form never rendered at /admin" against a
    // login that had in fact succeeded.
    await this.goto('/');
    if (await this.isLoggedIn()) return;

    await this.open();
    await this.login(mobile, password, rememberMe);
    await expect(this.accountLink).toBeVisible({ timeout: 20_000 });
  }
}
