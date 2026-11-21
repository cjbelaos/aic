# PR Contract Items, Typed Items & Signatories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Purchase Request be for a Sales Order, a Customer Contract, or nothing; fill lines from a contract's still-due items; allow typed (non-catalog) items; drop product codes from the line picker except for duplicate names; print the four-signatory block.

**Architecture:** Extend the existing PR module (`src/lib/purchaseRequests/*`) with a request type and contract reference on the header and a `contractItemId` on lines. Pure rules (line validation, contract due calculation, picker labels, typed-item PO linking) live in pure modules covered by `npm run test:purchase-requests`; service/routes/UI wire them up. Typed items reuse `productNameSnapshot`/`unitSnapshot` with a blank `productId`.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routes), React, TypeScript, Google Sheets via `googleapis`, node:assert test scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-pr-contract-items-design.md` (amends `docs/superpowers/specs/2026-11-21-purchase-request-design.md`)

## Global Constraints

- Request types: `SALES_ORDER` | `CONTRACT` | `NONE`; a blank stored value reads as `SALES_ORDER`.
- Sheets changes are **trailing columns only**: PurchaseRequests T `RequestType`, U `ContractId`, V `ContractNo`; PurchaseRequestItems X `ContractItemId`. Never reorder or clear existing columns/rows.
- Contract eligibility = `effectiveContractStatus(contract) === "Active"` (`src/lib/contractStatus.ts`).
- Add-from-contract qty = `max(0, entitled − released)`; qty already on other PRs is **shown only**, never subtracted.
- Approved-by text exactly: `MAY C. ARQUIZA` / `CHIEF FINANCE OFFICER`; `ENGR. APOLLO M. ARQUIZA` / `CHIEF EXECUTIVE OFFICER`. Caption exactly: `SIGNATURE OVER PRINTED NAME / DESIGNATION / DATE`. Headings: `REQUESTED BY:`, `NOTED BY:`, `REVIEWED BY:`, `APPROVED BY:`.
- The A4 PO print and the shared `.signatures` CSS in `src/components/business-document-print-layout.tsx` must not change.
- Product picker label: `productName`; `productName (productCode)` only when ≥2 active products share the same name (case-insensitive, trimmed). Applies to the PR form line picker only.

## Review Focus

1. **Existing PRs** (blank RequestType, all with a Sales Order) must load, edit, submit and print exactly as before → test in Task 1 (`rowToPr` default) and Task 2 (`validateDraftLine` SO rules unchanged).
2. **Typed PR line pulled into a PO** must save without "product does not match", and two typed lines must not merge into one PO line → tests in Task 2 (`validatePoLinks`, `mergePickedIntoLines`).
3. **Contract item with no period summary yet** (new contract, or Quarterly/Annual items) → due = full entitled; window from frequency → test in Task 3.
4. **Editing a contract PR** must not count its own lines as "already requested" → `excludePrId` test in Task 3.
5. **Switching request type in the form** (e.g. SO → Contract) must clear stale `salesOrderItemId`/`contractItemId` on lines so the server doesn't reject → server-side `validateDraftLine` test in Task 2 + form behaviour in Task 5.

---

### Task 1: Data model — types, sheet columns, setup script

**Files:**
- Modify: `src/types/purchaseRequest.ts`
- Modify: `src/lib/purchaseRequests/sheets.ts`
- Modify: `scripts/setup-purchase-request-sheets.mjs`
- Modify: `scripts/purchase-request-tests/domain-test.ts` (fixtures only)

**Interfaces:**
- Produces:
  - `export type PrRequestType = "SALES_ORDER" | "CONTRACT" | "NONE";`
  - `PurchaseRequest` gains `requestType: PrRequestType; contractId: string; contractNoSnapshot: string;`
  - `PurchaseRequestItem` gains `contractItemId: string;` (typed item ⇔ `productId === ""`)
  - `export function rowToPr(row: unknown[]): PurchaseRequest` and `export function rowToItem(row: unknown[]): PurchaseRequestItem` (exported for tests)

- [ ] **Step 1:** Add the types above. Update the header comment ("raised against Confirmed Sales Orders" → "for a Sales Order, a Customer Contract, or neither").
- [ ] **Step 2:** In `sheets.ts`: append `"RequestType", "ContractId", "ContractNo"` to the PR headers and `"ContractItemId"` to the item headers; ranges `A2:S`→`A2:V`, `A2:W`→`A2:X`; all `:S${n}` → `:V${n}`, `:W${n}` → `:X${n}`, `A:S` → `A:V`; `columnCount: 23` → `24`. `rowToPr` reads `row[19..21]` (unknown/blank type ⇒ `"SALES_ORDER"`); `rowToItem` reads `row[23]`; `prToRow`/`itemToRow` write them. Export `rowToPr`/`rowToItem`. Move them to a new pure file `src/lib/purchaseRequests/rows.ts` (no googleapis import) so the test tsconfig can include it; `sheets.ts` imports from it.
- [ ] **Step 3:** Setup script: replace `NEW_TABS` headers with the new full lists. Change the header check: a mismatch is only an existing **non-empty** cell that differs; empty trailing cells are collected as `missingHeaders: [{ title, fromColumn, headers }]`. With `--apply`, write missing tab(s) as today **and** write missing trailing headers (`values.update` at the first missing column). Report `missingHeaders` in the JSON output.
- [ ] **Step 4:** Update `item()`/`pr()` fixtures in `domain-test.ts` with `contractItemId: ""`, `requestType: "SALES_ORDER"`, `contractId: ""`, `contractNoSnapshot: ""`. Add a `rows-test.ts` (import in `run.ts`; add `../../src/lib/purchaseRequests/rows.ts` to the test tsconfig `include`):

```ts
const legacy = rowToPr(["PR000001", "AIC-PR-2026-0001", "SUBMITTED", "SO1", "AIC-SO-2026-0001"]);
assert.equal(legacy.requestType, "SALES_ORDER");
assert.equal(legacy.contractId, "");
const c = rowToPr([...Array(19).fill(""), "CONTRACT", "CTR-0003", "CTR-0003"].map((v, i) => (i === 0 ? "PR000002" : v)));
assert.equal(c.requestType, "CONTRACT"); assert.equal(c.contractNoSnapshot, "CTR-0003");
assert.equal(rowToItem([...Array(23).fill(""), "CTI-0007"]).contractItemId, "CTI-0007");
```

- [ ] **Step 5:** Run `npm run test:purchase-requests` → `All purchase-request focused tests passed.` Run `npx tsc --noEmit -p .` → no new errors in touched files.
- [ ] **Step 6:** Run `npm run setup:purchase-requests` (audit only) → JSON shows `missingHeaders` for the two tabs, exit 0. **Do not run `--apply` without Chris's OK** (it writes to the live sheet).
- [ ] **Step 7:** Commit `feat(pr): add request type, contract and contract-item columns`.

---

### Task 2: Pure rules — line validation, typed-item PO linking, picker labels

**Files:**
- Modify: `src/lib/purchaseRequests/domain.ts`
- Modify: `scripts/purchase-request-tests/domain-test.ts`, `scripts/purchase-request-tests/merge-test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `export interface DraftLineInput { productId?: string; description?: string; unit?: string; quantity: number; salesOrderItemId?: string; contractItemId?: string; remarks?: string }`
  - `export function validateDraftLine(line: DraftLineInput, index: number, ctx: { requestType: PrRequestType; soItemIds: ReadonlySet<string>; contractItemIds: ReadonlySet<string> }): string | null`
  - `PickedPoLine` becomes `{ productId: string; description: string; unit: string; quantity: number; prLinks: PoLineLinkInput[] }`
  - `export function productPickerLabels(products: { productId: string; productCode: string; productName: string }[]): Map<string, string>`

