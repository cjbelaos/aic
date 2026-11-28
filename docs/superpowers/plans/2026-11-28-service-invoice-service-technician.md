# Service Invoice Service Technician Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Service Invoice's technician (columns M/N) is chosen explicitly and is no longer overwritten by a linked DR's deliverer. The DR deliverer is shown read-only.

**Architecture:** For `invoiceKind === "service"`, `invoiceRepository` create/update resolve M/N only from `assignedTechnicianUserId` (or the stored value). Sales invoices keep today's DR-derived behaviour. The client stops copying the DR deliverer into technician state and shows it in a separate read-only line.

**Tech Stack:** Next.js client component, TypeScript repository over Google Sheets, node `.cjs` tests with in-memory Sheets mocks.

**Spec:** `docs/superpowers/specs/2026-11-28-service-invoice-service-technician-design.md`

## Global Constraints

- Finalize error copy: `Service Technician is required before finalizing a Service Invoice.`
- UI label: `Service Technician`; DR line: `Delivered by (DR #<n>): <name>`.
- Sales Invoice behaviour unchanged (`scripts/test-sales-invoices.cjs` must keep passing as-is).
- Sheet layout A:U unchanged.

## Review Focus

- Editing an old finalized invoice with a DR and not touching the technician: M/N keep their stored value (the DR person), and the save does not fail.
- Finalizing a DR-linked service invoice with no technician picked: rejected by both client and server.
- A DR whose deliverer is external or not a user: the service invoice still saves and finalizes. The DR identity error no longer blocks service invoices.
- Opening the edit dialog for a DR-linked invoice does not overwrite the stored technician with the DR deliverer.
- Changing the technician when a Service Report is linked shows a warning and still saves.

---

### Task 1: Server — technician independent of DR for service invoices

**Files:**
- Modify: `src/lib/invoiceRepository.ts` (create ~741-755, update ~1088-1125)
- Test: `scripts/test-service-invoice-billing.cjs`

- [ ] **Step 1: Failing tests** (in the existing `try` block)
  - Create a draft with `drNumber: 3941`, `assignedTechnicianUserId: "svc-tech"`. Assert `writes[0][12] === "svc-tech"`. The DR mock returns `"tech"`.
  - Create with `drNumber: 3941`, `status: "created"`, and no technician. Rejects with `/Service Technician is required before finalizing/`.
  - Update `"1721"` (stored M = `"tech"`) with `drNumber: 3941` and no technician field. Assert `writes[0][12] === "tech"`.
- [ ] **Step 2:** `node scripts/test-service-invoice-billing.cjs`. Expected: FAIL on the first new assertion.
- [ ] **Step 3: Implement.** When `invoiceKind === "service"`:
  - Create: M/N = `resolveAssignedTechnician(payload)`. If final and empty, throw the constraint copy.
  - Update: M/N = the explicit technician if sent, else the stored value. If final and empty, throw the constraint copy.
  - Skip `resolveServiceInvoiceDeliveredBy` entirely for service, so a DR identity error no longer blocks.
  - `invoiceKind === "sales"` keeps the existing code path.
  - Update the M/N comments.
- [ ] **Step 4:** Run `node scripts/test-service-invoice-billing.cjs && node scripts/test-sales-invoices.cjs`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 2: Client — Service Technician field and DR line

**Files:**
- Modify: `src/app/dashboard/service-invoices/service-invoices-client.tsx`
- Modify (comments only): `src/lib/serviceReports/invoiceRow.ts`, `src/types/serviceInvoice.ts`

- [ ] **Step 1: DR effects.** In the DR effects (~646-668 and ~711-731), stop setting technician state for service invoices. Set new state `drDeliveredByName` / `editDrDeliveredByName` from `dr.deliveredBy`. Sales keeps setting technician state as today.
- [ ] **Step 2: Field.** In the create (~2590) and edit (~2932) technician fields:
  - Always render the `SearchableSelect`, labelled `Service Technician *`.
  - When a DR is linked, add the muted line `Delivered by (DR #n): name` below it.
- [ ] **Step 3: Client finalize check.**
  - Create: change the check at ~1441 to `!isSales && !technicianId`, using the constraint copy.
  - Edit: add the same check when `editStatus === "created"` and `!isSales`.
- [ ] **Step 4: Service Report warning.** In the edit dialog, when `editTarget.serviceReportId` is set and `editTechnicianId !== editTarget.assignedTechnicianUserId`, show the warning: `Service Report <id> is linked. Its "Attended by" keeps the technician who filled it in.`
- [ ] **Step 5:** Run `npx tsc --noEmit -p .` and `npx eslint` on the changed files. Expected: clean.
- [ ] **Step 6:** Commit.

### Task 3: Verify and merge

- [ ] Run `npm run test:service-invoice-billing`, `npm run test:sales-invoices` and `npm run test:service-reports`. Expected: PASS.
- [ ] Commit the spec and plan, merge the branch into `main` (`--no-ff`), and refresh the KOS handoff.
