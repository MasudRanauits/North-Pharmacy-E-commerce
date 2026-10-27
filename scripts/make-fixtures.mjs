/**
 * Regenerate the large binary fixtures the suite needs.
 *
 * `fixtures/files/oversized-9mb.jpg` is deliberately not committed — it is
 * 9 MB of padding and would bloat every clone — but NP-RXU-TC-003 needs it to
 * prove the upload size limit is enforced. Run this once after cloning:
 *
 *   node scripts/make-fixtures.mjs
 *
 * The file is a real JPEG with zero padding appended after the end-of-image
 * marker, so it is a valid image that is simply too big.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const filesDir = path.join(here, '..', 'fixtures', 'files');
const source = path.join(filesDir, 'prescription.jpg');
const target = path.join(filesDir, 'oversized-9mb.jpg');
const TARGET_BYTES = 9 * 1024 * 1024;

if (!fs.existsSync(source)) {
  console.error(`Missing ${source} — it should be committed. Nothing to pad.`);
  process.exit(1);
}

const base = fs.readFileSync(source);
if (base.length >= TARGET_BYTES) {
  console.error('prescription.jpg is already larger than the target size.');
  process.exit(1);
}

const padding = Buffer.alloc(TARGET_BYTES - base.length, 0);
fs.writeFileSync(target, Buffer.concat([base, padding]));

const mb = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`Wrote ${path.relative(process.cwd(), target)} (${mb} MB)`);
