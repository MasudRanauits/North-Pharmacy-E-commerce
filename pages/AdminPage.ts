import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Admin dashboard. The admin shell lives under /admin and shares one layout
 * (.adm) across every module, so the sidebar and table helpers are reused.
 *
 * Note: the dashboard is served at /admin — /admin/dashboard is a 404 on this
 * build, which NP-SEC-TC-004 assumes exists. See tests/regression/sec-*.
 */
export class AdminPage extends BasePage {
  readonly shell: Locator;
  readonly sidebar: Locator;
  readonly adminName: Locator;
  readonly adminRole: Locator;
  readonly globalSearch: Locator;

  // sidebar
  readonly navDashboard: Locator;
  readonly navOrders: Locator;
  readonly navPrescriptions: Locator;
  readonly navInventory: Locator;
  readonly navCustomers: Locator;
  readonly navPromotions: Locator;
  readonly navContent: Locator;
  readonly navReports: Locator;
  readonly navSettings: Locator;
  readonly viewStoreLink: Locator;

  // shared table
  readonly table: Locator;
  readonly rows: Locator;
  readonly tabs: Locator;
  readonly pageHeading: Locator;
  readonly emptyState: Locator;

  // orders
  readonly orderSearch: Locator;

  // inventory
  readonly inventorySearch: Locator;
  readonly inventoryFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = page.locator('.adm');
    this.sidebar = page.locator('.adm-group').first();
    this.adminName = page.getByText('Store Admin').first();
    this.adminRole = page.locator('.adm-brand').getByText('Admin', { exact: true });
    this.globalSearch = page.getByRole('textbox', { name: 'Search medicines or orders' });

    // The sidebar expands by section, so several links share a label with
    // dashboard tiles. Address them by href and take the first match.
    const nav = (href: string) =>
      page.locator(`.adm a[href="${href}"]`).first();
    this.navDashboard = nav('/admin');
    this.navOrders = nav('/admin/orders');
    this.navPrescriptions = nav('/admin/prescriptions');
    this.navInventory = nav('/admin/inventory');
    this.navCustomers = nav('/admin/customers');
    this.navPromotions = nav('/admin/promotions');
    this.navContent = nav('/admin/content');
    this.navReports = nav('/admin/reports');
    this.navSettings = nav('/admin/settings');
    this.viewStoreLink = page.locator('.adm').getByRole('link', { name: 'View store' }).first();

    this.table = page.locator('table.adm-table');
    this.rows = page.locator('table.adm-table tbody tr');
    this.tabs = page.locator('.adm-tabs button, .adm-tabs a');
    this.pageHeading = page.locator('.adm-page-head h1, .adm-page-head h2').first();
    this.emptyState = page.locator('.adm .empty');

    this.orderSearch = page.getByRole('textbox', { name: 'Search orders' });
    this.inventorySearch = page.getByRole('textbox', { name: 'Product, generic or manufacturer' });
    this.inventoryFilter = page.locator('.adm-head-tools select');
  }

  async open() { await this.goto('/admin'); }
  async openOrders() { await this.goto('/admin/orders'); }
  async openPrescriptions() { await this.goto('/admin/prescriptions'); }
  async openInventory() { await this.goto('/admin/inventory'); }
  async openCustomers() { await this.goto('/admin/customers'); }
  async openPromotions() { await this.goto('/admin/promotions'); }
  async openReports() { await this.goto('/admin/reports'); }
  async openSettings() { await this.goto('/admin/settings'); }
  async openContent() { await this.goto('/admin/content'); }

  /**
   * Wait until the table has finished re-rendering.
   *
   * Filtering and searching swap the rows in asynchronously, so counting too
   * early returns the previous result set. Returns the settled row count.
   */
  async waitForRows(): Promise<number> {
    await this.settle();
    let previous = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const count = await this.rows.count();
      if (count === previous) return count;
      previous = count;
      await this.page.waitForTimeout(400);
    }
    return previous;
  }

  /**
   * Wait until the panel body stops changing.
   *
   * `waitForRows` only knows about `table.adm-table`, so on a module that
   * renders cards instead of a table — prescriptions, for one — it counts zero
   * rows, finds zero stable on the first two samples and returns at once.
   * Settling on the rendered text covers both layouts.
   */
  async waitForPanel(): Promise<void> {
    await this.settle();
    let previous = '';
    for (let attempt = 0; attempt < 15; attempt++) {
      const text = await this.page.locator('.adm-main').innerText().catch(() => '');
      if (text && text === previous) return;
      previous = text;
      await this.page.waitForTimeout(400);
    }
  }

  /** Click a status tab such as "Pending" / "Packed" / "Cancelled". */
  async selectTab(name: string | RegExp) {
    const tab = this.page.locator('.adm-tabs').getByText(name).first();
    await tab.click();

    // The tab marks itself selected as soon as it is clicked, while the list
    // under it is still the previous status'. Waiting on the tab alone used to
    // hand the caller an Approved tab above four Pending cards, so the panel
    // wait below is the one that matters. This is only a cheap early signal -
    // keep its budget short, because getByText can resolve to a label inside
    // the tab that never carries the attribute, and every caller would then
    // pay the full timeout for nothing.
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 })
      .catch(() => { /* not every tab strip uses the tab role */ });
    await this.waitForPanel();
    await this.waitForRows();
  }

  /** Count shown next to a tab, e.g. tabCount('Cancelled') -> 13 */
  async tabCount(name: string): Promise<number> {
    const tab = this.page.locator('.adm-tabs').getByText(name, { exact: false }).first();
    const text = await tab.innerText();
    return Number(text.replace(/[^\d]/g, ''));
  }

  async searchOrders(term: string) {
    await this.orderSearch.fill(term);
    await this.orderSearch.press('Enter');
    await this.waitForRows();
  }

  /** Search the inventory list and wait for the rows to settle. */
  async searchInventory(term: string) {
    await this.inventorySearch.fill(term);
    await this.inventorySearch.press('Enter');
    return this.waitForRows();
  }

  /** The table row for a given order number. */
  orderRow(orderNumber: string): Locator {
    return this.rows.filter({ hasText: orderNumber });
  }

  async openOrder(orderNumber: string) {
    await this.orderRow(orderNumber).first().click();
    await this.settle();
  }

  /** True when the admin shell rendered — used by the authorisation cases. */
  async isAdminShellVisible(): Promise<boolean> {
    return (await this.shell.count()) > 0 && (await this.navOrders.count()) > 0;
  }

  async expectDenied() {
    await expect(this.navOrders).toHaveCount(0);
    await expect(this.table).toHaveCount(0);
  }

  /** Every admin module route with the heading it must render. */
  static readonly modules: Array<{ name: string; route: string; heading: RegExp }> = [
    { name: 'Dashboard', route: '/admin', heading: /Dashboard|Overview|Orders/i },
    { name: 'Orders', route: '/admin/orders', heading: /Orders/i },
    { name: 'Prescriptions', route: '/admin/prescriptions', heading: /Prescriptions/i },
    { name: 'Inventory', route: '/admin/inventory', heading: /Inventory|Products/i },
    { name: 'Customers', route: '/admin/customers', heading: /Customers/i },
    { name: 'Promotions', route: '/admin/promotions', heading: /Promotions/i },
    { name: 'Website content', route: '/admin/content', heading: /Website content/i },
    { name: 'Reports', route: '/admin/reports', heading: /Reports/i },
    { name: 'Settings', route: '/admin/settings', heading: /settings/i },
  ];

}
