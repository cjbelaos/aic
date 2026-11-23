# Golden East Delivery Receipt Form — Design

Date: 2026-11-23 · Size: small change

## Intent

Aerich does after-sales and delivery for Golden East Resource Trading, OPC. Aerich delivers the
items to Golden East's own clients (for example Holy Family Hospital – Padre Garcia, or Primeluck
Renal Care) and bills Golden East. For these deliveries the DR handed over carries Golden East's
letterhead. Today staff copy each DR by hand into a Google Sheet template
("DR-10-17-2025-3194_GOLDEN EAST", tab "AERICH FORMAT"). The app should print that form directly.

## Goals

- DRs whose company is Golden East (company id `COMP-96`) preview, print and save to Drive on a
  Golden East–branded form by default.
- The preview can switch back to the normal Aerich form for that DR.

## Non-goals

- No change to how a DR is saved: same DR number series, the company is still Golden East, and
  stock, Sales Order and contract handling stay as they are.
- The chosen form is not stored. Every reopen defaults to the Golden East form.
- No per-company template setting (Approach C) and no other principals.
- No structured "end client" field. The destination stays free text in Comments.

## Approaches

- **A. Preview switch (chosen).** The default comes from the company id. A button in the preview
  switches forms. Nothing new is stored.
- B. A per-DR "Print form" field saved in a new DeliveryReceipts column. Rejected: it adds a column
  and a form field for an exception case.
- C. B plus a per-company template setting. Rejected: no current need beyond Golden East.

## The form (copied from the sample sheet)

- Header: the logo (`public/golden-east-logo.png`, white margins cropped) with
  "GOLDEN EAST / RESOURCE TRADING OPC" in large bold text beside it. Fix the sample's typo
  ("TADING" → "TRADING"). Right box: "DELIVERY RECEIPT" and "NO: <DR number>" in red.
- A blue bar, then Name / Address / TIN on the left and Date / PO NO. / TR# on the right. These are
  filled from the DR (the company record, `poNo`, `trNo`).
- Items table with a blue header: QTY | UNIT | DESCRIPTION | UNIT PRICE. Unit Price is left blank.
  Serial numbers print under the description, as on the Aerich form.
- Comments print as a red **"FOR: …"** line inside the items table, below the items. This matches
  how the sample shows the end client.
- Light-blue "Comments or Special Instructions" band.
- Prepared by / Delivered by with app e-signatures and "Signature Over Printed Name", plus
  "Received the above goods in good order and condition" with its signature line.
- An A4 page, sized like the existing Aerich form. Drafts keep the DRAFT marking.

## How it's built

- Add `companyId` to `DeliveryReceiptResponse` and return it from the preview and create routes,
  so the form can be chosen without matching on the company name.
- A new `GoldenEastDeliveryReceiptPrintDocument` component sits next to
  `DeliveryReceiptPrintDocument`. A small helper `deliveryReceiptPrintForm(dr)` returns
  `"golden-east" | "aerich"` based on `companyId === "COMP-96"`.
- `generateDeliveryReceiptPdfBase64(dr, form?)` renders the chosen form. When `form` isn't passed it
  uses the helper's default, so the auto-save to Drive on create uses the Golden East form.
- In the preview modal, a "Use Aerich format" / "Use Golden East format" button appears only for
  Golden East DRs. Print and Save to Drive use whichever form is showing. The existing
  legacy-format switch is unchanged.

## Left to the builder

- Exact spacing, font sizes and blue shades, matched by eye to the exported sample PDF.
- The logo crop can be done once with `sharp` into a committed trimmed file, or with CSS
  `object-fit`. Pick whichever gives a crisper print.