- [ ] **Step 1: Failing tests** in `domain-test.ts`:

```ts
const ctx = (requestType: PrRequestType) => ({ requestType, soItemIds: new Set(["SOI1"]), contractItemIds: new Set(["CTI1"]) });
assert.equal(validateDraftLine({ productId: "P1", quantity: 1 }, 0, ctx("NONE")), null);
assert.equal(validateDraftLine({ description: "Teflon tape", unit: "roll", quantity: 2 }, 0, ctx("NONE")), null);
assert.match(validateDraftLine({ quantity: 1 }, 0, ctx("NONE"))!, /Line 1: choose a product or type a description/);
assert.match(validateDraftLine({ productId: "P1", quantity: 0 }, 1, ctx("NONE"))!, /Line 2: quantity must be more than zero/);
assert.equal(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI1" }, 0, ctx("SALES_ORDER")), null);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI9" }, 0, ctx("SALES_ORDER"))!, /sales order line it is for was not found/);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI1" }, 0, ctx("CONTRACT"))!, /only on sales order requests/);
assert.equal(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI1" }, 0, ctx("CONTRACT")), null);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI9" }, 0, ctx("CONTRACT"))!, /contract item was not found on this contract/);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI1" }, 0, ctx("NONE"))!, /only on contract requests/);

// typed PR line ↔ description-only PO line
const typed = item({ prItemId: "PRI000009", productId: "", productNameSnapshot: "Teflon tape", quantity: 5 });
const base = { poNumber: "PO-X", prItems: [typed], prs: [pr()], allLinks: [], poStatus: statuses };
assert.deepEqual(validatePoLinks({ ...base, items: [{ itemNo: 1, quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] }), []);
assert.match(validatePoLinks({ ...base, items: [{ itemNo: 1, productId: "P1", quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] })[0], /product does not match/);

const labels = productPickerLabels([
  { productId: "A", productCode: "F-01", productName: "Filter" },
  { productId: "B", productCode: "F-02", productName: "filter " },
  { productId: "C", productCode: "S-01", productName: "Salt 50kg" },
]);
assert.equal(labels.get("A"), "Filter (F-01)"); assert.equal(labels.get("B"), "filter (F-02)"); assert.equal(labels.get("C"), "Salt 50kg");
```

