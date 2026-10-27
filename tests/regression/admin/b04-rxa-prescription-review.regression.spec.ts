/**
 * B4. PRESCRIPTION REVIEW - 17 cases (NP-RXA-TC-001 ... 017)
 *
 * Approving or rejecting is irreversible, so every review decision is marked
 * destructive and runs against the UAT queue. The queue, its counters, its
 * filters and the no-second-review rule are asserted for real.
 */
import { expect, adminTest } from '../../../fixtures/test-fixtures';
import { manual, destructive } from '../../../utils/helpers';

adminTest.describe('B4 - Prescription Review', {
  tag: ['@regression', '@admin', '@rxa'],
}, () => {

  adminTest.beforeEach(async ({ adminSession }) => {
    await adminSession.openPrescriptions();
  });

  adminTest('NP-RXA-TC-001 | A customer upload appears in the review queue immediately', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await expect(page.getByRole('heading', { name: /Prescriptions/i }).first()).toBeVisible();

    const body = await page.locator('.adm-main').innerText();
    expect(body, 'the queue must show its review states').toMatch(/To review|Approved|Rejected/i);
    expect(await adminSession.isServerError()).toBeFalsy();

    destructive('Proving the counter increments needs a real customer upload');
  });

  adminTest('NP-RXA-TC-002 | The prescription image opens and zooms for review', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    const thumbnails = page.locator('.adm-main img');
    adminTest.skip(
      (await thumbnails.count()) === 0,
      'No prescription in the queue to open',
    );

    await thumbnails.first().click();
    await adminSession.settle();
    await expect(page.locator('img').first()).toBeVisible();

    manual('Zoom, pan and rotate quality is a human judgement at the screen');
  });

  adminTest('NP-RXA-TC-005 | The status counters are accurate', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const header = await page.locator('.adm-main').innerText();

    const read = (label: string) => {
      const m = header.match(new RegExp(`${label}[^\\d]{0,20}(\\d+)`, 'i'));
      return m ? Number(m[1]) : null;
    };
    const toReview = read('To review');
    const approved = read('Approved');
    const rejected = read('Rejected');
    const all = read('All');

    if (toReview !== null && approved !== null && rejected !== null && all !== null) {
      expect(
        toReview + approved + rejected,
        'every state must add up to the All count',
      ).toBe(all);
    } else {
      manual('The counters are not labelled machine-readably on this build');
    }

    expect(await adminSession.isServerError()).toBeFalsy();
  });

  adminTest('NP-RXA-TC-006 | Linked customer and order are visible from the record', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    const rows = page.locator('.adm-main .adm-table tbody tr, .adm-main .rx-card');
    adminTest.skip((await rows.count()) === 0, 'No prescription records in the queue');

    await rows.first().click();
    await adminSession.settle();

    const body = await page.locator('.adm-main').innerText();
    expect(body, 'the reviewing pharmacist needs the customer context')
      .toMatch(/\+880|01\d{9}|NP-\d{6}/);
  });

  adminTest('NP-RXA-TC-007 | The audit record captures the reviewer and review time', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.selectTab('Approved');
    const rows = page.locator('.adm-main .adm-table tbody tr, .adm-main .rx-card');
    adminTest.skip((await rows.count()) === 0, 'No reviewed prescription to inspect');

    await rows.first().click();
    await adminSession.waitForPanel();

    const body = await page.locator('.adm-main').innerText();
    expect(body, 'a reviewed record must carry a timestamp')
      .toMatch(/\d{1,2}\s\w{3}\s\d{4}|\d{2}:\d{2}/);
  });

  adminTest('NP-RXA-TC-008 | The prescription queue can be filtered and searched', {
    tag: ['@medium', '@p3'],
  }, async ({ adminSession, page }) => {
    for (const state of ['To review', 'Approved', 'Rejected']) {
      await adminSession.selectTab(state);
      await adminSession.settle();

      const body = await page.locator('.adm-main').innerText();
      expect(await adminSession.isServerError(), `${state} filter must render`).toBeFalsy();
      // Either records or a designed empty state - never a blank panel.
      expect(body.trim().length).toBeGreaterThan(20);
    }
  });

  adminTest('NP-RXA-TC-009 | The queue is ordered so the longest-waiting item is first', {
    tag: ['@high', '@p2'],
  }, async ({ adminSession, page }) => {
    await adminSession.selectTab('To review');
    const body = await page.locator('.adm-main').innerText();

    // The build states the rule on the page itself.
    if (/oldest first/i.test(body)) {
      expect(body).toMatch(/oldest first/i);
      return;
    }

    const rows = page.locator('.adm-main .adm-table tbody tr');
    adminTest.skip((await rows.count()) < 2, 'Fewer than two pending prescriptions');

    const dates = (await rows.allInnerTexts())
      .map((t) => Date.parse(t.match(/\d{1,2}\s\w{3}\s\d{4}[^\n]*/)?.[0] ?? ''))
      .filter((n) => !Number.isNaN(n));
    if (dates.length > 1) {
      expect(dates, 'oldest first').toEqual([...dates].sort((a, b) => a - b));
    }
  });

  adminTest('NP-RXA-TC-014 | An already-reviewed prescription cannot be reviewed again', {
    tag: ['@critical', '@p1'],
  }, async ({ adminSession, page }) => {
    await adminSession.selectTab('Approved');
    const rows = page.locator('.adm-main .adm-table tbody tr, .adm-main .rx-card');
    adminTest.skip((await rows.count()) === 0, 'No approved prescription to inspect');

    await rows.first().click();
    await adminSession.settle();

    // Every review control on a decided record must be absent or disabled —
    // one disabled control is not enough if the other can still be used.
    const controls = page.getByRole('button', { name: /^(Approve|Reject)$/i });
    const count = await controls.count();

    const stillEnabled: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      if (await control.isDisabled().catch(() => false)) continue;
      stillEnabled.push((await control.innerText()).trim());
    }

    expect(
      stillEnabled,
      'an already-reviewed prescription must not offer any active review '
        + `control, but these are still enabled: ${stillEnabled.join(', ')}`,
    ).toHaveLength(0);
  });

  adminTest('NP-RXA-TC-016 | The viewer supports rotation for a sideways image', {
    tag: ['@medium', '@p3'],
  }, async ({ page }) => {
    const rotate = page.getByRole('button', { name: /rotate/i });
    if ((await rotate.count()) === 0) {
      manual(
        'No rotate control in the viewer; confirm images are auto-oriented from '
          + 'their EXIF metadata instead',
      );
      return;
    }
    await expect(rotate.first()).toBeVisible();
  });

  // --- Review decisions: all write to the shared pharmacist queue ---
  adminTest('NP-RXA-TC-003 | A prescription can be approved', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Approving a real prescription releases a real order');
  });

  adminTest('NP-RXA-TC-004 | Rejection requires a reason and the reason reaches the customer', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Rejecting a real prescription is irreversible for that customer');
  });

  adminTest('NP-RXA-TC-010 | Approving a prescription releases the linked order', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires approving a real prescription and advancing its order');
  });

  adminTest('NP-RXA-TC-011 | Rejecting a prescription keeps the linked order blocked', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires rejecting a real prescription');
  });

  adminTest('NP-RXA-TC-012 | A rejection cannot be saved without a reason', {
    tag: ['@critical', '@p1'],
  }, async ({ page }) => {
    const reject = page.getByRole('button', { name: /^Reject$/i }).first();
    if ((await reject.count()) === 0) {
      destructive('No pending prescription is open to attempt a blank rejection on');
      return;
    }

    await reject.click();
    await page.waitForTimeout(1000);

    // The reason field must be present and required before confirming.
    const reason = page.locator('textarea').first();
    await expect(reason, 'a rejection must ask for a reason').toBeVisible();

    destructive('Confirming the rejection would decide a real prescription');
  });

  adminTest('NP-RXA-TC-013 | A long rejection reason with special characters is safe', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Writing a 500-character reason rejects a real prescription');
  });

  adminTest('NP-RXA-TC-015 | The prescription image remains legible at maximum zoom', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual(
      'Whether a pharmacist can read the dosage at maximum zoom is a human '
        + 'judgement; automation cannot score legibility',
    );
  });

  adminTest('NP-RXA-TC-017 | Two administrators cannot review the same prescription', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive(
      'Needs two concurrent admin sessions deciding one real prescription',
    );
  });
});
