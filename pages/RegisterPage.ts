import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class RegisterPage extends BasePage {
  readonly form: Locator;
  readonly fullNameInput: Locator;
  readonly mobileInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly showPasswordToggle: Locator;
  readonly suggestPasswordButton: Locator;
  readonly createAccountButton: Locator;
  readonly signInLink: Locator;
  readonly passwordHint: Locator;
  readonly fieldErrors: Locator;
  readonly invalidFields: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('form.auth-form');

    // The inputs carry no `type` attribute, so address them by their label.
    this.fullNameInput = this.form.getByLabel('Full name');
    this.mobileInput = this.form.getByLabel('Mobile number');
    this.emailInput = this.form.getByLabel(/^Email/);
    this.passwordInput = this.form.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = this.form.getByLabel('Confirm password');

    this.showPasswordToggle = page.getByRole('button', { name: /Show password|Hide password/ });
    this.suggestPasswordButton = page.getByRole('button', { name: 'Suggest a strong password' });
    this.createAccountButton = page.getByRole('button', { name: 'Create account' });
    this.signInLink = this.form.getByRole('link', { name: /Sign in/i });
    this.passwordHint = page.getByText(/At least 8 characters/i);
    this.fieldErrors = page.locator('.field-error, .form-error, [role="alert"]');
    this.invalidFields = page.locator('[aria-invalid="true"]');
  }

  async open() {
    await this.goto('/register');
  }

  async register(data: {
    name: string;
    mobile: string;
    email?: string;
    password: string;
    confirm?: string;
  }) {
    await this.fullNameInput.fill(data.name);
    await this.mobileInput.fill(data.mobile);
    if (data.email !== undefined) await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.confirm ?? data.password);
    await this.createAccountButton.click();
  }

  /** Submit without waiting for success — used by the validation cases. */
  async submit() {
    await this.createAccountButton.click();
    await this.settle();
  }
}