In `merge-test.ts`: two typed picks (`productId: ""`) merged into `[]` produce **two** lines; a typed pick and a product pick never merge.

- [ ] **Step 2:** `npm run test:purchase-requests` → FAIL (`validateDraftLine` not exported).
- [ ] **Step 3:** Implement. `validateDraftLine` checks, in order: needs `productId` or trimmed `description` → quantity > 0 → `salesOrderItemId` only when `SALES_ORDER` and in `soItemIds` → `contractItemId` only when `CONTRACT` and in `contractItemIds`. Messages: `Line N: choose a product or type a description.`, `Line N: quantity must be more than zero.`, `Line N: the sales order line it is for was not found.`, `Line N: a sales order line can be set only on sales order requests.`, `Line N: the contract item was not found on this contract.`, `Line N: a contract item can be set only on contract requests.` In `validatePoLinks` replace the product check with `(line.productId || "") !== (prItem.productId || "")`. `mergePickedIntoLines` already skips merging when `productId` is empty — keep that and add the generic constraint for `description`/`unit` passthrough via `makeLine`. Labels: trimmed product name; code suffix when the lower-cased trimmed name occurs ≥2 times.
- [ ] **Step 4:** `npm run test:purchase-requests` → PASS.
- [ ] **Step 5:** Commit `feat(pr): line validation by request type, typed-item PO links, picker labels`.

---

### Task 3: Contract due calculation (pure)

**Files:**
- Create: `src/lib/purchaseRequests/contractDue.ts`
- Create: `scripts/purchase-request-tests/contract-due-test.ts` (import in `run.ts`; add the new file plus `../../src/types/contract.ts` and `../../src/types/contract-release.ts` to the test tsconfig `include`)

**Interfaces:**
- Consumes: `ContractItem` (`src/types/contract.ts`), `ContractPeriodSummary` (`src/types/contract-release.ts`), Task 1 PR types.
- Produces:
  - `export function periodWindow(frequency: string, today: string): { start: string; end: string }` — calendar month / quarter / half-year (`Semi-Annual`) / year (`Annual`); `One-Time` and unknown → `{ start: "0000-01-01", end: "9999-12-31" }`.
  - `export interface ContractDueLine { contractItemId: string; productId: string; productCode: string; frequency: string; entitledQty: number; releasedQty: number; dueQty: number; alreadyRequested: { prNo: string; quantity: number }[] }`
  - `export function computeContractDue(input: { items: ContractItem[]; summaries: ContractPeriodSummary[]; prs: PurchaseRequest[]; prItems: PurchaseRequestItem[]; today: string; excludePrId?: string }): ContractDueLine[]`

- [ ] **Step 1: Failing tests:**

