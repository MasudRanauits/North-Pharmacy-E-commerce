import { Page, Locator, expect } from '@playwright/test';

/**
 * Behaviour shared by every page object: the site chrome (top bar, header,
 * navbar, footer) is identical on every customer page, so it lives here.
 */
export class BasePage {
  readonly page: Page;

  // --- top bar ---
  readonly topBar: Locator;

  // --- header ---
  readonly header: Locator;
  readonly brandLink: Locator;
  readonly searchBox: Locator;
  readonly searchButton: Locator;
  readonly searchSuggestions: Locator;
  readonly loginLink: Locator;
  readonly accountLink: Locator;
  readonly wishlistLink: Locator;
  readonly cartLink: Locator;

  // --- navbar / category panel ---
  readonly allCategoriesButton: Locator;
  readonly categoryPanel: Locator;
  readonly categoryPanelClose: Locator;
  readonly browseAllProductsLink: Locator;
  readonly navLinks: Locator;

  // --- footer ---
  readonly footer: Locator;
  readonly newsletterInput: Locator;
  readonly newsletterSubmit: Locator;
  readonly newsletterResult: Locator;

  readonly toasts: Locator;

  constructor(page: Page) {
    this.page = page;

    this.topBar = page.locator('.topbar');

    this.header = page.locator('header.header');
    this.brandLink = page.locator('a.brand');
    this.searchBox = page.locator('input[aria-label="Search products"]');
    this.searchButton = page.locator('button.search-btn');
    this.searchSuggestions = page.locator('#search-list');
    this.loginLink = page.locator('a.hdr-action[href="/login"]');
    this.accountLink = page.locator('.hdr-actions').getByText(/^Hi,/);
    this.wishlistLink = page.locator('a.hdr-action[href="/account/wishlist"]');
    this.cartLink = page.locator('a.hdr-action[href="/cart"]');

    this.allCategoriesButton = page.locator('button.allcats-btn');
    this.categoryPanel = page.locator('.allcats-panel, .allcats [role="menu"], .allcats-dropdown');
    this.categoryPanelClose = page.locator('.allcats').getByRole('button', { name: /close/i });
    this.browseAllProductsLink = page.getByRole('link', { name: 'Browse all products' }).first();
    this.navLinks = page.locator('.navlinks a');

    this.footer = page.locator('footer');
    this.newsletterInput = page.getByRole('textbox', { name: 'Email address' });
    this.newsletterSubmit = page.getByRole('button', { name: 'Subscribe' });
    this.newsletterResult = page.locator('#newsletter-result');

    this.toasts = page.locator('.toasts');
  }

  async goto(path: string = '/') {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.settle();
  }

  /** The app is a SPA — give hydration a moment before asserting. */
  async settle() {
    await this.page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => { /* long-polling pages never go idle; carry on */ });
  }

  async search(term: string) {
    await this.searchBox.fill(term);
    await this.searchBox.press('Enter');
    await this.settle();
  }

  async typeInSearch(term: string) {
    await this.searchBox.click();
    await this.searchBox.pressSequentially(term, { delay: 80 });
  }

  async openAllCategories() {
    await this.allCategoriesButton.click();
    await expect(this.categoryLink(/Tablets & Capsules/)).toBeVisible();
  }

  /** A link inside the All Categories panel. */
  categoryLink(name: string | RegExp): Locator {
    return this.page.locator('.allcats').getByRole('link', { name });
  }

  async openCart() {
    await this.cartLink.click();
    await this.settle();
  }

  /** Number shown on the cart icon, parsed from its aria-label. */
  async cartCount(): Promise<number> {
    const label = (await this.cartLink.getAttribute('aria-label')) ?? '';
    return Number(label.match(/(\d+)/)?.[1] ?? 0);
  }

  async isLoggedIn(): Promise<boolean> {
    return (await this.accountLink.count()) > 0;
  }

  /**
   * True when the gateway error document was served instead of the app.
   * Matching bare "502" in body text gives false positives on phone numbers
   * and counts, so this looks for the IIS error document itself.
   */
  async isServerError(): Promise<boolean> {
    return (
      (await this.page.locator('#header h1', { hasText: 'Server Error' }).count()) > 0
      || (await this.page.getByRole('heading', { name: /^50\d - / }).count()) > 0
    );
  }

  /**
   * Accept the next native confirm box.
   *
   * Destructive actions here use `window.confirm` ("Remove this address?"),
   * and Playwright dismisses dialogs by default — which silently cancels the
   * action. Call this immediately before the click that triggers one.
   */
  acceptNextConfirm() {
    this.page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
  }

  /** Dismiss the next native confirm box, to prove an action is cancellable. */
  dismissNextConfirm() {
    this.page.once('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  }

  /** Text of the most recent toast notification. */
  async toastText(): Promise<string> {
    return (await this.toasts.innerText().catch(() => '')).trim();
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }
}
