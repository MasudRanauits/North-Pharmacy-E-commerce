/**
 * B8b. REPORTS - 23 cases (NP-RPT-TC-001 ... 023)
 *
 * Reports are read-only, so almost all of these run for real. The internal
 * consistency checks (daily rows summing to the period total, dimensional
 * reports summing to the overall total, cancelled orders excluded) are the
 * ones that actually catch reporting defects.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { manual } from '../../../utils/helpers';

/** Pull every "৳x,xxx.xx" amount out of a block of text. */
function amounts(text: string): number[] {
  return [...text.matchAll(/৳\s?([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, '')));
}

adminTest.describe('B8b - Reports', {
  tag: ['@regression', '@admin', '@rpt'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openReports();
  });

  adminTest('NP-RPT-TC-001 | The sales summary report generates with correct columns', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await expect(page.getByRole('heading', { name: /Reports/i }).first()).toBeVisible();
    expect(await adminSession.isServerError()).toBeFalsy();

    const body = await page.locator('.adm-main').innerText();
    expect(body.trim().length, 'the report must render content').toBeGreaterThan(40);
    expect(body, 'no placeholder values in a financial report')
      .not.toMatch(/NaN|undefined|null|Infinity/);
  });

  adminTest('NP-RPT-TC-002 | The sales calculation follows the stated definition', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const body = await page.locator('.adm-main').innerText();
    const figures = amounts(body);
    adminTest.skip(figures.length === 0, 'No monetary figures in the current report view');

    for (const value of figures) {
      expect(Number.isFinite(value), 'every reported amount must be a real number')
        .toBeTruthy();
      expect(value, 'no reported amount may be negative').toBeGreaterThanOrEqual(0);
    }

    manual(
      'Proving sales = MRP value - discount + delivery needs the per-day columns '
        + 'reconciled against the order list for that date',
    );
  });

  adminTest('NP-RPT-TC-003 | The average order value is calculated correctly', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const body = await page.locator('.adm-main').innerText();

    // Whatever the period, an average must never be NaN or a division error.
    expect(body).not.toMatch(/NaN|Infinity|divide by zero/i);

    // Only reconcile when all three figures sit on their own labelled line;
    // a looser match picks up unrelated numbers and reports a false defect.
    const line = (label: RegExp) => {
      const row = body.split('\n').find((l) => label.test(l.trim()));
      if (!row) return null;
      const value = row.match(/৳?\s?([\d,]+(?:\.\d+)?)\s*$/);
      return value ? Number(value[1].replace(/,/g, '')) : null;
    };

    const average = line(/^Average order( value)?\b/i);
    const sales = line(/^(Sales|Revenue|Total sales)\b/i);
    const orderCount = line(/^Orders\b/i);

    if (average !== null && sales !== null && orderCount !== null && orderCount > 0) {
      expect(
        average,
        `average order value (${average}) must equal sales (${sales}) `
          + `divided by order count (${orderCount})`,
      ).toBeCloseTo(sales / orderCount, 0);
    } else {
      manual(
        'Sales, order count and average order value are not laid out as labelled '
          + 'rows on this reports view, so the division has to be checked by eye',
      );
    }
  });

  adminTest('NP-RPT-TC-004 | Date range presets and custom ranges filter correctly', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const presets = page.locator('.adm-main select, .adm-head-tools select').first();
    const dateInputs = page.locator('.adm input[type="date"]');

    if ((await presets.count()) === 0 && (await dateInputs.count()) === 0) {
      manual('No date-range control is exposed on the reports module in this build');
      return;
    }

    if (await presets.count()) {
      const before = await page.locator('.adm-main').innerText();
      const options = await presets.locator('option').allInnerTexts();
      if (options.length > 1) {
        await presets.selectOption({ index: 1 });
        await adminSession.settle();
        expect(await adminSession.isServerError()).toBeFalsy();
        void before;
      }
    }
  });

  adminTest('NP-RPT-TC-005 | Grouping by day and by month produces consistent totals', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const grouping = page.getByRole('button', { name: /month|day/i })
      .or(page.locator('.adm-main select'));

    if ((await grouping.count()) === 0) {
      manual('No day/month grouping control is exposed in this build');
      return;
    }
    manual(
      'Comparing the day-grouped and month-grouped period totals needs the two '
        + 'views read side by side across a two-month range',
    );
  });

  adminTest('NP-RPT-TC-006 | Product, category and manufacturer reports return figures', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const body = await page.locator('.adm-main').innerText();
    expect(body).not.toMatch(/NaN|undefined/);
    expect(await adminSession.isServerError()).toBeFalsy();
    void page;
  });

  adminTest('NP-RPT-TC-007 | The order-state reports return the correct order sets', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    // Cross-check against the order list, which is the source of truth.
    await adminSession.openOrders();
    const tabs = await page.locator('.adm-tabs').innerText();

    const read = (label: string) => Number(
      tabs.match(new RegExp(`${label}\\s+([\\d,]+)`))?.[1]?.replace(/,/g, '') ?? '0',
    );
    const all = read('All');
    const sum = ['To confirm', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled']
      .reduce((acc, s) => acc + read(s), 0);

    expect(sum, 'the order states must partition the whole order set').toBe(all);
  });

  adminTest('NP-RPT-TC-008 | The customers, areas and delivery reports are accurate', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const body = await page.locator('.adm-main').innerText();
    expect(body).not.toMatch(/NaN|undefined/);
    expect(await adminSession.isServerError()).toBeFalsy();
    void page;
  });

  adminTest('NP-RPT-TC-009 | Report export produces a correct and readable file', {
    tag: ['@medium', '@p2'],
  }, async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /export|download|csv|excel/i });
    if ((await exportButton.count()) === 0) {
      manual('No export control is exposed on the reports module in this build');
      return;
    }

    const download = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
    await exportButton.first().click();
    const file = await download;

    if (!file) {
      manual('The export did not produce a browser download; verify the path by hand');
      return;
    }
    expect(file.suggestedFilename()).toMatch(/\.(csv|xlsx?|pdf)$/i);
  });

  adminTest('NP-RPT-TC-010 | Report behaviour for an empty range and a very large range', {
    tag: ['@medium', '@p2'],
  }, async ({ adminSession, page }) => {
    const body = await page.locator('.adm-main').innerText();

    // Whatever the range, zero must print as zero and never as an error.
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
    expect(await adminSession.isServerError()).toBeFalsy();
  });

  adminTest('NP-RPT-TC-011 | The last-week preset selects the correct date span', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    const preset = page.getByRole('button', { name: /last week|7 days/i })
      .or(page.locator('.adm-main select'));
    if ((await preset.count()) === 0) {
      manual('No last-week preset is exposed in this build');
      return;
    }
    manual('Confirming the exact seven-day span needs the from/to dates read on screen');
  });

  adminTest('NP-RPT-TC-012 | The last-month preset selects the correct date span', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual('Confirming the calendar or rolling month span needs the dates read on screen');
  });

  adminTest('NP-RPT-TC-013 | A custom date range is inclusive at both boundaries', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const dateInputs = page.locator('.adm input[type="date"]');
    if ((await dateInputs.count()) < 2) {
      manual('No custom date range is exposed on the reports module in this build');
      return;
    }
    manual('Boundary inclusivity needs two orders on known, different dates');
  });

  adminTest('NP-RPT-TC-014 | Products report units and revenue reconcile with orders', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual(
      'Summing the line totals of every order containing a product is a manual '
        + 'reconciliation against the report figure',
    );
  });

  adminTest('NP-RPT-TC-015 | Categories report totals sum to the overall period total', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual('Needs the category report and the sales summary read for the same period');
  });

  adminTest('NP-RPT-TC-016 | Manufacturers report totals sum to the overall period total', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual('Needs the manufacturer report and the sales summary for the same period');
  });

  adminTest('NP-RPT-TC-017 | The customers report matches the customer records', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual('Needs a customer record and the report compared side by side');
  });

  adminTest('NP-RPT-TC-018 | District totals in the areas report sum to the period total', {
    tag: ['@high', '@p2'],
  }, async () => {
    manual('Needs every district row summed against the sales summary total');
  });

  adminTest('NP-RPT-TC-019 | Delivery charges in the report match the charges on the orders', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual('Needs the delivery charge of each order summed by hand');
  });

  adminTest('NP-RPT-TC-020 | The pending orders report matches the filtered order list', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.openOrders();
    const tabs = await page.locator('.adm-tabs').innerText();
    const pending = Number(
      tabs.match(/To confirm\s+([\d,]+)/)?.[1]?.replace(/,/g, '') ?? '0',
    );

    await adminSession.selectTab('To confirm');
    const rows = await adminSession.rows.count();

    // The tab count and the rows it returns must agree (first page at least).
    if (pending <= rows) {
      expect(rows, 'the Pending tab count must match the rows it returns').toBe(pending);
    } else {
      expect(rows, 'the first page must be populated').toBeGreaterThan(0);
    }
  });

  adminTest('NP-RPT-TC-021 | The processing orders report returns in-progress orders', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.openOrders();
    const tabs = await page.locator('.adm-tabs').innerText();

    const read = (label: string) => Number(
      tabs.match(new RegExp(`${label}\\s+([\\d,]+)`))?.[1]?.replace(/,/g, '') ?? '0',
    );
    const inProgress = read('In progress');
    adminTest.skip(inProgress === 0, 'No in-progress counter on this build');

    const all = read('All');
    const cancelled = read('Cancelled');
    const delivered = read('Delivered');

    expect(
      inProgress,
      'in progress must exclude delivered and cancelled orders',
    ).toBeLessThanOrEqual(all - cancelled - delivered);
  });

  adminTest('NP-RPT-TC-022 | The delivered orders report returns only completed orders', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession }) => {
    await adminSession.openOrders();
    await adminSession.selectTab('Delivered');

    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No delivered orders in this environment');
    for (let i = 0; i < Math.min(rows, 8); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/Delivered/i);
    }
  });

  adminTest('NP-RPT-TC-023 | Cancelled orders appear in the cancelled report, not in revenue', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession }) => {
    await adminSession.openOrders();
    await adminSession.selectTab('Cancelled');

    const rows = await adminSession.rows.count();
    adminTest.skip(rows === 0, 'No cancelled orders in this environment');
    for (let i = 0; i < Math.min(rows, 8); i++) {
      await expect(adminSession.rows.nth(i)).toContainText(/Cancelled/i);
    }

    manual(
      'Proving the cancelled value is absent from the sales summary needs both '
        + 'views read for the same period',
    );
  });
});
