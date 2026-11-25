# Quotation "Recommended by" technician + Sales Order confirmation email

Date: 2026-11-25 · Status: approved by Chris

## Why

Technicians recommend work (e.g. pump replacement) on their service reports and send the
manager a quotation request. When the client later sends a Purchase Order, the Admin team
creates the Sales Order, but the recommending technician has no way to know the PO arrived.
They are the ones who must raise the Purchase Request, so they need to be told.

## Goals

- Record which technician recommended a quotation.
- Carry that technician onto the Sales Order.
- Email the technician (plus the After Sales manager and the company inbox) when the Sales
  Order is confirmed, so they create the Purchase Request.
- Hide Service Reports from the sidebar (the manager uses a separate application for them).

## Non-goals

- Linking quotations to service reports.
- In-app tracking of Sales Orders still awaiting a Purchase Request.
- Showing the technician on the client-facing quotation PDF.

## Approaches considered

- **In-app list only:** rejected. Technicians have no way to know when to look, since Admin
  learns of the PO by email, chat, or text.
- **Email on Sales Order draft save:** rejected. Drafts can change or be deleted, so the
  technician might start buying for an order that never goes ahead.
- **Email on first Draft → Confirmed (chosen).** The technician only hears about committed orders.

## Design

1. **Sidebar:** remove both Service Reports links (the admin one in Sales & Collections and the
   one in the After Sales Technician group). The route and its data remain.
2. **Quotation:** new optional field `recommendedByUserId` plus a name snapshot. The picker lists
   active users in the After Sales department (department id 1, the department the sidebar
   already uses for the Technician group). It is saved with the quotation and shown in the
   quotation details and list. It is not printed on the PDF.
3. **Sales Order:** the same optional field. When converting from a quotation it is pre-filled
   from the quotation and can be edited. On a direct Sales Order, Admin can pick one or leave it blank.
4. **Email on confirm:** sent only on the transition DRAFT → CONFIRMED (not ON_HOLD → CONFIRMED).
   - To: the recommending technician (their email from the Users sheet).
   - CC: every active After Sales user whose position title contains "manager" (case-insensitive),
     plus `aerichinnovationcorp@gmail.com`.
   - Content: Sales Order number, customer, source quotation number (if any), items and quantities,
     a link to the Sales Order, and a line asking the technician to create the Purchase Request.
   - Sent through the existing email service used for quotation emails.
   - No technician selected: no email.
5. **Failure handling:** a failed send or a technician with no email never blocks the confirm.
   The confirm response carries a warning and the UI shows "Technician was not notified".

## Builder's calls (Claude's, correctable)

- Older quotations and Sales Orders have the field blank. New sheet columns are appended, and
  existing columns are not moved.
- The company inbox address lives in one constant/env setting, not scattered.
- The exact column positions, the email layout, and whether the technician column appears in list views.
