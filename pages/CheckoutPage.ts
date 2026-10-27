import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class CheckoutPage extends BasePage {
  readonly savedAddressRadios: Locator;
  readonly addressInputs: Locator;
  readonly recipientInput: Locator;
  readonly phoneInput: Locator;
  readonly addressTextarea: Locator;
  readonly areaInput: Locator;
  readonly districtSelect: Locator;
  readonly saveAddressCheckbox: Locator;
  readonly paymentOptions: Locator;
  readonly codOption: Locator;
  readonly noteTextarea: Locator;
  readonly itemsTotal: Locator;
  readonly deliveryCharge: Locator;
  readonly orderTotal: Locator;
  readonly placeOrderButton: Locator;
  readonly prescriptionUpload: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.savedAddressRadios = page.locator('input[type="radio"]');
    // The address inputs carry no `type` attribute, so address them by order
    // among the non-choice inputs: recipient, phone, area.
    this.addressInputs = page.locator(
      '.container.page input:not([type="radio"]):not([type="checkbox"]):not([type="search"]):not([type="email"])',
    );
    this.recipientInput = this.addressInputs.nth(0);
    this.phoneInput = page.locator('input[placeholder="01XXXXXXXXX"]');
    this.addressTextarea = page.locator('textarea').first();
    this.areaInput = this.addressInputs.nth(2);
    this.districtSelect = page.locator('select');
    this.saveAddressCheckbox = page.getByText('Save this address for next time');
    this.paymentOptions = page.locator('input[type="radio"]');
    this.codOption = page.getByText('Cash on Delivery');
    this.noteTextarea = page.getByPlaceholder('Anything we should know about this order?');
    this.itemsTotal = page.getByText(/^Items \(\d+\)$/).locator('xpath=following-sibling::*[1]');
    this.deliveryCharge = page.getByText(/^Delivery/).locator('xpath=following-sibling::*[1]');
    this.orderTotal = page.getByText(/^Total$/).locator('xpath=following-sibling::*[1]');
    this.placeOrderButton = page.getByRole('button', { name: /Place order/i });
    this.prescriptionUpload = page.locator('input[type="file"]');
    this.errorMessage = page.locator('.field-error, .form-error, [role="alert"]');
  }

  /** Navigate without asserting the form rendered (guest / redirect cases). */
  async openRaw() {
    await this.goto('/checkout');
  }

  async open() {
    await this.goto('/checkout');
    // Checkout bounces back to the cart when there is nothing to buy; make
    // that the failure message rather than a mystery locator timeout.
    if (/\/cart/.test(this.page.url())) {
      throw new Error('Checkout redirected to /cart — the cart is empty');
    }
    // The place-order control is present whichever address path is shown.
    await this.placeOrderButton.waitFor({ state: 'visible', timeout: 20_000 });
  }

  /** True when the new-address form (which owns the district select) is shown. */
  async hasAddressForm(): Promise<boolean> {
    return (await this.districtSelect.count()) > 0;
  }

  /**
   * Make sure the new-address form is on screen.
   *
   * With no saved address the form is shown by default. Once an address is
   * saved, checkout lists the saved ones instead and the form has to be
   * opened. Returns false when neither path exposes it.
   */
  async ensureAddressForm(): Promise<boolean> {
    if (await this.hasAddressForm()) return true;

    // With saved addresses the form hides behind "Deliver somewhere else".
    const newAddress = this.page
      .getByText(/deliver somewhere else/i)
      .or(this.page.getByRole('button', { name: /new address|add address|another address/i }))
      .or(this.page.getByText(/use a new address|add a new address/i));

    if (await newAddress.count()) {
      await newAddress.first().click();
      await this.settle();
    }
    return this.hasAddressForm();
  }

  /** The district the order summary is currently pricing, e.g. "Dhaka". */
  async summaryDistrict(): Promise<string | null> {
    const row = this.page.getByText(/^Delivery/).first();
    const text = await row.innerText().catch(() => '');
    return text.match(/\(([^)]+)\)/)?.[1] ?? null;
  }

  async fillNewAddress(a: {
    recipient: string;
    phone: string;
    address: string;
    area?: string;
    district: string;
  }) {
    if (!(await this.ensureAddressForm())) {
      throw new Error('Checkout offered no new-address form to fill');
    }
    await this.recipientInput.fill(a.recipient);
    await this.phoneInput.fill(a.phone);
    await this.addressTextarea.fill(a.address);
    if (a.area) await this.areaInput.fill(a.area);
    await this.districtSelect.selectOption({ label: a.district });
    await this.settle();
  }

  async selectDistrict(district: string) {
    if (!(await this.ensureAddressForm())) {
      throw new Error(
        'Checkout is showing saved addresses and offers no new-address form, '
        + `so the district cannot be set to ${district}`,
      );
    }
    await this.districtSelect.first().selectOption({ label: district });
    await this.settle();
  }

  /** The saving shown on the Discount row, or 0 when there is none. */
  async discount(): Promise<number> {
    const row = this.page.getByText(/^Discount$/).first();
    if ((await row.count()) === 0) return 0;

    const text = await row
      .locator('xpath=following-sibling::*[1]')
      .innerText()
      .catch(() => '');
    // The saving is printed with a leading minus sign; take the figure only.
    const figure = text.match(/[\d,]+(?:\.\d+)?/);
    return figure ? Number(figure[0].replace(/,/g, '')) : 0;
  }

  /** Numeric amount of a summary row, once it actually holds a figure. */
  async amount(label: RegExp): Promise<number> {
    const value = this.page
      .getByText(label)
      .first()
      .locator('xpath=following-sibling::*[1]');

    // The summary paints its rows before the figures arrive.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const text = await value.innerText().catch(() => '');
      const figure = text.match(/[\d,]+(?:\.\d+)?/);
      if (figure) return Number(figure[0].replace(/,/g, ''));
      if (/^\s*(৳\s*)?0+(\.0+)?\s*$/.test(text)) return 0;
      await this.page.waitForTimeout(300);
    }
    throw new Error(`The summary row matching ${label} never showed a number`);
  }

  /** The total printed on the place-order button, e.g. "Place order · ৳61.90". */
  async buttonTotal(): Promise<number> {
    const text = await this.placeOrderButton.innerText();
    return Number(text.replace(/[^\d.]/g, ''));
  }

  async districtOptions(): Promise<string[]> {
    return this.districtSelect.locator('option').allInnerTexts();
  }
}
