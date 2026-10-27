import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Admin > Store settings (/admin/settings).
 *
 * The page is a column of cards — Store details, Delivery & ordering, Payment
 * methods, Social links — each with its own Edit button that swaps that card
 * alone into a form with Save changes / Cancel. Nothing is a dialog, so every
 * locator has to be scoped to its card or it collides with the admin search
 * box and with the other cards' fields.
 */
export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open() {
    await this.goto('/admin/settings');
    await expect(this.card('Store details')).toBeVisible({ timeout: 20_000 });
  }

  /** The settings card carrying the given heading. */
  card(heading: string | RegExp): Locator {
    return this.page
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { name: heading }) })
      .first();
  }

  /** Open one card's editor. Safe to call when it is already open. */
  async edit(heading: string | RegExp) {
    const card = this.card(heading);
    const button = card.getByRole('button', { name: 'Edit' });
    if (await button.count()) {
      await button.first().click();
      await expect(card.getByRole('button', { name: 'Save changes' }))
        .toBeVisible({ timeout: 15_000 });
    }
  }

  /** A field inside an open card editor, addressed by its visible label. */
  field(heading: string | RegExp, label: string | RegExp): Locator {
    return this.card(heading).getByLabel(label);
  }

  /** Everything the card is displaying, editor open or closed. */
  async summary(heading: string | RegExp): Promise<string> {
    return (await this.card(heading).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The inline notice the card shows when it refuses a submission. */
  notice(heading: string | RegExp): Locator {
    return this.card(heading).getByText(/check the highlighted fields|Enter an amount|must be/i);
  }

  /**
   * Submit a card's editor.
   *
   * Returns true only when the save was accepted: the editor closed and no
   * validation notice is showing. A refusal keeps the form open and prints
   * "Please check the highlighted fields", so both signals are read rather
   * than waiting on a toast that may never appear.
   */
  async save(heading: string | RegExp, timeout = 8_000): Promise<boolean> {
    const card = this.card(heading);
    await card.getByRole('button', { name: 'Save changes' }).click();
    await this.settle();
    try {
      await expect(card.getByRole('button', { name: 'Save changes' }))
        .toHaveCount(0, { timeout });
    } catch {
      return false;                       // editor still open: refused
    }
    return (await this.notice(heading).count()) === 0;
  }

  /**
   * What the card holds after a round trip to the server.
   *
   * Reading the card straight after a refused save returns the open form —
   * district lists, hint text and all — not the configuration. Reload first
   * so the assertion is about what was actually stored.
   */
  async storedSummary(heading: string | RegExp): Promise<string> {
    await this.open();
    return this.summary(heading);
  }

  async cancel(heading: string | RegExp) {
    const card = this.card(heading);
    const button = card.getByRole('button', { name: 'Cancel' });
    if (await button.count()) await button.first().click();
    await this.settle();
  }

  /** True when the browser itself is blocking submission of `input`. */
  static async nativelyInvalid(input: Locator): Promise<boolean> {
    return input.evaluate((el: HTMLInputElement) => !el.checkValidity());
  }

  /**
   * A payment method's on/off control.
   *
   * These are rendered as `role="switch"` with the real checkbox visually
   * hidden behind a painted track, so check()/uncheck() never find anything
   * actionable. Read the state off the native checkbox instead.
   */
  toggle(heading: string | RegExp, name: string | RegExp): Locator {
    return this.card(heading).getByRole('switch', { name });
  }

  async toggleIsOn(heading: string | RegExp, name: string | RegExp): Promise<boolean> {
    // role="switch" is layered on a real checkbox and carries no aria-checked;
    // the state lives in the native checked property.
    return this.toggle(heading, name).isChecked();
  }

  async setToggle(heading: string | RegExp, name: string | RegExp, on: boolean) {
    if ((await this.toggleIsOn(heading, name)) === on) return;

    // A `.switch-track` span is painted over the input and swallows pointer
    // events, so clicking the control is never actionable. Space on the
    // focused input toggles it the way a keyboard user would.
    const input = this.toggle(heading, name);
    await input.focus();
    await input.press(' ');
    await expect(input).toBeChecked({ checked: on, timeout: 5_000 });
  }

  /**
   * Put a toggle back, saving only when it actually moved.
   *
   * A save that changes nothing still rewrites the card's audit line from
   * "Default setup" to "Last changed by …", so a restore that always saves
   * leaves the environment different from how it was found.
   */
  async restoreToggle(heading: string | RegExp, name: string | RegExp, on: boolean) {
    await this.open();
    await this.edit(heading);
    if ((await this.toggleIsOn(heading, name)) === on) {
      await this.cancel(heading);
      return;
    }
    await this.setToggle(heading, name, on);
    await this.save(heading);
  }

  /** Put a text field back, saving only when it actually differs. */
  async restoreField(heading: string | RegExp, label: string | RegExp, value: string) {
    await this.open();
    await this.edit(heading);
    const input = this.field(heading, label);
    if ((await input.inputValue()) === value) {
      await this.cancel(heading);
      return;
    }
    await input.fill(value);
    await this.save(heading);
  }

  /**
   * Read every delivery value the card is currently storing, so a test can put
   * them back. Settings are global on a shared environment: a case that leaves
   * a charge or a cap changed breaks every later test and every other tester.
   */
  async deliverySnapshot(): Promise<Record<string, string>> {
    await this.edit('Delivery & ordering');
    const labels = ['Delivery inside Dhaka', 'Delivery outside Dhaka',
      'Free delivery from', 'Maximum quantity per product'];
    const out: Record<string, string> = {};
    for (const l of labels) out[l] = await this.field('Delivery & ordering', l).inputValue();
    await this.cancel('Delivery & ordering');
    return out;
  }

  async restoreDelivery(snapshot: Record<string, string>) {
    await this.open();
    await this.edit('Delivery & ordering');
    for (const [label, value] of Object.entries(snapshot)) {
      await this.field('Delivery & ordering', label).fill(value);
    }
    await this.save('Delivery & ordering');
  }
}
