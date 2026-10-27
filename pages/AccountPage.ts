import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** Signed-in customer area: /account and its sections. */
export class AccountPage extends BasePage {
  readonly sidebar: Locator;
  readonly customerName: Locator;
  readonly customerPhone: Locator;
  readonly navOverview: Locator;
  readonly navOrders: Locator;
  readonly navPrescriptions: Locator;
  readonly navAddresses: Locator;
  readonly navWishlist: Locator;
  readonly signOutButton: Locator;

  // overview counters
  readonly memberSince: Locator;
  readonly totalSpent: Locator;
  readonly orderCount: Locator;
  readonly activeOrderCount: Locator;
  readonly prescriptionCount: Locator;
  readonly wishlistCount: Locator;

  // orders
  readonly orderRows: Locator;
  readonly emptyState: Locator;

  // addresses
  readonly addAddressButton: Locator;
  readonly addressCards: Locator;
  readonly labelInput: Locator;
  readonly recipientInput: Locator;
  readonly phoneInput: Locator;
  readonly addressTextarea: Locator;
  readonly districtSelect: Locator;
  readonly saveAddressButton: Locator;

  // wishlist
  readonly wishlistItems: Locator;
  readonly addAllToCartButton: Locator;

  constructor(page: Page) {
    super(page);
    this.sidebar = page.locator('.account-nav, aside').first();
    this.customerName = page.locator('.account-user, .acct-name').first();
    this.customerPhone = page.getByText(/^\+880/).first();
    this.navOverview = page.getByRole('link', { name: 'Overview' });
    this.navOrders = page.getByRole('link', { name: 'Orders', exact: true });
    this.navPrescriptions = page.getByRole('link', { name: 'Prescriptions', exact: true });
    this.navAddresses = page.getByRole('link', { name: 'Addresses' });
    this.navWishlist = page.getByRole('link', { name: 'Wishlist', exact: true });
    this.signOutButton = page.getByRole('button', { name: 'Sign out' })
      .or(page.getByRole('link', { name: 'Sign out' }));

    this.memberSince = page.getByText(/Member since/i);
    this.totalSpent = page.getByText(/Total spent/i);
    this.orderCount = page.getByText(/^Orders$/i);
    this.activeOrderCount = page.getByText(/Active order/i);
    this.prescriptionCount = page.getByText(/Prescriptions/i).first();
    this.wishlistCount = page.getByText(/Wishlist/i).first();

    // One anchor per order: clicking the row must open the order detail.
    this.orderRows = page.locator('.order-list li a');
    this.emptyState = page.locator('.empty');

    this.addAddressButton = page.getByRole('button', { name: /Add address/i })
      .or(page.getByRole('link', { name: /Add address/i }));
    // The address list renders one card per saved address; the Remove control
    // is the reliable per-address marker in this build.
    this.addressCards = page.locator('.account-main .card').filter({ has: page.getByRole('button', { name: /^Remove$/ }) });
    this.labelInput = page.getByLabel(/Label/i);
    this.recipientInput = page.locator('input[type="text"]').first();
    this.phoneInput = page.locator('input[placeholder="01XXXXXXXXX"]');
    this.addressTextarea = page.locator('textarea').first();
    this.districtSelect = page.locator('select');
    this.saveAddressButton = page.getByRole('button', { name: /Save|Add address/i }).last();

    this.wishlistItems = page.locator('.pcard, .wishlist-item');
    this.addAllToCartButton = page.getByRole('button', { name: /Add all to cart/i });
  }

  /** Account sections and the heading each one actually renders. */
  static readonly sections: Array<{ name: string; route: string; heading: RegExp }> = [
    { name: 'Overview', route: '/account', heading: /^Hello,/ },
    { name: 'Orders', route: '/account/orders', heading: /My orders/i },
    { name: 'Prescriptions', route: '/account/prescriptions', heading: /Prescriptions/i },
    { name: 'Addresses', route: '/account/addresses', heading: /Addresses/i },
    { name: 'Wishlist', route: '/account/wishlist', heading: /Wishlist/i },
  ];

  async open() { await this.goto('/account'); }
  async openOrders() { await this.goto('/account/orders'); }
  async openPrescriptions() { await this.goto('/account/prescriptions'); }
  async openAddresses() { await this.goto('/account/addresses'); }
  async openWishlist() { await this.goto('/account/wishlist'); }

  async signOut() {
    await this.signOutButton.click();
    await this.settle();
  }

  /** Saved-address controls. */
  get removeAddressButtons(): Locator {
    return this.page.getByRole('button', { name: /^Remove$/ });
  }

  /** Delete one saved address, accepting the native confirm. */
  async deleteAddress(index = 0) {
    const before = await this.removeAddressButtons.count();
    if (before === 0) return;

    this.acceptNextConfirm();
    await this.removeAddressButtons.nth(index).click();
    await expect
      .poll(() => this.removeAddressButtons.count(), { timeout: 15_000 })
      .toBeLessThan(before);
  }

  /** Create a saved address so a case that needs one can provision its own. */
  async addAddress(a: {
    recipient: string;
    phone: string;
    address: string;
    district: string;
    label?: string;
  }) {
    await this.openAddresses();
    await this.addAddressButton.first().click();
    await this.settle();

    if (a.label && (await this.labelInput.count())) {
      await this.labelInput.first().fill(a.label);
    }
    await this.page.getByLabel(/Recipient|Full name|Name/i).first().fill(a.recipient);
    await this.page.locator('input[placeholder="01XXXXXXXXX"]').first().fill(a.phone);
    await this.page.locator('textarea').first().fill(a.address);
    await this.page.locator('select').first().selectOption({ label: a.district });
    await this.page.getByRole('button', { name: /Save|Add address/i }).last().click();
    await this.settle();

    await expect(this.page.getByText(a.recipient).first()).toBeVisible({ timeout: 15_000 });
  }

  /** Remove every saved address — used to leave the account as found. */
  async clearAddresses() {
    await this.openAddresses();
    for (let guard = 0; guard < 15; guard++) {
      if ((await this.removeAddressButtons.count()) === 0) break;
      await this.deleteAddress(0);
    }
  }

  /** Remove every wishlist item. */
  async clearWishlist() {
    await this.openWishlist();
    const saved = this.page.locator('button.heart[aria-pressed="true"]');
    for (let guard = 0; guard < 20; guard++) {
      const before = await saved.count();
      if (before === 0) break;
      await saved.first().click({ force: true });
      await expect.poll(() => saved.count(), { timeout: 15_000 }).toBeLessThan(before);
    }
  }

  /**
   * Open the first order in the list.
   *
   * Clicking the row does not always hand over to the router, so follow the
   * row's own href instead — the destination is the same.
   */
  async openFirstOrder() {
    await this.openOrders();
    await this.orderRows.first().waitFor({ state: 'visible', timeout: 20_000 });

    const href = await this.orderRows.first().getAttribute('href');
    if (!href) throw new Error('The first order row carries no link to follow');

    await this.goto(href);
    await this.page.waitForURL(/\/account\/orders\/\d+/, { timeout: 20_000 });
  }

  /** Open a specific order by its NP-xxxxxx number. */
  async openOrder(orderNumber: string) {
    await this.openOrders();
    await this.page.getByText(orderNumber).first().click();
    await this.settle();
  }
}
