# North Pharmacy — Playwright Test Automation

Automation of **NP-QA-TC-001 v1.3** (434 test cases, 32 modules) for the North
Pharmacy customer website and admin dashboard, built with
[Playwright](https://playwright.dev) + TypeScript using the Page Object Model.

Every test case ID in the test case document exists in this suite, split into
the three suites the QA process runs:

| Suite | Folder | Cases | What it is for |
|---|---|---|---|
| **Smoke** | `tests/smoke/` | 41 | The critical build-verification subset. Fast, read-only, run on every build. |
| **Regression** | `tests/regression/` | 424 | Every case in the document **except** the end-to-end scenarios. |
| **E2E** | `tests/E2E/` | 10 | Part C only — `NP-E2E-TC-001 … 010`, the cross-application journeys. |

Smoke re-uses case IDs from regression on purpose: it is a subset, not extra
coverage.

## Folder structure

```
tests/
├── smoke/                              41 critical cases
│   ├── 01-storefront.smoke.spec.ts
│   ├── 02-catalogue-cart.smoke.spec.ts
│   ├── 03-auth-account.smoke.spec.ts
│   └── 04-admin.smoke.spec.ts
│
├── regression/
│   ├── customer/        Part A — 180 cases (a01…a14, one file per module)
│   ├── admin/           Part B — 196 cases (b01…b10)
│   └── cross-cutting/   Part D —  48 cases (d01…d04)
│
├── E2E/
│   └── np-e2e-scenarios.e2e.spec.ts    Part C — 10 cases
│
├── api/                                request-level tests
└── auth.setup.ts                       optional shared-session setup

pages/        Page Objects — selectors live only here
fixtures/     test / customerTest / adminTest + upload fixtures in files/
utils/        helpers, manual() and destructive() markers
data/         testData.ts — section 2.6 reference data, routes, breakpoints
```

Each regression file maps to one module of the document and names every case
in its title, so a failure reads as `NP-CHK-TC-004 | …` and can be recorded
straight into the Actual Result column.

## Setup

```bash
npm install
npx playwright install
```

## Running

```bash
npm run test:smoke          # 41 critical cases, ~4 minutes
npm run test:regression     # all 424 non-E2E cases
npm run test:e2e            # the 10 end-to-end scenarios
npm test                    # everything on chromium

npm run test:customer       # Part A only
npm run test:admin          # Part B only
npm run test:crosscutting   # Part D only

npm run test:p1             # every P1 case, per section 7.2 execution order
npm run test:critical       # every Critical severity case
npm run report              # open the HTML report
```

Tags are on every case, so the document's priority order is directly runnable:

```bash
npx playwright test --grep @p1        # run first — blocks release
npx playwright test --grep @p2
npx playwright test --grep @critical
npx playwright test --grep @orm       # one module
```

## Environment

`baseURL` defaults to the IP test host and is overridable:

```bash
BASE_URL=$BASE_URL npm run test:smoke
```

Credentials come from `TEST_USER` / `TEST_PASSWORD` / `ADMIN_USER` /
`ADMIN_PASSWORD`, falling back to the shared QA accounts in
[data/testData.ts](data/testData.ts). Put real values in CI secrets.

The self-signed certificate on the IP host is accepted via
`ignoreHTTPSErrors`, per standing pre-condition 2.5 — it is an environment
artefact, not a defect.

### Why one worker

`workers: 1` in [playwright.config.ts](playwright.config.ts) is deliberate.
The environment issues **one** shared QA customer and **one** administrator, so
parallel workers fight over a single cart, wishlist and session, and rapid
concurrent logins trip the brute-force throttle that NP-LOG-TC-010 asserts.
Give each worker its own account before raising this.

Sessions are cached per worker in `playwright/.auth/` for 20 minutes so the
suite logs in about twice instead of 400+ times.

## Gated cases

Three markers keep a shared environment usable. All of them still appear in
the report with their reason, so the 434-case coverage map stays complete.

**`destructive(...)`** — the case writes real data: placing orders, changing
stock or prices, editing store settings, deciding prescriptions, deleting
records. The target is a UAT server, so **these run by default**; the
annotation is what identifies them in the report.

Opt out when the target environment’s data has to survive the run:

```bash
# bash / Git Bash
SKIP_DESTRUCTIVE=1 npx playwright test --project=chromium
```

```powershell
# PowerShell
$env:SKIP_DESTRUCTIVE = "1"; npx playwright test --project=chromium
Remove-Item Env:SKIP_DESTRUCTIVE
```

After a full destructive run on UAT, reseed the data in section 2.6.

**`manual(...)`** — the case cannot be judged by a machine: prescription
legibility, Bangla glyph shaping, reading an SMS reset code, physical-device
camera uploads, print layout. The annotation names exactly what a person has to
do.

**`blocked(...)`** — the feature the case covers is switched off or broken, so
the case cannot run. Maps to the Blocked status in section 7.2. All eight
password-recovery cases are currently Blocked; see [DEFECTS.md](DEFECTS.md).

`NP-LOG-TC-010` (login throttling) locks the shared account for the lockout
window, so it stays opt-in and separate: `RUN_THROTTLE=1 npx playwright test
--grep @throttle` (PowerShell: `$env:RUN_THROTTLE = "1"`), run alone.

## Cross-browser

Part D cases are written once and executed per project:

```bash
npx playwright test tests/regression/cross-cutting --project=chromium
npx playwright test tests/regression/cross-cutting --project=firefox
npx playwright test tests/regression/cross-cutting --project=mobile-chrome
npx playwright test tests/regression/cross-cutting --project=mobile-safari
```

Chromium covers Chrome and Edge (same engine); a real Edge pass and a physical
iPhone pass are still required and are marked `manual()`.

## Defects found

Six issues were found while building this suite, including product detail
pages returning HTTP 502 and a reviewed prescription still being rejectable.
They are written up with reproduction steps in [DEFECTS.md](DEFECTS.md),
which also records the current pass/fail baseline.

## Adding a case

1. Add or extend a Page Object in [pages/](pages/) — selectors live only there.
2. Put data in [data/testData.ts](data/testData.ts), not in the spec.
3. Create the test in the file for its module, titled
   `NP-<MODULE>-TC-<NNN> | <what it verifies>`.
4. Tag it with severity and priority: `{ tag: ['@critical', '@p1'] }`.
5. Use `customerTest` or `adminTest` when the case needs a signed-in session.

```ts
import { customerTest, expect } from '../../../fixtures/test-fixtures';

customerTest('NP-CRT-TC-099 | Example', { tag: ['@high', '@p2'] },
  async ({ cartPage }) => {
    await cartPage.open();
    await expect(cartPage.heading).toBeVisible();
  });
```
