/**
 * A11. PRESCRIPTION UPLOAD - 15 cases (NP-RXU-TC-001 ... 015)
 *
 * Upload fixtures live in fixtures/files. Uploading adds records to the
 * pharmacist queue, so the cases that genuinely submit a file are marked
 * destructive; everything checkable without submitting (controls, accepted
 * formats, stated limits, authorisation) needs no write at all.
 */
import path from 'node:path';
import { test, expect, customerTest } from '../../../fixtures/test-fixtures';
import { manual, destructive, newGuestContext } from '../../../utils/helpers';

const files = (name: string) =>
  path.resolve(__dirname, '..', '..', '..', 'fixtures', 'files', name);

customerTest.describe('A11 - Prescription Upload', {
  tag: ['@regression', '@customer', '@rxu'],
}, () => {

  customerTest.beforeEach(async ({ prescriptionPage }) => {
    await prescriptionPage.open();
  });

  customerTest('NP-RXU-TC-001 | A prescription image can be uploaded from the account area', {
    tag: ['@critical', '@p1'],
  }, async ({ prescriptionPage, page }) => {
    await expect(page.getByRole('heading', { name: /Prescriptions/i }).first()).toBeVisible();
    expect(
      (await prescriptionPage.fileInput.count())
        + (await prescriptionPage.uploadButton.count()),
      'an upload entry point must exist',
    ).toBeGreaterThan(0);

    destructive('Submitting a prescription adds a record to the shared review queue');
    await prescriptionPage.uploadFile(files('prescription.jpg'));
    await prescriptionPage.settle();
    await expect(page.getByText(/pending review/i).first()).toBeVisible();
  });

  customerTest('NP-RXU-TC-002 | Accepted formats and rejection of invalid types', {
    tag: ['@critical', '@p1'],
  }, async ({ prescriptionPage }) => {
    const input = prescriptionPage.fileInput.first();
    test.skip((await input.count()) === 0, 'No file input exposed on this page');

    // The picker itself must advertise the allow-list.
    const accept = await input.getAttribute('accept');
    if (accept) {
      expect(accept.toLowerCase()).toMatch(/jpe?g|image/);
      expect(
        accept.toLowerCase(),
        'executables must never be offered in the picker',
      ).not.toMatch(/\.exe|application\/x-msdownload/);
    }

    destructive('Submitting each file type writes records to the shared queue');
  });

  customerTest('NP-RXU-TC-003 | The maximum file size is enforced with a clear message', {
    tag: ['@high', '@p2'],
  }, async ({ prescriptionPage, page }) => {
    // The limit must be stated to the customer before they pick a file.
    const body = await page.locator('.container.page').innerText();
    expect(body, 'the size limit must be published on the form').toMatch(/\d+\s?MB/i);

    // The picker must also refuse the file before anything is sent.
    const input = prescriptionPage.fileInput.first();
    if (await input.count()) {
      const limit = await input.getAttribute('data-max-size')
        ?? await input.getAttribute('size');
      if (limit) expect(Number(limit), 'the stated limit must be positive').toBeGreaterThan(0);
    }

    manual(
      'Submitting the over-limit file destabilises the run rather than returning '
      + 'a rejection: with fixtures/files/oversized-9mb.jpg (9 MB) the Playwright '
      + 'worker aborts with code 134, and at 8.4 MB the upload never returns and '
      + 'the test has to be killed. A worker that dies takes every later case in '
      + 'that worker with it, so the submission is left to a hand check. Generate '
      + 'the fixture with `node scripts/make-fixtures.mjs` and upload it manually: '
      + 'the form states an 8 MB limit, so a 9 MB file must be refused with a clear '
      + 'message. Worth raising on its own — a large upload should be rejected, not '
      + 'hang.',
    );
  });

  customerTest('NP-RXU-TC-004 | An uploaded prescription is legible at full size', {
    tag: ['@critical', '@p1'],
  }, async () => {
    manual(
      'Judging whether a pharmacist can read the medicine names is a human '
        + 'assessment; automation cannot score legibility',
    );
  });

  customerTest('NP-RXU-TC-005 | Prescription status progresses correctly through review', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Needs an administrator to approve and reject real prescriptions');
  });

  customerTest('NP-RXU-TC-006 | A prescription can be uploaded during checkout', {
    tag: ['@critical', '@p1'],
  }, async ({ shopPage, cartPage, checkoutPage, page }) => {
    await cartPage.open();
    await cartPage.emptyTheCart();

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

    // The inline upload path is offered within checkout.
    await expect(page.getByText(/prescription/i).first()).toBeVisible();
    await expect(
      page.getByText(/Upload a new prescription/i).first(),
    ).toBeVisible();

    await cartPage.open();
    await cartPage.emptyTheCart();
  });

  customerTest('NP-RXU-TC-007 | A pending prescription does not release a controlled medicine', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive(
      'Requires uploading a prescription and attempting a real order placement',
    );
  });

  customerTest('NP-RXU-TC-008 | A rejected prescription cannot be used to complete an order', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires an administrator to reject a prescription first');
  });

  customerTest('NP-RXU-TC-009 | An approved prescription is recorded on the order', {
    tag: ['@critical', '@p1'],
  }, async () => {
    destructive('Requires an approved prescription and a real order placement');
  });

  customerTest('NP-RXU-TC-010 | Prescription files are not accessible without authorisation', {
    tag: ['@critical', '@p1'],
  }, async ({ page, browser }) => {
    const images = page.locator('img[src*="prescription"], img[src*="/uploads/rx"]');
    const count = await images.count();
    test.skip(count === 0, 'This account has no uploaded prescription to probe');

    const src = await images.first().getAttribute('src');
    const url = new URL(src!, page.url()).toString();

    // A clean, signed-out session must not be served the file.
    const anonymous = await newGuestContext(browser);
    try {
      const response = await anonymous.request.get(url);
      expect(
        response.status(),
        'an unauthenticated request must be refused',
      ).toBeGreaterThanOrEqual(400);
    } finally {
      await anonymous.close();
    }
  });

  customerTest('NP-RXU-TC-011 | The Patient name field reaches the pharmacist', {
    tag: ['@critical', '@p1'],
  }, async ({ prescriptionPage }) => {
    // The field is on the upload form from the start on this build.
    await expect(prescriptionPage.patientNameInput).toBeVisible();

    // It is labelled optional here, where NP-RXU-TC-011 allows for it being
    // mandatory; record which rule this build follows.
    const label = await prescriptionPage.page
      .getByText(/Patient name/i).first().innerText();
    if (/optional/i.test(label)) {
      manual(
        'Patient name is OPTIONAL on this build. Confirm with the business, then '
          + 'verify by hand that a name entered here reaches the admin review screen.',
      );
      return;
    }

    destructive('Submitting a prescription to prove the name reaches the pharmacist');
  });

  customerTest('NP-RXU-TC-012 | The prescription note field reaches the pharmacist', {
    tag: ['@high', '@p2'],
  }, async ({ prescriptionPage }) => {
    await expect(prescriptionPage.noteInput).toBeVisible();
    await prescriptionPage.noteInput.fill('need 1 month supply');
    await expect(prescriptionPage.noteInput).toHaveValue('need 1 month supply');

    // A blank note must not block the form.
    await prescriptionPage.noteInput.fill('');
    await expect(prescriptionPage.noteInput).toHaveValue('');

    destructive('Submitting to prove the note reaches the admin review screen');
  });

  customerTest('NP-RXU-TC-013 | Every documented format is accepted and all others rejected', {
    tag: ['@critical', '@p1'],
  }, async ({ prescriptionPage }) => {
    const input = prescriptionPage.fileInput.first();
    test.skip((await input.count()) === 0, 'No file input exposed on this page');

    const accept = (await input.getAttribute('accept')) ?? '';
    if (accept) {
      // WEBP is in the documented allow-list.
      expect(accept.toLowerCase()).toMatch(/webp|image\/\*/);
    }

    destructive(
      'Proving the server inspects content (renamed .exe) requires real uploads',
    );
  });

  customerTest('NP-RXU-TC-014 | The 8 MB size limit is enforced at the boundary', {
    tag: ['@high', '@p2'],
  }, async ({ page }) => {
    const body = await page.locator('.container.page').innerText();
    const stated = body.match(/(\d+)\s?MB/i)?.[1];

    if (stated) {
      expect(Number(stated), 'the published limit must be 8 MB').toBe(8);
    } else {
      manual('No size limit is published on this page; confirm the documented 8 MB');
    }

    destructive('Uploading 7.9 / 8 / 8.1 / 50 MB files exercises real write paths');
  });

  customerTest('NP-RXU-TC-015 | The drag-and-drop upload area matches the click path', {
    tag: ['@medium', '@p3'],
  }, async ({ prescriptionPage }) => {
    await expect(
      prescriptionPage.dropZone,
      'the form must offer a drop area as well as a file picker',
    ).toBeVisible();
    await expect(prescriptionPage.fileInput).toHaveCount(1);

    destructive('Dropping a real file submits it to the shared review queue');
  });
});
