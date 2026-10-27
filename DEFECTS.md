# Defects found while automating NP-QA-TC-001 v1.3

Found against `$BASE_URL/` on 24 October 2026 while building
the suite. Each one is reproduced by a named test case, so re-running that case
is the retest.

Severity is taken from the test case document; it is the starting assessment,
per section 7.2.

---

## 1. Product detail pages return HTTP 502 — Critical, P1

**Case:** `NP-PDP-TC-001` (and the whole A4 module, plus `NP-SRC-TC-004`)
**Reproduce:** `npx playwright test --grep @pdp`

Every `/p/:id/:slug` route answers with the IIS gateway error document instead
of the product:

```
502 - Web server received an invalid response while acting as a gateway or proxy server.
```

Confirmed on several products (`napa-500-mg-tablet`,
`ceevit-250-mg-tablet`, `merobac-1-gm-injection`) and on repeated requests. The
rest of the site is up: listing, cart, checkout, account and the whole admin
area all respond normally.

**Impact.** A customer can browse and search but cannot open any product. The
listing card is the only place price, stock state and the prescription badge
can be read. The whole of module A4 (21 cases) depends on this route.

**Note.** Home-page product links point at these routes, so `NP-CNT-TC-008`
("no broken links") also reports them.

---

## 2. Admin product search cannot find products by brand name — High, P2

**Case:** `NP-PRD-TC-023`, also `NP-PRD-TC-011`
**Reproduce:** `npx playwright test --grep @prd`

Searching the admin inventory list returns nothing for brand names that exist
in the catalogue, while the customer-facing search finds them:

| Search term | Admin inventory | Customer catalogue |
|---|---|---|
| `Napa` | **0 results** | 24 products |
| `Dps` | **0 results** | present (section 2.6 reference product) |
| `Paracetamol` | 10 results | 24 products |
| `Merobac` | 1 result | present |

Generic names work; these brand names do not. NP-PRD-TC-023 requires the admin
result count to be "accurate and consistent with the customer catalogue".

**Impact.** An administrator cannot locate stock by the name printed on the
box, which is how the reference data in section 2.6 names products.

---

## 3. A long search term breaks the results page layout — Low, P3

**Case:** `NP-SRC-TC-010`
**Reproduce:** `npx playwright test --grep @src`

A 500-character search term is echoed into the results heading
("Results for “aaa…”") without wrapping or truncation. The page grows to
8,839 px wide against a 1,600 px viewport — roughly 7,200 px of horizontal
overflow — and the whole page scrolls sideways.

The case allows either truncation at a sensible limit or graceful acceptance;
neither happens.

---

## 4. "In stock" badge fails the AA contrast minimum — High, P2

**Case:** `NP-ACS-TC-006`
**Reproduce:** `npx playwright test --grep @acs`

The stock label is `rgb(27, 148, 102)` on white, measured at **3.84:1**. WCAG
AA requires 4.5:1 for normal text. Measured from computed styles, with
gradients resolved to their first colour stop.

**Impact.** The test plan calls out elderly and low-vision customers as a
primary audience, and stock state decides whether an order can be placed.

---

## 5. Mobile touch targets below the 44×44 minimum — High, P2

**Case:** `NP-ACS-TC-010`
**Reproduce:** `npx playwright test --grep @acs`

At a 360 px viewport, 34 interactive controls are smaller than 44 × 44 CSS px,
including:

| Control | Size |
|---|---|
| Login / Register | 20 × 20 |
| Wishlist | 26 × 20 |
| Cart | 27 × 21 |
| Wishlist heart on each card | 30 × 30 |
| Add to Cart / Order Now | 135 × 36 |

Mobile is the dominant channel for this product.

---

## 6. A reviewed prescription can still be rejected — Critical, P1

**Case:** `NP-RXA-TC-014`
**Reproduce:** `npx playwright test --grep @rxa`

Open any prescription in the **Approved** tab of `/admin/prescriptions`:

| Control | State |
|---|---|
| Approve | disabled (correct) |
| **Reject** | **enabled** |

So a decision that has already been made can be reversed from the interface.
NP-RXA-TC-014 requires that review controls are "absent or disabled on an
already-reviewed record" and that "the original decision and its audit entry
are preserved".

