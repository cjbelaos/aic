# Continuous Agreement Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Continuous" agreement type: no end date, never auto-expires, no paperwork needed, always billable while Active.

**Architecture:** `AgreementType` gains `"Continuous"`, stored in the existing sheet column D with a blank EndDate. Small helpers in `src/lib/contractStatus.ts` decide paperwork/readiness; the ledger treats a blank end date as open-ended; the service-invoice picker switches to `effectiveContractStatus`. The contracts page renders it.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routes), TypeScript, Google Sheets storage, node:assert script tests.

**Spec:** `docs/superpowers/specs/2026-11-25-continuous-agreement-type-design.md`

## Global Constraints
- Agreement type values: exactly `"Contract" | "PO" | "Continuous"`.
- Continuous contracts store `endDate: ""`. Contract/PO still require an end date.
- UI copy: term end reads `Ongoing`; paperwork reads `Not required`; badge reads `Continuous`.
- No new sheet columns.

## Review Focus
- Editing an existing Contract into Continuous must save a blank end date (not keep the old one) — Task 5 manual check.
- Editing Continuous back to Contract with no end date is rejected (client) and by the API when `endDate: ""` is sent with Contract/PO — Task 2 test.
- A Continuous contract stored with status Expired (Saint Margaret today) stays Expired until the user changes it; it is not silently revived — Task 1 test.
- A Continuous contract with a One-Time entitlement yields exactly one period, not an endless run — Task 3 test.
- Paperwork "Pending" filter must not list Continuous contracts — Task 5 (uses `paperworkPending` from Task 1).

---

### Task 1: Domain helpers

**Files:**
- Modify: `src/types/contract.ts:2` (AgreementType), `src/types/contract-release.ts:75`
- Modify: `src/lib/contractStatus.ts`
- Test: `scripts/test-contract-lifecycle.cjs`, `scripts/test-contract-notes.cjs` (contractReady block ~L86)

**Interfaces:**
- Produces:
  - `isContinuous(c: Pick<Contract, "agreementType">): boolean`
  - `paperworkPending(c: Pick<Contract, "status" | "endDate" | "paperworkStatus" | "agreementType">, today?: string): boolean` — Active (effective) and not Continuous and paperwork ≠ Complete.
  - `contractReady(c: Pick<Contract, "status" | "endDate" | "paperworkStatus" | "agreementType">, today?)` — Active and (Continuous or paperwork Complete).
  - `contractRowClass` — Active Continuous → green class.
  - contract-release `agreementType` type becomes `Contract["agreementType"]`.

- [ ] **Step 1: Failing tests** (append to lifecycle main, before PASS log)
```js
const { isContinuous, paperworkPending } = load("src/lib/contractStatus.ts");
const cont = { status: "Active", endDate: "", paperworkStatus: "Pending", agreementType: "Continuous" };
assert.equal(isContinuous(cont), true);
assert.equal(effectiveContractStatus(cont, "2099-01-01"), "Active");
assert.equal(effectiveContractStatus({ ...cont, status: "Expired" }, "2026-11-25"), "Expired");
assert.equal(paperworkPending(cont, "2026-11-25"), false);
assert.equal(paperworkPending({ ...cont, agreementType: "Contract", endDate: "2099-01-01" }, "2026-11-25"), true);
assert.match(contractRowClass(cont), /green/);
```
In test-contract-notes.cjs add: `assert.equal(contractReady({ status: "Active", paperworkStatus: "Pending", endDate: "", agreementType: "Continuous" }, "2026-10-29"), true);`
- [ ] **Step 2:** `npm run test:contracts` → FAIL (`isContinuous is not a function`).
- [ ] **Step 3:** Implement the interfaces above.
- [ ] **Step 4:** `npm run test:contracts` → all PASS.
- [ ] **Step 5:** Commit `feat(contracts): add Continuous agreement type helpers`.

### Task 2: API validation

**Files:**
- Modify: `src/app/api/contracts/route.ts:56-73` (POST), `src/app/api/contracts/[id]/route.ts:57-71` (PUT)
- Test: `scripts/test-contract-lifecycle.cjs` (API block ~L62-72)

**Interfaces:** Consumes nothing new.

Rules: `agreementType` (when present) must be one of the three values → else 400 `"Agreement type must be Contract, PO, or Continuous."`. POST: end date required unless Continuous (keep message `"End date is required."`); for Continuous, store `endDate: ""` whatever was sent. PUT: if `agreementType` is Contract/PO and `endDate === ""` → 400 `"End date is required."`; if `agreementType === "Continuous"`, force `endDate: ""`.

