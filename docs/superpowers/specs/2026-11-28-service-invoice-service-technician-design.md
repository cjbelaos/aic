# Service Invoice: separate Service Technician from DR deliverer

## Why

Delivery and service are often done by different people on different days. Example: AIC-SO-2026-1420. The parts were too heavy and bulky for the service vehicle, so a trucking driver delivered them. The Service Invoice is created later, once the service visit is scheduled. Today, linking a DR locks the invoice's Assigned Technician to the DR deliverer. As a result, the driver gets the earnings credit, the Service Report shows the driver as "Attended by", and the actual technician can't fill in the report.

## Goals

- The Service Invoice records who **performs the service** separately from who **delivered** the items.
- The DR deliverer stays visible on the invoice as a read-only reference.
- Technician earnings, manual completion permission, and the Service Report ("Attended by" and who can fill in or edit the report) all follow the Service Technician.

## Non-goals

- No change to Sales Invoices (Assigned PIC) or to how DRs record their deliverer.
- No split of earnings between deliverer and technician.
- No backfill of old invoices.

## Anti-goals

- A DR link must not silently satisfy the Service Technician requirement.

## Decisions (user)

- Keep the DR person and add a separate "Service Technician" field.
- Earnings credit goes to the Service Technician.
- The Service Technician is **required** to finalize a Service Invoice, and it **starts empty** even when a DR is linked. Staff pick it on purpose. For a same-day job, they pick the same person as the deliverer.
- It can be changed after finalizing, under the same edit rules as the rest of the invoice: anyone who can edit, except on cancelled, void or deleted invoices.

## Approaches considered

1. **Columns M/N hold the Service Technician; the DR deliverer is read from the DR record** *(chosen)*. Earnings, manual completion and Service Report code already read M/N, so they need no changes. Old invoices keep M/N holding the DR person, which is correct for them.
2. Add new columns V/W for the Service Technician. Every consumer would need fallback logic, and the sheet range would widen from A:U to A:W everywhere. Rejected: more places to change and more ways to get it wrong.
3. Store it in the metadata JSON (column T). Same consumer changes as option 2, and the value is hidden from people reading the sheet. Rejected.

## Design

- **UI (create and edit Service Invoice):**
  - Rename "Assigned Technician" to **Service Technician** and make it a required searchable select, always editable.
  - Linking a DR no longer fills it in or locks it.
  - When a DR is linked, show a read-only **"Delivered by (DR #N)"** line taken from the DR. That person may be an external driver.
- **Server (`invoiceRepository` create and update):**
  - Remove the "linked DR wins" rule. Columns M/N always come from the submitted technician, or from the stored value when the field isn't sent.
  - Keep the finalize check: "Service Technician is required before finalizing a Service Invoice."
  - The DR is still validated and stored in column L as before.
- **Service Report warning:** if a Service Report is already linked (column O is set) and the technician changes, show a warning in the UI and still allow the save. The report keeps its own snapshot of the technician's name.
- **Earnings report:** no logic change. M wins, and the existing fallback to the DR deliverer still covers rows where M is empty.

## Left to the builder

- Exact label wording and where the "Delivered by" line sits in the layout.
- Update the existing tests that assert "a linked DR overrides the technician" (`scripts/test-service-invoice-billing.cjs` and related), and add a test proving that a DR link doesn't override or fill in the technician.
- Update the column comments in `src/lib/serviceReports/invoiceRow.ts` and `src/types/serviceInvoice.ts` to describe M/N as the Service Technician.
