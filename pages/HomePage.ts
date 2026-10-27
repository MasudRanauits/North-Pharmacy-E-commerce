import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly freeDeliveryMessage: Locator;
  readonly heroSlider: Locator;
  readonly heroPrev: Locator;
  readonly heroNext: Locator;
  readonly heroPause: Locator;
  readonly heroDots: Locator;
  readonly departmentSection: Locator;
  readonly productCards: Locator;
  readonly brandStrip: Locator;
  readonly brandLogos: Locator;
  readonly hotlineLink: Locator;

  constructor(page: Page) {
    super(page);
    this.freeDeliveryMessage = page.locator('.topbar');
    this.heroSlider = page.locator('.hero, [class*="hero"]').first();
    this.heroPrev = page.getByRole('button', { name: 'Previous slide' });
    this.heroNext = page.getByRole('button', { name: 'Next slide' });
    this.heroPause = page.getByRole('button', { name: /Pause slideshow|Play slideshow/ });
    this.heroDots = page.locator('button.hero-dot');
    this.departmentSection = page.locator('.navlinks');
    this.productCards = page.locator('.pcard');
    this.brandStrip = page.locator('a[href^="/shop?mfr="]');
    this.brandLogos = page.locator('a[href^="/shop?mfr="] img');
    this.hotlineLink = page.locator('a[href^="tel:"]');
  }

  async open() {
    await this.goto('/');
  }

  /** The current hero slide index, read from the active dot. */
  async activeSlideIndex(): Promise<number> {
    const count = await this.heroDots.count();
    for (let i = 0; i < count; i++) {
      const cls = (await this.heroDots.nth(i).getAttribute('class')) ?? '';
      if (cls.includes('on')) return i;
    }
    return -1;
  }

  async isSliderPaused(): Promise<boolean> {
    const label = (await this.heroPause.getAttribute('aria-label')) ?? '';
    return /Play slideshow/i.test(label);
  }
}