- [ ] **Step 1: Failing tests**
```js
assert.equal((await create(request({ ...base, agreementType: "Continuous", endDate: "" }))).status, 201);
assert.equal((await create(request({ ...base, endDate: "" }))).status, 400);
assert.equal((await create(request({ ...base, agreementType: "Lease" }))).status, 400);
const put = (b) => update(request(b), { params: Promise.resolve({ id: "CTR-1" }) });
assert.equal((await put({ agreementType: "Contract", endDate: "" })).status, 400);
assert.equal((await put({ agreementType: "Continuous", endDate: "2027-01-01" })).status, 200); // and saved endDate is ""
```
Capture the saved payload in the `updateContractInSheets` mock to assert `endDate === ""`. Adjust the `writes` counter assertion if it counts these.
- [ ] **Step 2:** `npm run test:contracts` → FAIL.
- [ ] **Step 3:** Implement the rules.
- [ ] **Step 4:** `npm run test:contracts` → PASS.
- [ ] **Step 5:** Commit `feat(contracts): accept Continuous agreements without an end date`.

### Task 3: Open-ended entitlement ledger

**Files:**
- Modify: `src/lib/contractReleases/ledger.ts:40-70` (`generatePeriods`)
- Test: `scripts/contract-release-tests/ledger-test.ts`

Approach: when `endDate === ""`, treat end as `"9999-12-31"` (const `OPEN_END`) so `limit` = today; One-Time still yields one period. Non-blank invalid end dates still return `[]`.

- [ ] **Step 1: Failing tests**
```ts
assert.equal(generatePeriods("Monthly", "2026-09-21", "", "2026-11-25").length, 3); // Sep, Oct, Nov
assert.equal(generatePeriods("One-Time", "2026-09-21", "", "2026-11-25").length, 1);
assert.deepEqual(generatePeriods("Monthly", "2026-09-21", "bad", "2026-11-25"), []);
```
- [ ] **Step 2:** `npm run test:contract-releases` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:contract-releases` → PASS.
- [ ] **Step 5:** Commit `feat(contract-releases): run Continuous entitlement periods up to today`.

### Task 4: Service invoice contract picker

**Files:**
- Modify: `src/lib/serviceInvoiceBilling.ts:25-27`, `src/app/dashboard/service-invoices/service-invoices-client.tsx:132`
- Test: `scripts/test-service-invoice-billing.cjs`

Both filters use `effectiveContractStatus(c) === "Active"` instead of `c.status === "Active"` (import from `./contractStatus` / `@/lib/contractStatus`). Note the billing test's loader stubs `@/` imports, so `serviceInvoiceBilling.ts` must import it relatively.

- [ ] **Step 1: Failing tests**
```js
assert.equal(resolve([release], [{ ...contract, endDate: "2000-01-01" }]), undefined, "Date-expired contracts are not billed");
assert.equal(resolve([release], [{ ...contract, endDate: "", agreementType: "Continuous" }])?.id, contract.id, "Continuous contracts stay billable");
```
- [ ] **Step 2:** `npm run test:service-invoice-billing` → first assertion FAILS.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:contracts` → PASS.
- [ ] **Step 5:** Commit `fix(service-invoices): list contracts by effective status`.

### Task 5: Customer contracts page

**Files:**
- Modify: `src/app/dashboard/customer-contracts/page.tsx`

**Interfaces:** Consumes `isContinuous`, `paperworkPending` (Task 1).

- `AGREEMENT_TYPE_OPTIONS` (L78) adds `"Continuous"`.
- Form: when Continuous, hide End date, Paperwork Status, and Notarized fields; skip the end-date required check (L625); send `endDate: ""` on create and update (L660-760). Switching away from Continuous with no end date shows the existing end-date-required error.
- `ContractClientName` (L238): use `paperworkPending(contract, today)`.
- `ContractTerm` (L253): end shows `Ongoing` when Continuous; "Ends in…" only for non-Continuous; "Ended N days ago" only when `daysLeft < 0` (fixes "-300 days").
- Paperwork column (L394-400) and view dialog (L942): `Not required` for Continuous; view dialog End Date (L938) `Ongoing`.
- Paperwork filter (L335): Continuous rows match neither Pending nor Complete.
- Export (L129-131): End Date `Ongoing`, Paperwork `Not required` for Continuous.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npx tsc --noEmit` and `npx eslint src/app/dashboard/customer-contracts/page.tsx` → no errors.
- [ ] **Step 3:** Manual check in the running app: create a Continuous contract (no end date field, row shows `– Ongoing`, no amber tag, Paperwork `Not required`); edit an existing Contract to Continuous and confirm the sheet end date is blank; edit back to Contract without an end date → blocked; Paperwork "Pending" filter excludes it; it appears in the service invoice PMS contract dropdown.
- [ ] **Step 4:** `npm run test:contracts && npm run test:contract-releases` → PASS.
- [ ] **Step 5:** Commit `feat(customer-contracts): Continuous agreements in form, list, and export`.