**Impact.** A prescription a pharmacist already approved — possibly with an
order released against it — can be flipped to Rejected by a second
administrator with no conflict check. This is the pharmacist-sign-off audit
trail the whole Rx control depends on.

Related: `NP-RXA-TC-017` (two administrators reviewing concurrently) was gated
out of earlier runs and has not been exercised; it is likely affected by the
same missing guard. It now runs with the rest of the destructive set on UAT.

---

## 7. Online password reset is switched off — Blocked, not a defect to fix blind

**Cases:** `NP-FGT-TC-001` … `008`
**Reproduce:** `npx playwright test --grep @fgt`

The reset page states "Online reset isn't available right now. Please call our
hotline and we'll help you reset your password." and the **Send code** button
is permanently disabled, so no code can be issued.

The suite treats the eight A9 cases as **Blocked** with that reason rather than
failed, and asserts the one thing that is testable: the unavailability is
stated clearly, the hotline is offered, and nothing can be submitted.

**Action needed:** confirm with the business whether this is intentional for
this build. If it is, the A9 cases stay Blocked for this cycle. If not, it is a
Critical gap — a customer who forgets their password has no self-service route.

---

## Environment notes (not defects)

- **`/admin/dashboard` is a 404.** The dashboard is served at `/admin`.
  `NP-SEC-TC-004` names `/admin/dashboard`; the suite checks `/admin` and the
  other admin routes instead. Worth correcting in the document.
- **No "Member since" date** on the account overview, which `NP-ACC-TC-013`
  expects. Flagged in the case rather than failed.
- **No terms checkbox** on the registration form, which `NP-REG-TC-012`
  expects. Flagged in the case.
- **Destructive actions use `window.confirm`.** Automation must accept the
  native dialog or the action is silently cancelled; `BasePage.acceptNextConfirm()`
  handles this.
- **The self-signed certificate** on the IP host is an environment artefact per
  standing pre-condition 2.5, handled by `ignoreHTTPSErrors`.

---

## Suite baseline

Full run, `npx playwright test --project=chromium`, 26 Oct 2026 — 477 tests in
35 spec files, 1.0 h on one worker:

| Result | Count |
|---|---|
| Passed | 249 |
| Failed | 17 — 13 defects above, 4 automation-side (fixed after the run) |
| Skipped | 207 — `manual()`, `destructive()` and `blocked()` cases |
| Flaky | 4 — pass on retry |

The 13 product failures map to: the `/p/*` 502 (6 cases plus the broken-link
case), the two admin-search cases, the prescription re-review case, the two
accessibility cases and the long-search layout break. All 13 were re-run
individually on 26 Oct and still reproduce. They are written up with evidence
in `North-Pharmacy-Bug-Report.pdf`.

The other 4 (`NP-CRT-TC-005/006/007`, `NP-PDP-TC-015`) were the suite's own
fault and are fixed and verified passing — see below.

## Automation defects fixed in this cycle

These were failures of the suite, not of the product. Recorded because the
failure signatures are misleading and will recur if the fixes are reverted.

- **Cart writes were aborted in flight.** Signed in, the cart is server-side:
  the header badge updates optimistically while `PUT /api/cart/items/:id` is
  still outstanding, so returning on the badge let a test navigate away and
  kill the request — the trace showed status `-1` and the cart arriving empty
  at checkout. `ShopPage` and `CartPage` now wait for the write. A guest cart
  is held entirely in the browser and issues no request at all, so both gate
  on the *request* going out before waiting for a response.
- **Auth state was keyed on `workerIndex`.** Playwright starts a fresh worker
  after any failing test, so the key never repeated, every restart missed the
  cache and paid a cold sign-in that did not fit the fixture budget. Keyed on
  `parallelIndex` now, which the replacement worker reuses.
- **`selectTab` returned before the list swapped.** `waitForRows` only counts
  `table.adm-table` rows and is blind to the card layouts, so the Approved tab
  could be reported selected above four Pending cards. `waitForPanel` settles
  on rendered text instead.
- **`loginAndWait` retried into a redirect.** When the header was slow, it
  re-opened `/login` — which this build redirects for a visitor who already
  has a session, so the form never appeared and a successful login was
  reported as "the sign-in form never rendered at /admin". It now checks
  whether it is already signed in before retrying.
