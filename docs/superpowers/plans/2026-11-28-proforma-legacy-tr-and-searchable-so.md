# Proforma Legacy TR Mode + Searchable SO Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins issue proformas for legacy SO/TR numbers not in the app, and make the Sales Order picker searchable.

**Architecture:** A legacy proforma is an ordinary `ProformaInvoice` with empty `salesOrderId`, a typed `trNo`, and empty `importIssue`. `saveProforma`/`changeProforma` branch on that; numbering, tracker mirror and files are unchanged. The page becomes a server wrapper that passes `isAdmin` to a client component.

**Tech Stack:** Next.js 16 app router, TypeScript, Google Sheets repositories, `scripts/*.cjs` test harness via `proforma-runtime.cjs`.

**Spec:** `docs/superpowers/specs/2026-11-28-proforma-legacy-tr-and-searchable-so-design.md`

## Global Constraints

- No change to the 28-column `ProformaInvoices` contract (`PROFORMA_KEYS`).
- No change to VAT handling or SO-mode pricing/limits.
- Legacy mode is admin-only (`isAdminUser`), enforced on the server.
- TR No.: required, trimmed, ≤ 50 chars. PO No.: optional, ≤ 100 chars.
- Customer comes from `getCompanies()` (status `active`), re-read on the server.

## Review Focus

1. TR typed with surrounding spaces or matching an SO's `legacyTrackerNo` with different whitespace → trimmed compare, still refused.
2. Non-admin calling PATCH `issue` on a legacy draft (bypassing the form) → 403.
3. Editing an issued SO proforma into legacy mode (or vice versa) → refused.
4. Legacy items carrying a `salesOrderItemId` → refused by `priceProformaItems(items, [])`.
5. Inactive or unknown `customerId` → refused with "Select an active customer."

---

### Task 1: Server legacy path

**Files:**
- Modify: `src/types/proformaInvoice.ts` (add `legacy?: { trNo: string; customerId: string; poNo: string }` to `ProformaInput`)
- Modify: `src/lib/proforma/domain.ts` (add `isLegacyProforma(invoice: Pick<ProformaInvoice,"salesOrderId"|"importIssue">): boolean` → `!salesOrderId && !importIssue`)
- Modify: `src/lib/proforma/service.ts` (`saveProforma(raw, actor, isAdmin = false)`, `changeProforma(id, action, expectedVersion, actor, notes?, isAdmin = false)`; `proformaOptions(salesOrderId?, isAdmin = false)` returns `companies` (active `{ id, name }`) when admin)
- Modify: `src/app/api/proforma-invoices/route.ts`, `[id]/route.ts`, `options/route.ts` (pass `isAdminUser(session)`)
- Test: `scripts/test-proforma-invoices.cjs`

**Interfaces:**
- Produces: `ProformaInput.legacy`, `isLegacyProforma`, options response `{ orders, companies? }`.

- [ ] **Step 1: Write failing tests** (append before the tracker section, mocking `@/lib/companySheets` → `getCompanies` returning `[{ id:"comp_2", companyName:"Legacy Co", tin:"T2", address:"A2", status:"active" }, { id:"comp_3", companyName:"Old Co", status:"inactive", ... }]`):
  - `legacyInput = { id:"legacy-0000001", expectedVersion:0, salesOrderId:"", date:"2026-11-28", drNo:"", notes:"", remarks:"", legacy:{ trNo:" 1318 ", customerId:"comp_2", poNo:"PO-9" }, items:[{ salesOrderItemId:"", productName:"Legacy item", unit:"LOT", quantity:1, unitPrice:5000 }] }`
  - non-admin save → rejects `/Only admins/`.
  - admin issue → `trNo === "1318"`, `companyName === "Legacy Co"`, `tin === "T2"`, `poNo === "PO-9"`, `salesOrderId === ""`, `totalAmount === 5000`, invoiceNo assigned, `mirrored.trNo === "1318"`.
  - admin save draft then `changeProforma(id,"issue",v,actor,undefined,true)` issues; same with `isAdmin=false` → `/Only admins/`.
  - `legacy.trNo: "1334"` (matches mocked SO) → `/already belongs to Sales Order AIC-SO-2026-1334/`.
  - `customerId:"comp_3"` → `/active customer/`; `trNo:""` → `/TR No/`.
  - item with `salesOrderItemId:"L1"` → rejects.
  - editing issued legacy with `salesOrderId:"SO1"` and no `legacy` → `/keep its original/`; editing the issued SO proforma with `legacy` → same.
  - `isLegacyProforma({salesOrderId:"",importIssue:""}) === true`, `({salesOrderId:"",importIssue:"REVIEW"}) === false`.