```ts
assert.deepEqual(periodWindow("Monthly", "2026-11-21"), { start: "2026-11-01", end: "2026-11-30" });
assert.deepEqual(periodWindow("Quarterly", "2026-11-21"), { start: "2026-10-01", end: "2026-12-31" });
assert.deepEqual(periodWindow("Semi-Annual", "2026-03-02"), { start: "2026-01-01", end: "2026-06-30" });
assert.deepEqual(periodWindow("Annual", "2026-03-02"), { start: "2026-01-01", end: "2026-12-31" });
// item CTI1 Monthly entitled 4, summary released 1 in Nov → due 3
// item CTI2 Quarterly entitled 6, no summary → due 6, released 0
// item CTI3 Inactive → omitted
// PR A (SUBMITTED, requestedDate 2026-11-03) has CTI1 qty 4, cancelledQty 1 → alreadyRequested [{ prNo: "AIC-PR-2026-0012", quantity: 3 }]
// PR B (CANCELLED) with CTI1 → ignored; PR C (DRAFT, prNo "") with CTI1 qty 2 → { prNo: "Draft", quantity: 2 }
// PR D requestedDate 2026-10-28 with CTI1 → outside Nov window, ignored
// excludePrId = PR A's id → PR A not listed
// released > entitled → dueQty 0
```

Write these as concrete assertions with fixtures built like `domain-test.ts`.
- [ ] **Step 2:** `npm run test:purchase-requests` → FAIL.
- [ ] **Step 3:** Implement. Per Active item: summary = one with matching `contractItemId` and `periodStart <= today <= periodEnd`; window = summary's `periodStart/periodEnd`, else `periodWindow(item.frequency, today)`; `releasedQty = summary?.releasedQty ?? 0`; `dueQty = max(0, entitledQty − releasedQty)`; `alreadyRequested` from `prItems` with that `contractItemId` whose PR is not CANCELLED, not `excludePrId`, `requestedDate` within window, and `quantity − cancelledQty > 0` (label `prNo || "Draft"`).
- [ ] **Step 4:** `npm run test:purchase-requests` → PASS.
- [ ] **Step 5:** Commit `feat(pr): contract due quantity calculation`.

---

### Task 4: Service and API routes

**Files:**
- Modify: `src/lib/purchaseRequests/service.ts`
- Create: `src/app/api/purchase-requests/contracts/route.ts`
- Create: `src/app/api/purchase-requests/contracts/[contractId]/due/route.ts`
- Modify: `src/components/purchase-requests/api.ts` (re-export new types)

**Interfaces:**
- Consumes: Tasks 1–3; `getContracts` (`src/lib/contractSheets.ts`), `getContractItems` (`src/lib/contractItemSheets.ts`), `getPeriodSummaries` (`src/lib/contractPeriodSummarySheets.ts`), `getCompanies` (`src/lib/companySheets.ts`), `effectiveContractStatus`.
- Produces:
  - `PrDraftInput` becomes `{ requestType?: PrRequestType; salesOrderId?: string; contractId?: string; neededByDate: string; purpose: string; version?: number; items: DraftLineInput[] }`
  - `export interface EligibleContract { contractId: string; contractNo: string; customerName: string; description: string }`
  - `export interface ContractDueView extends ContractDueLine { productName: string; unit: string }`
  - `export async function listEligibleContracts(): Promise<EligibleContract[]>`
  - `export async function getContractDue(contractId: string, excludePrId?: string): Promise<ContractDueView[]>`
  - `OpenPrLine` gains `reference: string` (SO no., contract no., or "")
  - `GET /api/purchase-requests/contracts` → `EligibleContract[]`; `GET /api/purchase-requests/contracts/{contractId}/due?excludePr=` → `ContractDueView[]`

