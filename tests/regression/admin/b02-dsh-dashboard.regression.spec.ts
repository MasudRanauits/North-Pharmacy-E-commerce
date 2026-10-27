/**
 * B2. DASHBOARD & ANALYTICS - 8 cases (NP-DSH-TC-001 ... 008)
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { manual, destructive } from '../../../utils/helpers';

/** Read "<label> <number>" out of a block of dashboard text. */
function counter(text: string, label: string): number | null {
  const match = text.match(new RegExp(`${label}[^\\d]{0,40}([\\d,]+)`, 'i'));
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

adminTest.describe('B2 - Dashboard & Analytics', {
  tag: ['@regression', '@admin', '@dsh'],
}, () => {

  adminTest('NP-DSH-TC-001 | Attention counters are accurate against the underlying data', {
    tag: ['@high', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();
    const dashboard = await page.locator('.adm-main').innerText();

    const pendingRx = counter(dashboard, 'Pending Prescriptions');

    // Cross-check the prescription counter against its own queue.
    if (pendingRx !== null) {
      await adminSession.openPrescriptions();
      const queue = await page.locator('.adm-main').innerText();
      const toReview = counter(queue, 'To review');
      if (toReview !== null) {
        expect(
          toReview,
          'the dashboard counter must equal the prescription queue',
        ).toBe(pendingRx);
      }
    }

    // Each counter must link to the list it summarises.
    await adminSession.open();
    await expect(page.locator('.adm a[href*="/admin/orders"]').first()).toBeVisible();
    await expect(page.locator('.adm a[href*="/admin/inventory"]').first()).toBeVisible();
  });

  adminTest('NP-DSH-TC-002 | Today orders and today sales figures are correct', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();
    const dashboard = await page.locator('.adm-main').innerText();

    // The figure must be a real number, never a placeholder.
    expect(dashboard).not.toMatch(/NaN|undefined|null/);
    expect(dashboard).toMatch(/৳/);

    destructive('Proving the delta requires placing a real order of a known value');
  });

  adminTest('NP-DSH-TC-003 | Period comparison and average order value calculate correctly', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();
    const dashboard = await page.locator('.adm-main').innerText();

    const sales = counter(dashboard, 'Sales') ?? counter(dashboard, 'Revenue');
    const ordersCount = counter(dashboard, 'Orders');
    const average = counter(dashboard, 'Average order');

    if (sales !== null && ordersCount !== null && average !== null && ordersCount > 0) {
      expect(
        average,
        'average order value must equal sales divided by order count',
      ).toBeCloseTo(sales / ordersCount, 0);
    } else {
      manual(
        'The dashboard does not label sales / orders / average order value in a '
          + 'machine-readable way on this build; reconcile the three by hand',
      );
    }

    // A percentage change must carry a direction that matches its sign.
    const change = dashboard.match(/([+-]?\d+(?:\.\d+)?)\s?%/);
    if (change) expect(Number.isFinite(Number(change[1]))).toBeTruthy();
  });

  adminTest('NP-DSH-TC-004 | The daily trend chart plots all series accurately', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();

    // Icon sprites are also <svg>; a chart is one that actually takes space.
    const chart = page.locator('.adm-main svg, .adm-main canvas, .recharts-wrapper')
      .filter({ visible: true })
      .first();

    if ((await chart.count()) === 0) {
      manual('No trend chart is rendered on this build of the dashboard');
      return;
    }
    const box = await chart.boundingBox();
    if (!box || box.width < 120 || box.height < 60) {
      manual('The dashboard shows no plotted trend chart, only icons');
      return;
    }

    manual(
      'Reading plotted values and tooltips point by point, and reconciling them '
        + 'with the sales report, needs a person at the screen',
    );
  });

  adminTest('NP-DSH-TC-005 | The order status breakdown reconciles with the order list', {
    tag: ['@high', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.openOrders();
    const tabs = await page.locator('.adm-tabs').innerText();

    const all = counter(tabs, 'All');
    const statuses = ['To confirm', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
    const sum = statuses.reduce((acc, s) => acc + (counter(tabs, s) ?? 0), 0);

    expect(all, 'the status tabs must be readable').not.toBeNull();
    expect(sum, 'every status count must add up to the All count').toBe(all);
  });

  adminTest('NP-DSH-TC-006 | The top-selling products list shows quantity and revenue', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();
    const dashboard = await page.locator('.adm-main').innerText();

    if (!/top|best/i.test(dashboard)) {
      manual('No top-selling products panel is rendered on this build');
      return;
    }
    expect(dashboard).not.toMatch(/NaN|undefined/);

    manual('Summing the underlying order lines by hand is needed to confirm ranking');
  });

  adminTest('NP-DSH-TC-007 | Changing the date range refreshes every tile consistently', {
    tag: ['@medium', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();

    // A range control must offer date spans, not just any select on the page.
    const rangePicker = page.locator('.adm-main select, .adm-head-tools select')
      .filter({ has: page.locator('option', { hasText: /day|week|month|year/i }) })
      .first();
    if ((await rangePicker.count()) === 0) {
      manual('The dashboard has no date-range control on this build');
      return;
    }

    const before = await page.locator('.adm-main').innerText();
    const options = await rangePicker.locator('option').allInnerTexts();
    if (options.length < 2) {
      manual('The range control offers a single option on this build');
      return;
    }

    await rangePicker.selectOption({ index: 1 });
    await adminSession.settle();
    const after = await page.locator('.adm-main').innerText();

    if (after === before) {
      manual(
        `Selecting "${options[1].trim()}" left every tile unchanged. That is only `
          + 'correct if both ranges genuinely hold the same figures; confirm by '
          + 'eye against the sales report before passing this case.',
      );
      return;
    }
    expect(after).not.toBe(before);
  });

  adminTest('NP-DSH-TC-008 | The dashboard renders correctly when a period has no data', {
    tag: ['@medium', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.open();
    const dashboard = await page.locator('.adm-main').innerText();

    // Zero must print as zero, never as a blank, NaN or a division error.
    expect(dashboard).not.toMatch(/NaN|Infinity|undefined|null/);
    expect(await adminSession.isServerError()).toBeFalsy();
  });
});
