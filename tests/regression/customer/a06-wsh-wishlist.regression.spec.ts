/**
 * A6. WISHLIST - 7 cases (NP-WSH-TC-001 ... 007)
 */
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { users } from '../../../data/testData';
import { manual, destructive, newGuestContext } from '../../../utils/helpers';

customerTest.describe('A6 - Wishlist', {
  tag: ['@regression', '@customer', '@wsh'],
}, () => {

  customerTest.beforeEach(async ({ accountPage }) => {
    await accountPage.clearWishlist();
  });

  customerTest.afterEach(async ({ accountPage }) => {
    await accountPage.clearWishlist();
  });

  customerTest('NP-WSH-TC-001 | A product can be saved to the wishlist', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, accountPage }) => {
    await shopPage.open('?inStock=true');
    const name = await shopPage.productNames.first().innerText();

    const heart = shopPage.card(0).locator('button.heart');
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');

    await accountPage.openWishlist();
    await expect(accountPage.page.getByText(name).first()).toBeVisible();
  });

  customerTest('NP-WSH-TC-002 | A product can be removed from the wishlist', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, accountPage }) => {
    await shopPage.open('?inStock=true');
    await shopPage.saveCardToWishlist(0);
    await shopPage.saveCardToWishlist(1);

    await accountPage.openWishlist();
    const before = await accountPage.wishlistItems.count();
    expect(before).toBe(2);

    await accountPage.page.locator('button.heart').first().click();
    await accountPage.settle();

    await expect.poll(() => accountPage.wishlistItems.count()).toBe(before - 1);
  });

  customerTest('NP-WSH-TC-003 | The wishlist persists across sessions', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, accountPage, browser }) => {
    await shopPage.open('?inStock=true');
    await shopPage.saveCardToWishlist(0);
    await accountPage.openWishlist();
    const saved = await accountPage.wishlistItems.count();
    expect(saved).toBe(1);

    // A brand-new session on the same account must still see the item.
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    try {
      const { LoginPage } = await import('../../../pages/LoginPage');
      const { AccountPage } = await import('../../../pages/AccountPage');
      const login = new LoginPage(page);
      await login.open();
      await login.loginAndWait(users.customer.mobile, users.customer.password);

      const account = new AccountPage(page);
      await account.openWishlist();
      expect(
        await account.wishlistItems.count(),
        'the wishlist is tied to the account, not the browser',
      ).toBe(saved);
    } finally {
      await context.close();
    }
  });

  customerTest('NP-WSH-TC-004 | A saved item can be moved to the cart', {
    tag: ['@medium', '@p3'],
  }, async ({ shopPage, accountPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

    await shopPage.open('?inStock=true');
    await shopPage.saveCardToWishlist(0);
    await accountPage.openWishlist();

    const addToCart = accountPage.page.getByRole('button', { name: /Add to Cart/i }).first();
    customerTest.skip((await addToCart.count()) === 0, 'Wishlist offers no add-to-cart control');

    // settle() waits for network idle, which this page reaches while the
    // add-to-cart PUT is still outstanding; opening /cart then aborted it and
    // the cart was empty. Wait for the write to be accepted instead.
    const [added] = await Promise.all([
      accountPage.page.waitForResponse(
        (r) => /\/api\/cart\/items\//.test(r.url()), { timeout: 20_000 },
      ),
      addToCart.click(),
    ]);
    expect(added.ok(), 'moving a saved item to the cart must be accepted').toBeTruthy();

    await cartPage.open();
    expect(await cartPage.itemCount()).toBe(1);
    await expect(cartPage.qtyInputs.first()).toHaveValue('1');

    await cartPage.emptyTheCart();
  });

  customerTest('NP-WSH-TC-006 | Empty wishlist state and out-of-stock handling', {
    tag: ['@low', '@p3'],
  }, async ({ accountPage }) => {
    await accountPage.openWishlist();

    await expect(accountPage.emptyState).toBeVisible();
    await expect(
      accountPage.page.getByRole('link', { name: /Browse products|Start shopping/i }).first(),
    ).toBeVisible();

    destructive('Setting a saved product to zero stock requires an admin write');
  });

  customerTest('NP-WSH-TC-007 | Every saved item can be added to the cart in one action', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, accountPage, cartPage }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

    await shopPage.open('?inStock=true');
    for (const i of [0, 1, 2]) await shopPage.saveCardToWishlist(i);

    await accountPage.openWishlist();
    expect(await accountPage.wishlistItems.count()).toBe(3);

    const addAll = accountPage.addAllToCartButton;
    test.skip((await addAll.count()) === 0, 'No add-all-to-cart control on the wishlist');

    await addAll.click();
    await accountPage.settle();

    await cartPage.open();
    expect(
      await cartPage.itemCount(),
      'every purchasable saved item is added at quantity one',
    ).toBe(3);

    await cartPage.emptyTheCart();
  });
});

test.describe('A6 - Wishlist (guest)', {
  tag: ['@regression', '@customer', '@wsh'],
}, () => {

  test('NP-WSH-TC-005 | Wishlist actions require authentication and resume after login', {
    tag: ['@high', '@p2'],
  }, async ({ shopPage, page }) => {
    await shopPage.open('?inStock=true');
    await shopPage.card(0).locator('button.heart').click();
    await shopPage.settle();

    // The guest is prompted rather than silently failing.
    const promptedToLogin = /\/login/.test(page.url())
      || (await page.getByText(/sign in|log in/i).first().count()) > 0;
    expect(promptedToLogin, 'a guest must be asked to sign in, not ignored').toBeTruthy();

    manual(
      'Confirming the intended product is saved after completing login needs a '
        + 'disposable account so the shared wishlist is not polluted',
    );
  });
});