- [ ] **Step 1:** Replace `requireConfirmed` call sites with `resolveReference(input, so, contracts)` returning the header snapshot: SALES_ORDER → existing `soSnapshot(requireConfirmed(...))` + `requestType`, blank contract fields; CONTRACT → contract must exist and be Active (`400 "Contract not found."` / `400 "Contract CTR-xxxx is <status>; only active contracts can have purchase requests."`), snapshot `contractId`, `contractNoSnapshot = contract.id`, `customerNameSnapshot` = company name, blank SO fields; NONE → all reference fields blank. Default `requestType` = `"SALES_ORDER"` when omitted.
- [ ] **Step 2:** `buildItems` calls `validateDraftLine` (throw `httpError(400, msg)`) with `soItemIds`/`contractItemIds` from the chosen reference; product lines keep the existing product/unit lookup and inactive check; typed lines store `productId/productCodeSnapshot/unitId = ""`, `productNameSnapshot = description.trim()`, `unitSnapshot = unit.trim()`; store `contractItemId`.
- [ ] **Step 3:** `submitPurchaseRequest` re-checks only SALES_ORDER (confirmed) and CONTRACT (still Active). `buildView` sets `salesOrderStatus` only for SALES_ORDER. `listOpenPrLines` fills `reference` (`salesOrderNoSnapshot` / `contractNoSnapshot` / ""). Only load contracts in the code paths that need them.
- [ ] **Step 4:** Implement `listEligibleContracts` (Active contracts, sorted by id desc, `customerName` from companies, `description` from contract) and `getContractDue` (items for the contract → summaries via `getPeriodSummaries(undefined, undefined, undefined, contractId)` → `computeContractDue` with `manilaToday()` → join product name/unit from `getProductsOnly`/`getProductUnits`). Routes follow `src/app/api/purchase-requests/[id]/route.ts` (`prRoute`, awaited `params`).
- [ ] **Step 5:** `npx tsc --noEmit -p .` and `npm run lint` → clean for touched files. `npm run test:purchase-requests` → PASS.
- [ ] **Step 6:** With `npm run dev` running and logged in, smoke via browser devtools: `GET /api/purchase-requests/contracts` returns active contracts; `GET /api/purchase-requests/contracts/<id>/due` returns lines with `dueQty`. (Requires Task 1 `--apply` done with Chris's OK.)
- [ ] **Step 7:** Commit `feat(pr): contract and typed-item purchase requests in service and API`.

---

### Task 5: PR form

**Files:**
- Modify: `src/components/purchase-requests/purchase-request-form.tsx`
- Create: `src/components/purchase-requests/contract-items-picker.tsx`

**Interfaces:**
- Consumes: `EligibleContract`, `ContractDueView`, `productPickerLabels`, `PrDraftInput`.
- Produces: `ContractItemsPicker({ due, onAdd }: { due: ContractDueView[]; onAdd: (lines: { productId: string; quantity: number; contractItemId: string }[]) => void })`.

- [ ] **Step 1:** "Request for" segmented control (Sales order / Customer contract / None) at the top; initial value from `editing?.requestType ?? "SALES_ORDER"`. Switching type clears the other reference and strips `salesOrderItemId`/`contractItemId` from all lines. Contract mode: `SearchableSelect` of contracts (`"{contractNo} — {customerName}"` + description), info panel with customer; load contracts from `/api/purchase-requests/contracts`.
- [ ] **Step 2:** Line model: `{ kind: "product" | "typed"; productId; description; unit; quantity; salesOrderItemId; contractItemId; remarks }`. Product lines use `productPickerLabels` for options; typed lines show Description + Unit inputs instead of the product select. Buttons: Add from sales order (SO mode), Add from contract (contract mode), Add product, Add typed item. The "For SO line" select only renders in SO mode. Editing an existing typed line (`productId === ""`) opens as `kind: "typed"` with `description = productNameSnapshot`, `unit = unitSnapshot`.
- [ ] **Step 3:** `ContractItemsPicker`: fetches nothing itself; the form fetches `/api/purchase-requests/contracts/{id}/due?excludePr={current?.prId}` when opened. Table: checkbox, product name, frequency, entitled, released, due, and a muted hint `"{qty} already on {prNo}"` per `alreadyRequested`. Rows with `dueQty > 0` start ticked; added qty = `dueQty` (min 1 when user ticks a 0-due row). Adding replaces empty blank lines, like `addPickedSoLines`.
- [ ] **Step 4:** Save body: `{ requestType, salesOrderId, contractId, neededByDate, purpose, items, version }` with typed lines sent as `{ description, unit, quantity, remarks }`. Client checks: SO mode needs an SO, contract mode needs a contract; every line needs product or description.
- [ ] **Step 5:** `npm run lint` + `npx tsc --noEmit -p .` clean. In the browser (dev server): create one PR of each type, including a typed line and an Add-from-contract fill; edit one back and confirm the type, contract and typed line reload correctly.
- [ ] **Step 6:** Commit `feat(pr): request type, add-from-contract and typed items in PR form`.

---

### Task 6: Detail view, register, PO picker and PO page

**Files:**
- Modify: `src/components/purchase-requests/purchase-request-detail-dialog.tsx`
- Modify: `src/app/dashboard/purchase-requests/page.tsx`
- Modify: `src/components/purchase-requests/pr-line-picker.tsx`
- Modify: `src/app/dashboard/purchase-orders/page.tsx` (`lineFromPicked`, `addPickedPrLines` only)
- Modify: `src/components/purchase-requests/api.ts`

**Interfaces:**
- Consumes: `OpenPrLine.reference`, `PickedPoLine` (Task 2).
- Produces: `export function prReferenceLabel(pr: Pick<PurchaseRequest, "requestType" | "salesOrderNoSnapshot" | "contractNoSnapshot">): string` in `api.ts` → `"SO AIC-SO-…"`, `"Contract CTR-…"`, or `"—"`.

- [ ] **Step 1:** Detail dialog: description line uses `prReferenceLabel` + customer; hide Quotation no. unless SALES_ORDER; product cell shows `productCodeSnapshot — name` only when a code exists, else name alone.
- [ ] **Step 2:** Register: column "SO No." → "For" using `prReferenceLabel`; search includes `contractNoSnapshot`; the SO filter becomes a "For" filter keyed by `requestType:id` (SO id or contract id; NONE as one option). Update the mobile list `primary`/`labels` keys accordingly.
- [ ] **Step 3:** PR line picker: column "SO No." → "For" showing `reference`; product cell drops the `code —` prefix when code is empty; filter text includes `reference`; grouping key `r.productId || r.prItemId` (typed lines never group); pass `description: r.productName, unit: r.unit` into `PickedPoLine`.
- [ ] **Step 4:** PO page: `lineFromPicked` — when `!p.productId` return a description-only line (`description: p.description`, `unit: p.unit || "PC"`, no supplier product, price 0); `addPickedPrLines` skips the "not in supplier's catalogue" warning for typed picks and instead warns once: `"Typed items were added without a product; enter their prices by hand."`
- [ ] **Step 5:** `npm run lint` + `npx tsc --noEmit -p .` clean; `npm run test:purchase-requests` PASS. Browser: open a contract PR and a typed-item PR in the register and detail view; in a Draft PO pull both a product line and a typed line from PRs, save, and confirm the PR shows "On draft PO" for both.
- [ ] **Step 6:** Commit `feat(pr): show contract/typed requests in register, detail and PO picker`.

---

### Task 7: Print — reference header and four signatories

**Files:**
- Modify: `src/components/purchase-request-print-document.tsx`

**Interfaces:**
- Consumes: `prReferenceLabel` (Task 6).

- [ ] **Step 1:** Header left block: label `"Sales order"` / `"Contract"` / `"Request"` by type; value = SO no. / contract no. / `—`; Quotation No. row only for SALES_ORDER. Item table code cell blank for typed lines.
- [ ] **Step 2:** Replace the `.signatures` block and the `acknowledgment` paragraph with a component-scoped 2×2 grid (inline `<style>` with a `.pr-signatories` class; do **not** edit the shared `.signatures` CSS): left column REQUESTED BY: / REVIEWED BY:, right column NOTED BY: / APPROVED BY:. Requested/Noted/Reviewed: bold heading, signature space, rule line, caption `SIGNATURE OVER PRINTED NAME / DESIGNATION / DATE`. Requested by keeps `UserSignatureImage` + `requestedByName` centred above its rule. Approved by: two stacked bold names with their titles (Global Constraints text), no rule line. Block uses `break-inside: avoid`.
- [ ] **Step 3:** Browser: print preview (A4) of a contract PR with a typed line — signatory block matches Chris's screenshot layout and stays on one page with the items; print preview of a PO is unchanged.
- [ ] **Step 4:** Commit `feat(pr): contract reference and four-signatory block on PR print`.

---

### Task 8: Finish

- [ ] **Step 1:** `npm run test:purchase-requests`, `npm run lint`, `npm run build` → all pass.
- [ ] **Step 2:** Mark the spec `Status: Implemented on feat/pr-contract-items (date); requires npm run setup:purchase-requests -- --apply`. Add a one-line amendment note under Decisions in `docs/superpowers/specs/2026-11-21-purchase-request-design.md` pointing to the new spec.
- [ ] **Step 3:** Refresh `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` (replace, don't append).
- [ ] **Step 4:** Commit `docs(pr): mark contract items design implemented`.
