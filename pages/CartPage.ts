import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class CartPage extends BasePage {
  readonly heading: Locator;
  readonly lines: Locator;
  readonly lineNames: Locator;
  readonly qtyInputs: Locator;
  readonly increaseButtons: Locator;
  readonly decreaseButtons: Locator;
  readonly removeButtons: Locator;
  readonly emptyCartButton: Locator;
  readonly itemsSubtotal: Locator;
  readonly deliveryCharge: Locator;
  readonly total: Locator;
  readonly freeDeliveryProgress: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingLink: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /Your cart/i });
    this.lines = page.locator('.cart-line');
    this.lineNames = page.locator('a.cart-name');
    this.qtyInputs = page.getByRole('spinbutton', { name: 'Quantity' });
    this.increaseButtons = page.getByRole('button', { name: 'Increase quantity' });
    this.decreaseButtons = page.getByRole('button', { name: 'Decrease quantity' });
    this.removeButtons = page.getByRole('button', { name: 'Remove' });
    this.emptyCartButton = page.getByRole('button', { name: 'Empty cart' });
    this.itemsSubtotal = page.getByText(/^Items \(\d+\)$/).locator('xpath=following-sibling::*[1]');
    this.deliveryCharge = page.getByText(/^Delivery/).locator('xpath=following-sibling::*[1]');
    this.total = page.getByText(/^Total$/).locator('xpath=following-sibling::*[1]');
    this.freeDeliveryProgress = page.getByText(/more for free delivery|free delivery/i);
    this.checkoutButton = page.getByRole('link', { name: /Proceed to Checkout/i })
      .or(page.getByRole('button', { name: /Proceed to Checkout/i }));
    this.continueShoppingLink = page.getByRole('link', { name: /Continue shopping/i });
    this.emptyState = page.getByText('Your cart is empty');
  }

  async open() {
    await this.goto('/cart');
  }

  /** Number of distinct cart lines (not pieces). */
  async itemCount(): Promise<number> {
    if (await this.emptyState.count()) return 0;
    return this.lines.count();
  }

  /** Piece count from the "Your cart (N items)" heading. */
  async pieceCount(): Promise<number> {
    if (await this.emptyState.count()) return 0;
    const text = await this.heading.innerText();
    return Number(text.match(/(\d+)/)?.[1] ?? 0);
  }

  /** Line total of the row at `index`, e.g. 8.02 */
  async lineTotal(index = 0): Promise<number> {
    const text = await this.lines.nth(index).locator('.cart-total').innerText();
    return Number(text.replace(/[^\d.]/g, ''));
  }

  /** The saving shown on the Discount row, or 0 when there is none. */
  async discount(): Promise<number> {
    const row = this.page.getByText(/^Discount$/).first();
    if ((await row.count()) === 0) return 0;
    const text = await row.locator('xpath=following-sibling::*[1]').innerText();
    return Number(text.replace(/[^\d.]/g, ''));
  }

  /** Unit price of the row at `index`. */
  async unitPrice(index = 0): Promise<number> {
    const text = await this.lines.nth(index).locator('.cart-unit').innerText();
    return Number(text.replace(/[^\d.]/g, ''));
  }

  /**
   * Numeric value of a summary row such as "Total" or "Items (1)".
   *
   * Note the order summary lists Items at MRP and shows the saving on its own
   * "Discount" row, so the sum of the line totals equals Items - Discount.
   */
  async summaryAmount(label: RegExp): Promise<number> {
    const row = this.page.getByText(label).first();
    const text = await row.locator('xpath=following-sibling::*[1]').innerText();
    return Number(text.replace(/[^\d.]/g, ''));
  }

  /** Remove every line and wait until the cart badge really reads zero. */
  async emptyTheCart() {
    if ((await this.emptyCartButton.count()) === 0) {
      await expect(this.emptyState).toBeVisible({ timeout: 15_000 });
      return;
    }

    // Wait for the DELETE itself. The UI empties optimistically, so settling
    // on the empty state alone let callers navigate away while the clear was
    // still in flight; the navigation then aborted it and the items came back
    // on the next load. A guest cart lives in the browser and issues no
    // request at all, so gate on the request - which goes out with the click -
    // rather than blocking a signed-out run on a response that never comes.
    const isDelete = (url: string, method: string) =>
      /\/api\/cart$/.test(url) && method === 'DELETE';
    const requested = this.page
      .waitForRequest((r) => isDelete(r.url(), r.method()), { timeout: 3_000 })
      .catch(() => null);
    const cleared = this.page
      .waitForResponse((r) => isDelete(r.url(), r.request().method()), { timeout: 20_000 })
      .catch(() => null);

    await this.emptyCartButton.click();
    const confirm = this.page.getByRole('button', { name: /^(Yes|Confirm|Empty cart)$/i });
    if (await confirm.count()) await confirm.first().click();
    if (await requested) await cleared;
    await this.settle();

    await expect(this.emptyState).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => this.cartCount(), { timeout: 10_000 }).toBe(0);
  }
}
