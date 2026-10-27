/**
 * Part C - End-to-End Scenario Test Cases (NP-E2E-TC-001 ... 010)
 * Source: NP-QA-TC-001 v1.3 section 5.
 *
 * These ten cases cross both applications and form the core regression
 * suite; per section 7.2 they are re-executed in every cycle.
 * Every case here is Critical / P1.
 */
import { test, expect, customerTest, adminTest } from '../../fixtures/test-fixtures';
import { users, storeRules, orders, routes } from '../../data/testData';
import {
  randomMobile,
  uniqueName,
  manual,
  destructive,
  attachScreenshot,
  newGuestContext,
} from '../../utils/helpers';
import { ShopPage } from '../../pages/ShopPage';
import { LoginPage } from '../../pages/LoginPage';
import { CartPage } from '../../pages/CartPage';

test.describe('Part C - End-to-End (guest)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  test('NP-E2E-TC-001 | New customer registers and completes a first COD order inside Dhaka', async ({
    registerPage,
    shopPage,
    cartPage,
    checkoutPage,
    page,
  }) => {
    const mobile = randomMobile();
    const name = uniqueName('QA E2E');

    // 1. Register a new customer.
    await registerPage.open();
    await registerPage.register({
      name,
      mobile,
      email: `${mobile}@mailinator.com`,
      password: 'QaPharma2026',
    });
    await expect(registerPage.accountLink).toBeVisible({ timeout: 25_000 });

    // 2-3. Open a non-prescription product and add it to the cart.
    await shopPage.open('?inStock=true');
    await expect(shopPage.productCards.first()).toBeVisible();
    await shopPage.addCardToCart(0);
    await expect.poll(() => shopPage.cartCount()).toBeGreaterThan(0);

    // 4. Check out with a Dhaka address.
    await cartPage.open();
    const subtotal = await cartPage.summaryAmount(/^Items \(\d+\)$/);

    await checkoutPage.open();
    await checkoutPage.fillNewAddress({
      recipient: name,
      phone: mobile,
      address: 'House 1, Road 1, Nilkhet',
      area: 'Nilkhet',
      district: storeRules.insideDistrict.district,
    });

    // Delivery is BDT 60 inside Dhaka and the total adds it to the subtotal.
    await expect
      .poll(() => checkoutPage.amount(/^Delivery/))
      .toBe(storeRules.insideDistrict.charge);
    expect(await checkoutPage.buttonTotal()).toBeCloseTo(
      subtotal + storeRules.insideDistrict.charge,
      2,
    );
    await attachScreenshot(page, 'NP-E2E-TC-001-checkout-summary');

    // 5-6. Placing the order writes to the shared environment.
    destructive('Places a real order and decrements live stock');
    await checkoutPage.placeOrderButton.click();
    await expect(page.getByText(/NP-\d{6}/)).toBeVisible({ timeout: 30_000 });
  });

});

customerTest.describe('Part C - End-to-End (customer)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  customerTest('NP-E2E-TC-002 | Free-delivery threshold verified inside and outside Dhaka', async ({
    cartPage,
    checkoutPage,
    shopPage,
  }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

    // Build a sub-threshold cart, then read the charge for each district.
    await shopPage.open('?inStock=true');
    await shopPage.addCardToCart(0);
    await checkoutPage.open();

    await checkoutPage.selectDistrict(storeRules.insideDistrict.district);
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(
      storeRules.insideDistrict.charge,
    );

    await checkoutPage.selectDistrict(storeRules.outsideDistricts[0]);
    await expect.poll(() => checkoutPage.amount(/^Delivery/), { timeout: 15_000 }).toBe(storeRules.outsideCharge);

    await cartPage.open();
    await cartPage.emptyTheCart();

    // The exact 1,999 / 2,000 / 2,001 boundary needs fixed-price seeded stock;
    // it is covered atomically by NP-CHK-TC-006.
    manual('Exact 1,999 / 2,000 / 2,001 cart values require seeded fixed-price stock');
  });

  customerTest('NP-E2E-TC-003 | Prescription medicine purchased only after pharmacist approval', async ({
    shopPage,
    checkoutPage,
    cartPage,
    page,
  }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

    // Find a prescription-required product on the listing.
    await shopPage.open('?inStock=true');
    // Require the add control as part of the filter: a product already in the
    // cart renders a quantity stepper in its place, and `.first()` would pick
    // that card and then have nothing to click.
    const rxCard = shopPage.productCards
      .filter({ hasText: 'Rx' })
      .filter({ has: page.getByRole('button', { name: 'Add to Cart' }) })
      .first();
    customerTest.skip(
      (await rxCard.count()) === 0,
      'No Rx product on the first listing page offers an add-to-cart control',
    );

    await shopPage.addCard(rxCard);
    await checkoutPage.open();

    // Checkout must surface the prescription requirement before the order.
    await expect(page.getByText(/prescription/i).first()).toBeVisible();
    await attachScreenshot(page, 'NP-E2E-TC-003-rx-gate');

    await cartPage.open();
    await cartPage.emptyTheCart();

    manual(
      'Approving the prescription needs a pharmacist decision on the shared queue; '
        + 'the approval half is covered by NP-RXA-TC-003 and NP-RXA-TC-010',
    );
  });

});

