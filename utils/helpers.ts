import { Page, expect, Locator, test, Browser, BrowserContext } from '@playwright/test';
import { BASE_URL } from '../data/testData';

/**
 * A second, genuinely signed-out browser context.
 *
 * Inside a test, `browser.newContext()` reuses the test's context options —
 * including the `storageState` that `customerTest` and `adminTest` set — so a
 * context meant to be a guest arrives already signed in. The empty
 * `storageState` below is what actually makes it a guest; `baseURL` and the
 * self-signed-certificate allowance have to be restated for the same reason.
 */
export async function newGuestContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
}

/** Random Bangladeshi-format mobile number (11 digits, 01 prefix). */
export function randomMobile(): string {
  const prefix = ['013', '014', '015', '016', '017', '018', '019'][
    Math.floor(Math.random() * 7)
  ];
  const tail = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  return `${prefix}${tail}`;
}

/** Random email for sign-up style tests. */
export function randomEmail(prefix = 'qa'): string {
  return `${prefix}_${Date.now()}@mailinator.com`;
}

/** Unique name so parallel runs never collide. */
export function uniqueName(prefix = 'QA Tester'): string {
  return `${prefix} ${Date.now().toString().slice(-6)}`;
}

/** Strip ৳ / commas / spaces and return the number. "৳1,204.53" -> 1204.53 */
export function toNumber(text: string): number {
  return Number(text.replace(/[^\d.-]/g, ''));
}