- [ ] **Step 2:** `npm run test:proforma-invoices` → FAIL.
- [ ] **Step 3: Implement.** In `saveProforma`, after version checks: legacy request = `!raw.salesOrderId && raw.legacy`. Existing-record mode must match (`isLegacyProforma(existing)` vs legacy request) else "An issued proforma must keep its original Sales Order or legacy TR." (apply to drafts too only for issued). Legacy branch: `isAdmin` else `ProformaError("Only admins can create legacy SO / TR proformas.", 403)`; validate TR/PO; duplicate guard over `readSalesOrders()` (non-CANCELLED, `legacyTrackerNo.trim() === trNo`) → "TR {trNo} already belongs to Sales Order {salesOrderNo}. Use the Sales Order option."; company lookup; `priceProformaItems(raw.items, [])`; build invoice with `salesOrderNo:""`, `trNo`, company fields, `poNo`; skip `assertWithinOrderTotal`. In `changeProforma("issue")`: if `isLegacyProforma(invoice)` require admin, reprice with `[]`, skip SO lookup and cap, keep stored customer/TR.
- [ ] **Step 4:** `npm run test:proforma-invoices` → PASS (existing assertions unchanged).
- [ ] **Step 5:** Commit `feat(proforma): admin legacy SO/TR proformas on the server`.

### Task 2: Form, picker and register

**Files:**
- Rename: `src/app/dashboard/proforma-invoices/page.tsx` → `proforma-invoices-client.tsx` (default export takes `{ isAdmin: boolean }`)
- Create: `src/app/dashboard/proforma-invoices/page.tsx` (server wrapper like `sales-invoices/page.tsx`)
- Modify: `docs/PROFORMA-INVOICES.md`

**Interfaces:**
- Consumes: Task 1 options `companies`, `ProformaInput.legacy`, `isLegacyProforma`.

- [ ] **Step 1: Implement.**
  - Replace search input + `<select>` with `SearchableSelect` (options `{ value:id, label:\`${number} · TR ${trNo||"—"} · ${customer}\` }`).
  - Admins see `InvoiceReferenceTypeSelector` (from `delivery-release-reference-field.tsx`); disabled when editing an issued record. Switching mode clears `salesOrderId`, `legacy`, items, detail.
  - Legacy fields: TR No. input, Customer `SearchableSelect` over `companies`, PO No. input. "Add manual item" enabled in legacy mode; pricing uses `priceProformaItems(items, [])`; no available-amount panel/cap; Issue/Save enabled without `detail`.
  - Opening an existing legacy record sets legacy mode with stored `trNo/customerId/poNo`.
  - Register: SO/TR column shows `Legacy TR {trNo}` when `isLegacyProforma`; Edit button shown for legacy rows only to admins.
  - Docs: add a "Legacy SO / TR proformas" paragraph.
- [ ] **Step 2:** `npx tsc --noEmit` and `npx eslint src/app/dashboard/proforma-invoices src/lib/proforma src/app/api/proforma-invoices` → clean.
- [ ] **Step 3:** Browser check: SO search works; admin legacy form renders, totals compute, validation messages show.
- [ ] **Step 4:** Commit `feat(proforma): searchable SO picker and admin legacy TR form`.
