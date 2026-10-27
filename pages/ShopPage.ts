import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** Product listing: /shop with cat / dept / mfr / offers / inStock filters. */
export class ShopPage extends BasePage {
  readonly heading: Locator;
  readonly resultCount: Locator;
  readonly breadcrumb: Locator;
  readonly sortSelect: Locator;
  readonly filtersToggle: Locator;
  readonly filterChips: Locator;
  readonly clearAllButton: Locator;
  readonly inStockFilter: Locator;
  readonly onOfferFilter: Locator;
  readonly productCards: Locator;
  readonly productNames: Locator;
  readonly productPrices: Locator;
  readonly emptyState: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator('.shop-head h1, .shop-head h2').first();
    this.resultCount = page.locator('.shop-head').getByText(/\d[\d,]*\s+products?/);
    this.breadcrumb = page.locator('.crumbs, nav[aria-label="Breadcrumb"], .breadcrumb').first();
    this.sortSelect = page.locator('.shop-tools select');
    this.filtersToggle = page.getByRole('button', { name: 'Filters' });
    this.filterChips = page.locator('.chips .chip');
    this.clearAllButton = page.locator('.chips').getByText(/Clear all/i).first();
    this.inStockFilter = page.getByText('In stock only');
    this.onOfferFilter = page.getByText('On offer');
    this.productCards = page.locator('.pcard');
    this.productNames = page.locator('.pcard-name');
    this.productPrices = page.locator('.pcard .price strong');
    this.emptyState = page.locator('.empty');
    this.pagination = page.locator('.pager, .pagination').first();
  }

  async open(query = '') {
    await this.goto(`/shop${query}`);
  }

  async openCategory(slug: string) {
    await this.goto(`/shop?cat=${slug}`);
  }

  /**
   * Wait until the product grid has stopped re-rendering.
   *
   * The listing swaps its cards in asynchronously after a sort, filter or
   * search, so reading prices or names too early returns the previous page —
   * or an empty array. Returns the settled card count.
   */
  async waitForListing(): Promise<number> {
    await this.settle();
    await this.productCards
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => { /* an empty result is a valid outcome */ });

    let previous = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const count = await this.productCards.count();
      if (count === previous) return count;
      previous = count;
      await this.page.waitForTimeout(400);
    }
    return previous;
  }

  async sortBy(label: string) {
    await this.sortSelect.selectOption({ label });
    // The sort is reflected in the URL before the grid catches up.
    await this.page.waitForURL(/sort=/, { timeout: 15_000 }).catch(() => {});
    await this.waitForListing();
  }

  /** Prices on the current page as plain numbers. */
  async prices(): Promise<number[]> {
    await this.waitForListing();
    const texts = await this.productPrices.allInnerTexts();
    return texts.map((t) => Number(t.replace(/[^\d.]/g, ''))).filter((n) => !Number.isNaN(n));
  }

  /** Product names on the current page, read once the grid has settled. */
  async names(): Promise<string[]> {
    await this.waitForListing();
    return this.productNames.allInnerTexts();
  }

  /** Total result count parsed from the "N products" heading line. */
  async totalResults(): Promise<number> {
    const text = await this.resultCount.first().innerText().catch(() => '0');
    return Number(text.replace(/[^\d]/g, ''));
  }

  card(index = 0): Locator {
    return this.productCards.nth(index);
  }

  /**
   * Add the card at `index` to the cart.
   * The card swaps its Add to Cart button for a quantity stepper once the
   * product is already in the cart, so treat that as "already added".
   */
  async addCardToCart(index = 0) {
    await this.settle();
    const before = await this.cartCount();
    const listingUrl = this.page.url();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const card = this.card(index);
      await card.waitFor({ state: 'visible', timeout: 20_000 });
      const addButton = card.getByRole('button', { name: 'Add to Cart' });

      if (await addButton.count()) {
        if (await this.clickAddAndAwaitWrite(addButton, before)) return;
      } else if ((await this.cartCount()) > before) {
        // The card shows a stepper because the product is genuinely in the
        // cart already — nothing to do.
        return;
      }

      // Either the click did not register, or the card was showing a stepper
      // left over from a cart that has since been emptied. Re-fetch the
      // listing so the controls reflect the real cart, then try again.
      await this.page.goto(listingUrl, { waitUntil: 'domcontentloaded' });
      await this.settle();
    }

    throw new Error(
      `Could not add product ${index} to the cart after 3 attempts `
      + `(cart went from ${before} to ${await this.cartCount()} items)`,
    );
  }

  /**
   * Add a card that was found by filtering rather than by index — the first
   * Rx product, say. Same write-aware wait as `addCardToCart`.
   */
  async addCard(card: Locator) {
    const before = await this.cartCount();
    const addButton = card.getByRole('button', { name: 'Add to Cart' });
    await addButton.waitFor({ state: 'visible', timeout: 20_000 });

    if (await this.clickAddAndAwaitWrite(addButton, before)) return;
    throw new Error('The add-to-cart write was not accepted');
  }

  /**
   * Click an Add to Cart control and wait for the add to be durable.
   *
   * Signed in, the cart is server-side: the header count is updated
   * optimistically the moment the button is clicked, while the PUT to
   * /api/cart/items/:id is still outstanding, so returning on the badge let
   * callers navigate away and abort the request in flight - the trace showed
   * the PUT ending at status -1 and the cart then arriving empty at checkout.
   *
   * As a guest the cart is held entirely in the browser and no request is
   * made at all, so there is nothing to wait for and the badge is the only
   * signal there is. Decide between the two on the request rather than the
   * response: it is issued synchronously with the click, so a short budget
   * settles which build we are on without costing a signed-out run anything.
   */
  private async clickAddAndAwaitWrite(addButton: Locator, before: number): Promise<boolean> {
    const matches = (url: string) => /\/api\/cart\/items\//.test(url);
    const requested = this.page
      .waitForRequest((r) => matches(r.url()), { timeout: 3_000 })
      .catch(() => null);
    const answered = this.page
      .waitForResponse((r) => matches(r.url()), { timeout: 20_000 })
      .catch(() => null);

    await addButton.click();

    // No request means a client-side cart; fall through to the badge.
    if (await requested) {
      const written = await answered;
      if (written) return written.ok();
    }
    return this.cartCountReaches(before + 1);
  }

  /** Poll the cart badge, returning false instead of throwing on timeout. */
  private async cartCountReaches(target: number, timeout = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await this.cartCount()) >= target) return true;
      await this.page.waitForTimeout(300);
    }
    return false;
  }

  async saveCardToWishlist(index = 0) {
    const heart = this.card(index).locator('button.heart');
    await heart.waitFor({ state: 'visible' });
    if ((await heart.getAttribute('aria-pressed')) === 'true') return;
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  }
}