/** Format the way the storefront prints prices. */
export function toBDT(amount: number): string {
  return `৳${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Wait until the URL matches and the DOM has settled. */
export async function expectUrl(page: Page, pattern: RegExp) {
  await expect(page).toHaveURL(pattern);
  await page.waitForLoadState('domcontentloaded');
}

/** Attach a screenshot to the HTML report — required for Critical/High cases. */
export async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

/** True when a locator exists and is visible. */
export async function isVisible(locator: Locator): Promise<boolean> {
  return (await locator.count()) > 0 && (await locator.first().isVisible());
}

/** Collect console errors raised while the callback runs (NP-CMP-TC-019). */
export async function collectConsoleErrors(
  page: Page,
  run: () => Promise<void>,
): Promise<string[]> {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === 'error') errors.push(m.text());
  };
  const onPageError = (e: Error) => errors.push(e.message);
  page.on('console', onConsole as never);
  page.on('pageerror', onPageError);
  await run();
  page.off('console', onConsole as never);
  page.off('pageerror', onPageError);
  return errors;
}

/** Relative luminance of an "rgb(r, g, b)" string, per WCAG. */
function luminance(rgb: string): number | null {
  const m = rgb.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) return null;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(+m[1]) + 0.7152 * channel(+m[2]) + 0.0722 * channel(+m[3]);
}

export type ContrastSample = {
  selector: string;
  foreground: string;
  background: string;
  fontSize: number;
  ratio: number | null;
  /** Set when the pair cannot be measured reliably (e.g. an image backdrop). */
  unmeasurable?: string;
};

/**
 * Measure text-to-background contrast for one element.
 *
 * Backgrounds are often painted with a CSS gradient rather than a flat colour;
 * treating that as "transparent" and walking up to the page background gives a
 * wildly wrong ratio, so the first colour stop of the gradient is used
 * instead. A photographic backdrop cannot be scored and is reported as
 * unmeasurable rather than as a failure.
 */
export async function measureContrast(
  page: Page,
  selector: string,
): Promise<ContrastSample | null> {
  const raw = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const style = getComputedStyle(el);

    const backdropOf = (node: HTMLElement): { value: string; kind: string } => {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        const stop = s.backgroundImage.match(/rgba?\([^)]+\)/);
        if (stop) return { value: stop[0], kind: 'gradient' };
        return { value: s.backgroundImage, kind: 'image' };
      }
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        return { value: s.backgroundColor, kind: 'color' };
      }
      return { value: '', kind: 'none' };
    };

    let node: HTMLElement | null = el;
    while (node) {
      const found = backdropOf(node);
      if (found.kind !== 'none') {
        return {
          foreground: style.color,
          background: found.value,
          kind: found.kind,
          fontSize: parseFloat(style.fontSize),
        };
      }
      node = node.parentElement;
    }
    return {
      foreground: style.color,
      background: 'rgb(255, 255, 255)',
      kind: 'color',
      fontSize: parseFloat(style.fontSize),
    };
  }, selector);

  if (!raw) return null;

  if (raw.kind === 'image') {
    return {
      selector,
      foreground: raw.foreground,
      background: raw.background,
      fontSize: raw.fontSize,
      ratio: null,
      unmeasurable: 'text sits on a background image',
    };
  }

  const fg = luminance(raw.foreground);
  const bg = luminance(raw.background);
  if (fg === null || bg === null) {
    return {
      selector,
      foreground: raw.foreground,
      background: raw.background,
      fontSize: raw.fontSize,
      ratio: null,
      unmeasurable: 'colour could not be parsed',
    };
  }

  return {
    selector,
    foreground: raw.foreground,
    background: raw.background,
    fontSize: raw.fontSize,
    ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
  };
}

/** WCAG AA minimum for a given font size: 3:1 for large text, else 4.5:1. */
export function requiredContrast(fontSizePx: number): number {
  return fontSizePx >= 24 ? 3 : 4.5;
}

/**
 * Leave exactly `count` in-stock products in the cart, verified on the cart
 * page itself.
 *
 * The cart badge in the header is optimistic: it can tick up while the add
 * request has not actually landed, which then shows up much later as
 * "checkout redirected to /cart". Confirming against the rendered cart lines
 * makes the precondition trustworthy.
 */
export async function ensureCartHas(
  shopPage: import('../pages/ShopPage').ShopPage,
  cartPage: import('../pages/CartPage').CartPage,
  count = 1,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await cartPage.open();
    await cartPage.emptyTheCart();
    await shopPage.open('?inStock=true');

    // Take the first cards that actually offer an Add control, rather than
    // insisting on fixed indexes — a card already in the cart shows a
    // stepper instead and would stall the loop.
    let added = 0;
    const available = Math.min(await shopPage.productCards.count(), 20);
    for (let i = 0; i < available && added < count; i += 1) {
      const addButton = shopPage.card(i).getByRole('button', { name: 'Add to Cart' });
      if ((await addButton.count()) === 0) continue;
      await shopPage.addCardToCart(i);
      added += 1;
    }

    await cartPage.open();
    if ((await cartPage.itemCount()) >= count) return;
  }
  throw new Error(`Could not place ${count} product(s) in the cart after 3 attempts`);
}

/** Assert the page does not scroll sideways (NP-RSP module). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(2);
}

/**
 * Mark a case that cannot be automated against this environment.
 * It still appears in the report, annotated with the reason, so the
 * 434-case coverage map stays complete.
 */
export function manual(reason: string) {
  test.info().annotations.push({ type: 'manual', description: reason });
  test.skip(true, `MANUAL: ${reason}`);
}

/**
 * Mark a case that cannot run because the feature it covers is switched off
 * or broken elsewhere. Maps to the "Blocked" status in NP-QA-TC-001 7.2.
 */
export function blocked(reason: string) {
  test.info().annotations.push({ type: 'blocked', description: reason });
  test.skip(true, `BLOCKED: ${reason}`);
}

/**
 * Mark a case that writes real data (store settings, deletions, status
 * changes). This suite points at a UAT server, so these run by default and
 * the annotation is what flags them in the report.
 *
 * Set SKIP_DESTRUCTIVE=1 to exclude them -- use that when running against
 * an environment whose data has to survive the run.
 */
export function destructive(reason: string) {
  test.info().annotations.push({ type: 'destructive', description: reason });
  test.skip(
    process.env.SKIP_DESTRUCTIVE === '1',
    `DESTRUCTIVE (unset SKIP_DESTRUCTIVE to run): ${reason}`,
  );
}
