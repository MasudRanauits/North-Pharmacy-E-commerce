import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/** Product detail page: /p/:id/:slug */
export class ProductPage extends BasePage {
  readonly name: Locator;
  readonly generic: Locator;
  readonly strength: Locator;
  readonly manufacturer: Locator;
  readonly price: Locator;
  readonly mrp: Locator;
  readonly discountBadge: Locator;
  readonly prescriptionBadge: Locator;
  readonly stockIndicator: Locator;
  readonly productImage: Locator;
  readonly qtyInput: Locator;
  readonly qtyIncrease: Locator;
  readonly qtyDecrease: Locator;
  readonly addToCartButton: Locator;
  readonly orderNowButton: Locator;
  readonly wishlistButton: Locator;
  readonly relatedProducts: Locator;
  readonly notFound: Locator;

  constructor(page: Page) {
    super(page);
    this.name = page.locator('h1').first();
    this.generic = page.locator('.pdp-generic, .product-generic').first();
    this.strength = page.locator('.pdp-sub, .product-sub').first();
    this.manufacturer = page.locator('.pdp-mfr, .product-mfr').first();
    this.price = page.locator('.price strong').first();
    this.mrp = page.locator('.price del, .mrp, s').first();
    this.discountBadge = page.locator('.badge-discount, .discount, [class*="off"]').first();
    this.prescriptionBadge = page.getByText(/prescription/i).first();
    this.stockIndicator = page.locator('.stock').first();
    this.productImage = page.locator('.pdp-media img, .visual img').first();
    this.qtyInput = page.getByRole('spinbutton', { name: 'Quantity' });
    this.qtyIncrease = page.getByRole('button', { name: 'Increase quantity' });
    this.qtyDecrease = page.getByRole('button', { name: 'Decrease quantity' });
    this.addToCartButton = page.getByRole('button', { name: 'Add to Cart' });
    this.orderNowButton = page.getByRole('button', { name: 'Order Now' });
    this.wishlistButton = page.locator('button.heart').first();
    this.relatedProducts = page.locator('.pcard');
    this.notFound = page.getByText(/couldn't find that page|not found/i);
  }

  async openBySlug(id: string, slug: string) {
    await this.goto(`/p/${id}/${slug}`);
  }

  async openUrl(url: string) {
    await this.goto(url);
  }

  /** Open the first product of a listing — the reliable way in, since the
   *  product id is a GUID that changes between environments. */
  async openFirstFromShop(query = '?inStock=true') {
    await this.goto(`/shop${query}`);
    const href = await this.page.locator('a.pcard-name').first().getAttribute('href');
    if (!href) throw new Error('No product link found on the listing');
    await this.goto(href);
    return href;
  }

  async setQuantity(value: number | string) {
    await this.qtyInput.fill(String(value));
    await this.qtyInput.blur();
  }

  async quantity(): Promise<number> {
    return Number(await this.qtyInput.inputValue());
  }
}
