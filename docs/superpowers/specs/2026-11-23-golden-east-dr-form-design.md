# Golden East Delivery Receipt Form — Design

Date: 2026-11-23 · Size: small change (revised the same day: added the FOR client)

## Intent

Aerich does after-sales and delivery for Golden East Resource Trading, OPC. Aerich delivers the
items to Golden East's own clients (today Holy Family Hospital – Padre Garcia and Primeluck Renal
Care Inc.) and bills Golden East. For these deliveries the DR handed over carries Golden East's
letterhead and a red "FOR: <client>" line. Today staff copy each DR by hand into a Google Sheet
template ("DR-10-17-2025-3194_GOLDEN EAST", tab "AERICH FORMAT"). The app should print that form
directly and record which client each delivery was for.

## Goals

- DRs whose company is Golden East (company id `COMP-96`) preview, print and save to Drive on a
  Golden East–branded form by default.
- The preview can switch back to the normal Aerich form for that DR.
- A DR can name the client the delivery is **for**. The client is picked from a dropdown, saved
  with the DR, and printed as the red "FOR:" line.

## Non-goals

- The DR is still made out to Golden East. Same DR number series, and stock, Sales Order and
  contract handling stay as they are.
- The chosen print form is not stored. Every reopen defaults to the Golden East form.
- No per-company template setting and no other principals' letterheads.
- No change to how Service Invoices use the billing company.
- B.Braun setup is data entry only: set each branch's Billing company to `COMP-24` on the
  Companies page. This needs no code.

## Approaches

Print form:
- **A. Preview switch (chosen).** The default comes from the company id. A button in the preview
  switches forms. Nothing new is stored.
- B. A per-DR saved "Print form" field. Rejected: it adds a column and a form field for an
  exception case.
- C. B plus a per-company template setting. Rejected: no current need beyond Golden East.

FOR client:
- **Saved on the DR, chosen on the entry form (chosen).** Reprints and the Drive PDF saved on
  create always show it.
- Picked in the preview only. Rejected: the auto-saved Drive PDF would have no FOR line, and every
  reprint would need picking again.

Where the FOR list comes from:
- **Companies whose Billing company (Companies column I, `BillingCompanyId`) is the DR's company
  (chosen).** This link already exists (Hemotek branches → `COMP-114`). A new Golden East client
  only needs to be created with Billing company `COMP-96`.
- A fixed list in code. Rejected: adding a client would need a code change.
- Making the DR out to the client instead (the Hemotek model). Rejected: Golden East's Sales Orders
  are under Golden East, and a DR's company must match its Sales Order's customer.

## Data

- New column **Y `ForCompanyId`** on DeliveryReceipts: the company id of the FOR client, blank when
  none. Older rows read as blank.
- The DR APIs return `forCompanyId` plus the resolved `forCompanyName` (looked up from Companies,
  falling back to the stored id).
- Validation on create and edit: if set, the FOR company must exist and its `billingCompanyId`
  must equal the DR's `companyId`.

## Entry form

- In both the create form and the edit dialog, a **"FOR (client)"** dropdown appears only when the
  selected company has at least one active company billed to it. It isn't limited to Golden East,
  so a parent like Hemotek gets it too, but it is always optional. Options are those companies by
  name, plus "None".
- Changing the DR's company clears the FOR choice.

## The Golden East form (copied from the sample sheet)

- Header: the logo (`public/golden-east-logo.png`, white margins cropped) with
  "GOLDEN EAST / RESOURCE TRADING OPC" in large bold text beside it, fixing the sample's typo
  "TADING". Right box: "DELIVERY RECEIPT" and "NO: <DR number>" in red.
- A blue bar, then Name / Address / TIN on the left and Date / PO NO. / TR# on the right, filled
  from the DR (the company record, `poNo`, `trNo`).
- Items table with a blue header: QTY | UNIT | DESCRIPTION | UNIT PRICE. Unit Price is left
  blank. Serial numbers print under the description. Then the red **"FOR: <client name>"** row
  when a FOR client is set. Then blank rows down to at least 12 body rows, so the grid looks like
  the sample.
- A light-blue "Comments or Special Instructions" band, with the DR's Comments printed under it.
- Prepared by / Delivered by with app e-signatures and "Signature Over Printed Name", plus
  "Received the above goods in good order and condition" with its signature line.
- An A4 page, sized like the existing Aerich form. Drafts keep the DRAFT marking.

The Aerich form also prints the FOR client, as a "For:" line under "Delivered to". That way
switching forms never loses it.

## How it's built

- `DeliveryReceiptResponse` gains `companyId`, `forCompanyId` and `forCompanyName`.
  `CreateDeliveryPayload` gains `forCompanyId`.
- A new `GoldenEastDeliveryReceiptPrintDocument` component sits next to
  `DeliveryReceiptPrintDocument`. A pure helper `defaultDeliveryReceiptPrintForm(dr)` returns
  `"golden-east" | "aerich"` based on `companyId === "COMP-96"`.
- `generateDeliveryReceiptPdfBase64(dr, form?)` renders the chosen form, and defaults through the
  helper.
- In the preview modal, a "Use Aerich format" / "Use Golden East format" button appears only for
  Golden East DRs. The existing legacy-format switch is unchanged.

## Left to the builder

- Exact spacing, font sizes and blue shades, matched by eye to the exported sample PDF.