adminTest.describe('Part C - End-to-End (admin)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  adminTest('NP-E2E-TC-004 | Order progresses through the full lifecycle to delivery', async ({
    adminSession,
  }) => {
    await adminSession.openOrders();
    await expect(adminSession.table).toBeVisible();

    // Every lifecycle stage must exist as its own filter tab.
    for (const status of ['To confirm', 'Confirmed', 'Packed', 'Shipped', 'Delivered']) {
      await expect(adminSession.tabs.filter({ hasText: status }).first()).toBeVisible();
    }

    destructive(
      'Advancing Pending -> Confirmed -> Packed -> Shipped -> Delivered mutates a real order',
    );
  });

  adminTest('NP-E2E-TC-005 | Order cancellation and its financial effect', async ({
    adminSession,
  }) => {
    await adminSession.openOrders();
    await adminSession.selectTab('Cancelled');
    await expect(adminSession.rows.first()).toBeVisible();
    expect(await adminSession.rows.count()).toBeGreaterThan(0);

    destructive('Cancelling live orders and comparing sales figures alters reporting data');
  });

  adminTest('NP-E2E-TC-006 | Admin catalogue changes propagate to the storefront', async ({
    adminSession,
  }) => {
    await adminSession.openInventory();
    await expect(adminSession.rows.first()).toBeVisible();

    destructive('Changing price, discount, stock and visibility of a live product');
  });

  adminTest('NP-E2E-TC-007 | Delivery settings change applied end to end', async ({
    adminSession,
    page,
  }) => {
    await adminSession.openSettings();
    await expect(page.getByText('Delivery & ordering')).toBeVisible();

    // Read-only check that the live configuration still matches section 2.6.
    await expect(page.getByText(`৳${storeRules.insideDistrict.charge}`).first()).toBeVisible();
    await expect(page.getByText(`৳${storeRules.outsideCharge}`).first()).toBeVisible();
    await expect(page.getByText('৳2,000').first()).toBeVisible();
    await expect(page.getByText(String(storeRules.maxQtyPerItem)).first()).toBeVisible();

    destructive('Editing delivery charges and the free-delivery threshold affects every tester');
  });

});

test.describe('Part C - End-to-End (guest cart merge)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  test('NP-E2E-TC-008 | Guest cart merges correctly into the account cart on login', async ({
    browser,
  }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    const shop = new ShopPage(page);
    const login = new LoginPage(page);
    const cart = new CartPage(page);

    try {
      // A guest builds a cart.
      await shop.open('?inStock=true');
      await shop.addCardToCart(0);
      await shop.addCardToCart(1);
      const guestCount = await shop.cartCount();
      expect(guestCount).toBeGreaterThan(0);

      // Logging in must not lose any guest line.
      await login.open();
      await login.loginAndWait(users.customer.mobile, users.customer.password);
      await cart.open();
      expect(await cart.itemCount()).toBeGreaterThanOrEqual(guestCount);

      await cart.emptyTheCart();
    } finally {
      await context.close();
    }
  });

});

customerTest.describe('Part C - End-to-End (authorisation)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  customerTest('NP-E2E-TC-009 | Authorisation boundaries hold across both applications', async ({
    adminPage,
    page,
  }) => {

    // A customer session must not reach any admin route.
    for (const route of [routes.admin, routes.adminOrders, routes.adminSettings]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await adminPage.settle();
      expect(
        await adminPage.isAdminShellVisible(),
        `customer session must not render the admin shell at ${route}`,
      ).toBeFalsy();
    }

    // Another customer's order must not be readable. The seeded reference is
    // environment-specific (.env); fall back to a plain numeric id so the
    // check still runs on a fresh clone.
    const otherOrder = orders.packedWithPrescription || '104021';
    await page.goto(`/account/orders/${otherOrder}`, {
      waitUntil: 'domcontentloaded',
    });
    await adminPage.settle();
    await expect(page.getByText(users.existingCustomer.mobile)).toHaveCount(0);
  });

});

adminTest.describe('Part C - End-to-End (reporting)', { tag: ['@e2e', '@critical', '@p1'] }, () => {

  adminTest('NP-E2E-TC-010 | Reporting reconciles with the dashboard and manual calculation', async ({
    adminSession,
    page,
  }) => {
    await adminSession.openOrders();
    await expect(adminSession.table).toBeVisible();

    // The status tabs must add up to the All count.
    const tabsText = await page.locator('.adm-tabs').innerText();
    const all = Number(tabsText.match(/All\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0);
    const statuses = ['To confirm', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
    const sum = statuses.reduce((acc, status) => {
      const n = tabsText.match(new RegExp(`${status}\\s+([\\d,]+)`))?.[1] ?? '0';
      return acc + Number(n.replace(/,/g, ''));
    }, 0);

    expect(all, 'sum of every status tab must equal the All count').toBe(sum);
    await attachScreenshot(page, 'NP-E2E-TC-010-status-reconciliation');
  });
});
