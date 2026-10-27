# Approved liquidation cash returns

Approved by Chris in chat on 2026-10-27. Approval remains separate from cash-return tracking.

- For an approved liquidation with a positive cash advance balance, the requestor records the full return with an actual date and required screenshot/photo (upload or camera). Saving marks it Returned without CFO confirmation.
- Return states: Not yet recorded, Returned, Not applicable (no amount due). Unapproved liquidations have no active return workflow.
- Requestors may correct dates and replace evidence. Existing approved liquidations and historical returns are supported. Future dates are rejected using Asia/Manila dates.
- Requestor, assigned/mapped approver, CFO and admins may view return details/evidence. Only the requestor records or edits the return.
- Amount is calculated from the liquidation; partial returns are out of scope. Record last editor and timestamp.

## Approaches
Selected: separate return metadata and status, retaining Approved. Alternative: change the main status to Returned; rejected because it mixes approval with settlement.

## Implementation decisions
Use the existing Google Sheets and OAuth Drive integration. Append return columns, preserving existing columns and historical rows. Evidence must be private, served through an authorized endpoint, rather than the public receipt-upload flow. CFO is identified by CFO/Chief Financial Officer position title. The UI uses the existing modal, table and camera-input patterns.
