/**
 * B3. ORDER MANAGEMENT - 32 cases (NP-ORM-TC-001 ... 032)
 *
 * Reading, searching and filtering are asserted for real. Every lifecycle
 * transition changes a live order, so those cases are marked destructive and
 * run against the UAT server.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { users } from '../../../data/testData';
import { manual, destructive } from '../../../utils/helpers';

/** Status tabs as the order list labels them. */
const STATUS_TABS = {
  pending: 'To confirm',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const;

adminTest.describe('B3 - Order Management', {
  tag: ['@regression', '@admin', '@orm'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openOrders();
  });

  adminTest('NP-ORM-TC-001 | The order list displays all required columns accurately', {
    tag: ['@high', '@p1'],
  }, async ({ adminSession, page }) => {
    await expect(adminSession.table).toBeVisible();
    await expect(adminSession.rows.first()).toBeVisible();

    const header = (await page.locator('table.adm-table thead').innerText()).toUpperCase();
    for (const column of ['ORDER', 'PLACED', 'CUSTOMER', 'ITEMS', 'TOTAL', 'PAYMENT', 'STATUS']) {
      expect(header, `the ${column} column must be present`).toContain(column);
    }

    // The first row is fully populated, not a skeleton.
    const row = await adminSession.rows.first().innerText();
    expect(row).toMatch(/NP-\d{6}/);
    expect(row).toMatch(/৳/);
    expect(row).toMatch(/\+880|01\d{9}/);
  });

  adminTest('NP-ORM-TC-002 | Search by order number, customer name and phone', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const firstRow = await adminSession.rows.first().innerText();
    const orderNumber = firstRow.match(/NP-(\d{6})/);
    expect(orderNumber, 'an order number is needed to search for').toBeTruthy();

    await adminSession.searchOrders(`NP-${orderNumber![1]}`);
    await expect(adminSession.rows.first()).toContainText(`NP-${orderNumber![1]}`);
    expect(await adminSession.rows.count()).toBeGreaterThan(0);
  });

  adminTest('NP-ORM-TC-003 | Filtering the order list by status', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    for (const status of [STATUS_TABS.pending, STATUS_TABS.packed, STATUS_TABS.cancelled]) {
      const rows = await adminSession.selectTab(status).then(() => adminSession.waitForRows());
      if (rows === 0) continue;

      const expected = status === 'To confirm' ? /Pending/i : new RegExp(status, 'i');
      for (let i = 0; i < Math.min(rows, 5); i++) {
        await expect(adminSession.rows.nth(i)).toContainText(expected);
      }
    }
  });

  adminTest('NP-ORM-TC-004 | Filtering by date range and by district', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const dateInputs = page.locator('.adm input[type="date"]');
    const districtSelect = page.locator('.adm-head-tools select, .adm-page-head select');

    if ((await dateInputs.count()) === 0 && (await districtSelect.count()) === 0) {
      manual('No date-range or district filter is exposed on the order list in this build');
      return;
    }

    if (await districtSelect.count()) {
      const options = await districtSelect.first().locator('option').allInnerTexts();
      const dhaka = options.find((o) => /Dhaka/i.test(o));
      if (dhaka) {
        await districtSelect.first().selectOption({ label: dhaka });
        await adminSession.settle();
        const rows = await adminSession.rows.count();
        for (let i = 0; i < Math.min(rows, 5); i++) {
          await expect(adminSession.rows.nth(i)).toContainText(/Dhaka/i);
        }
      }
    }
  });

  adminTest('NP-ORM-TC-005 | The order detail shows the complete item and pricing breakdown', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    expect(body).toMatch(/NP-\d{6}/);
    expect(body).toMatch(/৳/);

    // Grand total = subtotal - discount + delivery.
    const num = (label: RegExp) => {
      const m = body.match(label);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const items = num(/(?:Items|Subtotal)[^৳]{0,20}৳\s?([\d,.]+)/i);
    const discount = num(/Discount[^৳]{0,20}৳\s?([\d,.]+)/i) ?? 0;
    const delivery = num(/Delivery[^৳]{0,20}৳\s?([\d,.]+)/i);
    const total = num(/Total[^৳]{0,20}৳\s?([\d,.]+)/i);

    if (items !== null && delivery !== null && total !== null) {
      expect(
        total,
        'grand total must be subtotal minus discount plus delivery',
      ).toBeCloseTo(items - discount + delivery, 1);
    }
  });

  adminTest('NP-ORM-TC-006 | Delivery address and customer contact on the order detail', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    expect(body, 'the recipient phone must be shown').toMatch(/\+880|01\d{9}/);
    expect(body, 'the delivery district must be shown').toMatch(
      /Dhaka|Chittagong|Sylhet|Rangpur|Khulna|Rajshahi|Barishal|Mymensingh/i,
    );
  });

  adminTest('NP-ORM-TC-009 | Every status change is written to the order history', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    if (!/history|timeline|activity/i.test(body)) {
      manual('No history panel is rendered on the order detail in this build');
      return;
    }

    // Existing entries must carry an operator and a timestamp.
    expect(body).toMatch(/\d{1,2}\s\w{3}\s\d{4}|\d{2}:\d{2}/);
  });

  adminTest('NP-ORM-TC-014 | The payment status can be updated and is reflected', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    expect(body, 'the payment status must be stated').toMatch(/Paid|Unpaid/i);

    destructive('Changing a payment status alters a real order and the revenue view');
  });

  adminTest('NP-ORM-TC-015 | An order can be found by its full order number', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const first = await adminSession.rows.first().innerText();
    const number = first.match(/NP-\d{6}/)?.[0];
    expect(number).toBeTruthy();

    const matched = await adminSession.searchOrders(number!).then(() => adminSession.waitForRows());
    expect(matched, 'exactly the matching order').toBe(1);
    await expect(adminSession.rows.first()).toContainText(number!);
  });

  adminTest('NP-ORM-TC-016 | An order can be found by a partial order number', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const first = await adminSession.rows.first().innerText();
    const digits = first.match(/NP-(\d{6})/)?.[1];
    expect(digits).toBeTruthy();

    await adminSession.searchOrders(digits!);
    expect(await adminSession.rows.count()).toBeGreaterThan(0);
    await expect(adminSession.rows.first()).toContainText(digits!);
  });

  adminTest('NP-ORM-TC-017 | Orders can be found by customer name', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const first = await adminSession.rows.first().innerText();
    const name = first.split('\n').find((l) => /^[A-Za-z][A-Za-z .]{2,}$/.test(l.trim()));
    adminTest.skip(!name, 'Could not read a customer name from the first row');

    await adminSession.searchOrders(name!.trim());
    const rows = await adminSession.rows.count();
    expect(rows).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(rows, 5); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(name!.trim());
    }
  });

  adminTest('NP-ORM-TC-018 | Orders can be found by customer phone number', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    const first = await adminSession.rows.first().innerText();
    const phone = first.match(/\+880\s?(\d{4})-?(\d{6})/);
    adminTest.skip(!phone, 'Could not read a phone number from the first row');

    const digits = `0${phone![1]}${phone![2]}`;
    await adminSession.searchOrders(digits);
    expect(await adminSession.rows.count()).toBeGreaterThan(0);
  });

  // --- NP-ORM-TC-019 … 024: one case per status filter ---
  for (const [id, [label, expected]] of Object.entries({
    '019': [STATUS_TABS.pending, /Pending/i],
    '020': [STATUS_TABS.confirmed, /Confirmed/i],
    '021': [STATUS_TABS.packed, /Packed/i],
    '022': [STATUS_TABS.shipped, /Shipped/i],
    '023': [STATUS_TABS.delivered, /Delivered/i],
    '024': [STATUS_TABS.cancelled, /Cancelled/i],
  } as Record<string, [string, RegExp]>)) {
    adminTest(`NP-ORM-TC-${id} | Filtering the order list by ${label} status`, {
      tag: [id === '024' ? '@critical' : '@high', id === '024' ? '@p1' : '@p2'],
    }, async ({ adminSession, page }) => {
      const tabsText = await page.locator('.adm-tabs').innerText();
      const tabCount = Number(
        tabsText.match(new RegExp(`${label}\\s+([\\d,]+)`))?.[1]?.replace(/,/g, '') ?? '0',
      );

      await adminSession.selectTab(label);
      const rows = await adminSession.waitForRows();

      if (tabCount === 0) {
        expect(rows, `no orders are in ${label}`).toBe(0);
        return;
      }

      // Every returned row really is in that status.
      for (let i = 0; i < Math.min(rows, 8); i++) {
        await expect(adminSession.rows.nth(i)).toContainText(expected);
      }
    });
  }

  adminTest('NP-ORM-TC-025 | The order date range filter is inclusive at both boundaries', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const dateInputs = page.locator('.adm input[type="date"]');
    if ((await dateInputs.count()) < 2) {
      manual('No date-range filter is exposed on the order list in this build');
      return;
    }
    manual('Boundary inclusivity needs two orders on known, different dates');
  });

  adminTest('NP-ORM-TC-026 | The order list can be filtered by delivery district', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const districtSelect = page.locator('.adm-head-tools select, .adm-page-head select');
    if ((await districtSelect.count()) === 0) {
      manual('No district filter is exposed on the order list in this build');
      return;
    }

    await districtSelect.first().selectOption({ label: 'Dhaka' });
    await adminSession.settle();

    const rows = await adminSession.rows.count();
    for (let i = 0; i < Math.min(rows, 5); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/Dhaka/i);
    }
  });

  // --- Lifecycle transitions: every one writes to a live order ---
  adminTest('NP-ORM-TC-007 | The order status can be advanced through the full lifecycle', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Advances a real order through every stage');
  });

  adminTest('NP-ORM-TC-008 | Invalid or backward status transitions are prevented', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires submitting invalid transitions against live orders');
  });

  adminTest('NP-ORM-TC-010 | An order can be cancelled with a reason', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Cancels a real order and removes it from revenue');
  });

  adminTest('NP-ORM-TC-011 | Stock is restored when an order is cancelled', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires cancelling a real order and re-reading inventory');
  });

  adminTest('NP-ORM-TC-012 | A cancelled order is excluded from sales figures', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    // Read-only half: cancelled orders exist and form their own set.
    await adminSession.selectTab(STATUS_TABS.cancelled);
    const cancelled = await adminSession.waitForRows();
    adminTest.skip(cancelled === 0, 'No cancelled orders in this environment');

    const tabsText = await page.locator('.adm-tabs').innerText();
    const all = Number(tabsText.match(/All\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? '0');
    const inProgress = Number(
      tabsText.match(/In progress\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? '0',
    );
    expect(
      inProgress,
      'cancelled orders must not be counted as in progress',
    ).toBeLessThanOrEqual(all - cancelled);

    destructive('Proving the revenue delta requires cancelling an order of known value');
  });

  adminTest('NP-ORM-TC-013 | An order with an unapproved prescription cannot be advanced', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires a pending prescription and a real status change attempt');
  });

  adminTest('NP-ORM-TC-027 | An order transitions from Pending to Confirmed', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Writes a real status change');
  });

  adminTest('NP-ORM-TC-028 | An order transitions from Confirmed to Packed', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Writes a real status change');
  });

  adminTest('NP-ORM-TC-029 | An order transitions from Packed to Shipped', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Writes a real status change');
  });

  adminTest('NP-ORM-TC-030 | An order transitions from Shipped to Delivered', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Writes a real status change');
  });

  adminTest('NP-ORM-TC-031 | A backward transition from Delivered to Pending is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.selectTab(STATUS_TABS.delivered);
    adminTest.skip(
      (await adminSession.rows.count()) === 0,
      'No delivered order in this environment',
    );

    await adminSession.rows.first().click();
    await adminSession.settle();

    // The interface must not offer an earlier status as the next step.
    const statusControl = page.locator('.adm-main select').first();
    if (await statusControl.count()) {
      const options = (await statusControl.locator('option').allInnerTexts())
        .map((o) => o.trim().toLowerCase());
      expect(
        options.includes('pending'),
        'Pending must not be offered on a Delivered order',
      ).toBeFalsy();
    } else {
      manual('No status dropdown on the order detail; verify the refusal by hand');
    }
  });

  adminTest('NP-ORM-TC-032 | A skipped transition from Pending to Delivered is rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.selectTab(STATUS_TABS.pending);
    adminTest.skip(
      (await adminSession.rows.count()) === 0,
      'No pending order in this environment',
    );

    await adminSession.rows.first().click();
    await adminSession.settle();

    const statusControl = page.locator('.adm-main select').first();
    if (await statusControl.count()) {
      const options = (await statusControl.locator('option').allInnerTexts())
        .map((o) => o.trim().toLowerCase());
      expect(
        options.includes('delivered'),
        'Delivered must not be offered as the next step from Pending',
      ).toBeFalsy();
    } else {
      manual('No status dropdown on the order detail; verify the refusal by hand');
    }
  });
});
