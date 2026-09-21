# Service Report implementation plan

> **Version-one scope update:** The current company workflow and sample SR 1540 support a smaller initial form. Implement [`SERVICE-REPORT-MVP-PLAN.md`](./SERVICE-REPORT-MVP-PLAN.md) first. The detailed design below is retained as the later expansion roadmap.

> **Two-type amendment (21 September 2026):** The company has both a General Service Report and a Water Treatment System Service Report. The shared architecture uses an immutable `ReportType` (`GENERAL` or `WATER_TREATMENT`) with separate field contracts, validation, UI components, and PDF templates. See the amended MVP plan for the shared boundary and [`WATER-TREATMENT-SERVICE-REPORT-PLAN.md`](./WATER-TREATMENT-SERVICE-REPORT-PLAN.md) for the supplied Water Treatment System inventory, one-to-one detail tab, UI, PDF, migration, and acceptance contract.

Planning baseline: 20 September 2026. Status: proposed design; no Service Report application pages or Google Sheets tabs have been created by this plan.

## 1. Objective

Add a **Service Reports** module where the technician assigned to a Service Invoice records the work performed after completing an on-site service. A representative of the customer then provides their full name, position or department, acknowledgment, and drawn signature on the same device.

The completed Service Report becomes the operational evidence used to fulfill the related service lines on the linked Sales Order. A Service Invoice alone remains a commercial document and does not prove that the service was completed.

## 2. Core decisions

- Version one allows one final Service Report per Service Invoice. A draft can be edited; an acknowledged report is immutable and corrected through an explicit revision or void-and-replace workflow.
- Add an explicit Service Invoice assignment: `AssignedTechnicianUserId` with a name snapshot. Do not reuse `deliveredById`; the existing field represents internal document handover/delivery responsibility.
- Only the assigned technician, an administrator, or a specifically authorized supervisor can create and edit the report.
- The customer representative signs only after reviewing the performed work and acknowledgment text.
- A signature records acknowledgment by the named attendee. It is not presented as cryptographic proof of legal identity.
- Service completion updates the Sales Order only after the report reaches `ACKNOWLEDGED` and its service quantities pass reconciliation.
- Store signatures and generated PDFs in Google Drive. Store Drive IDs, hashes, timestamps, and snapshots in Sheets; do not store large base64 images in cells.

## 3. Existing application integration

| Existing capability | Service Report use |
|---|---|
| `ServiceInvoices`, `ServiceInvoiceItems` | Parent commercial document and source service descriptions |
| `SalesOrderDocumentLinks` | Resolve the Sales Order and service lines related to the invoice |
| `SalesOrderFulfillments` | Post `SERVICE_COMPLETION` evidence after acknowledgment |
| `Companies`, `CompanyContacts` | Customer snapshot and optional attendee suggestions |
| `Users` and session helpers | Resolve the assigned technician and acting user server-side |
| Drive upload helpers | Store signature image, attachments, and final PDF |
| React PDF/business document layout | Generate the final immutable Service Report PDF |
| Existing dashboard components | Match Service Invoice, Delivery Release, and Sales Order UI patterns |

Before implementation, append `AssignedTechnicianUserId` and `AssignedTechnicianName` to the existing `ServiceInvoices` sheet. Keep `deliveredById` and `deliveredByName` unchanged for their current document-handover purpose.

## 4. Workflow

1. An authorized user assigns a technician to a Service Invoice.
2. The assigned technician opens **My Service Reports** or selects **Create Service Report** from the Service Invoice.
3. The application snapshots the invoice, customer, linked Sales Order, service lines, and technician identity into a draft.
4. The technician records visit dates/times, services performed, quantities completed, findings, actions taken, recommendations, parts used, and optional photos or files.
5. The technician reviews the report with the customer representative.
6. The representative enters their full name, position/department, and optional contact information, checks the acknowledgment statement, and draws their signature.
7. The server validates the assignment, active invoice/Sales Order links, quantities, signature, and current report version.
8. The server uploads the signature, creates the acknowledged report, generates a PDF, and records history. Failed PDF generation leaves the acknowledged data intact and the PDF retryable.
9. An idempotent reconciliation command posts `SERVICE_COMPLETION` fulfillment against the linked Sales Order service lines. It must never fulfill product/shipping lines or exceed remaining service demand.
10. The report detail page shows acknowledgment, PDF, attachments, fulfillment outcome, and a complete activity history.

## 5. Status model

| Status | Meaning |
|---|---|
| `DRAFT` | Technician can edit; no fulfillment evidence exists |
| `READY_FOR_ACKNOWLEDGMENT` | Required technician fields are complete and ready for customer review |
| `ACKNOWLEDGED` | Customer representative signed; commercial snapshots and signature are locked |
| `FULFILLMENT_PENDING` | Acknowledged, but Sales Order reconciliation is waiting or retrying |
| `COMPLETED` | Acknowledged and all mapped service completion quantities were posted |
| `VOID` | Invalidated by an authorized administrator with a required reason |
| `SUPERSEDED` | Replaced by a reviewed corrective revision |

Do not provide a normal Delete action for acknowledged reports. Draft deletion may be supported for admins, with the existing typed `delete` confirmation convention.

## 6. Pages and user experience

| Route | Experience |
|---|---|
| `/dashboard/service-reports` | Role-scoped tracker; assigned technicians see their reports by default |
| `/dashboard/service-reports/new?invoiceNo=...` | Create from an eligible assigned Service Invoice |
| `/dashboard/service-reports/[id]` | Read-only summary, performed work, acknowledgment, files, PDF, fulfillment, history |
| `/dashboard/service-reports/[id]/edit` | Draft editing for the assigned technician/admin |
| `/dashboard/service-reports/[id]/acknowledge` | Full-screen customer review and signature flow |

Add **Create Service Report** to eligible Service Invoice rows and previews. Disable it with an explanation when no technician is assigned, the invoice is deleted/void, or an active final report already exists.

The form should use the established page styling and responsive cards:

- Header: report number, Service Invoice, Sales Order, customer, site, technician, service date, arrival/departure time.
- Work performed: repeatable service entries with description, linked invoice/Sales Order line, completed quantity, findings, corrective action, result, and follow-up requirement.
- Parts/materials used: optional descriptive entries; these do not adjust inventory in version one.
- Recommendations and customer notes.
- Attachments: direct photo/PDF upload with progress, size/type validation, preview, and remove-before-acknowledgment.
- Acknowledgment: representative full name, position/department, optional contact, acknowledgment checkbox, signature canvas, Clear and Redraw actions.
- Review screen: show exactly what will be locked before the representative signs.

Signature canvas requirements:

- Work with pointer, mouse, touch, and stylus input.
- Preserve strokes when the device rotates or the viewport resizes.
- Provide visible Clear and Redraw controls and prevent accidental page scrolling while drawing.
- Reject an empty signature and extremely short accidental marks.
- Render black strokes on a white background for reliable PDF output.
- Show the representative name directly below the signature in the final document.

## 7. Proposed Google Sheets schema

### ServiceReports

One row per report:

`ServiceReportId, ServiceReportNo, ServiceInvoiceNo, SalesOrderId, SalesOrderNoSnapshot, CustomerId, CustomerNameSnapshot, ServiceSiteSnapshot, AssignedTechnicianUserId, AssignedTechnicianNameSnapshot, ServiceDate, ArrivalTime, DepartureTime, OverallFindings, Recommendations, CustomerNotes, Status, Version, AcknowledgedAt, CompletedAt, VoidReason, PdfDriveFileId, PdfUrl, PdfGenerationStatus, FulfillmentStatus, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy`

Use UUIDs as identities. Allocate `AIC-SR-YYYY-NNNN` under a serialized sequence at acknowledgment, not at initial draft creation.

### ServiceReportActivities

One row per performed-service entry:

`ServiceReportActivityId, ServiceReportId, LineNo, ServiceInvoiceItemReference, SalesOrderItemId, ServiceDescriptionSnapshot, OrderedQtySnapshot, CompletedQty, Findings, ActionTaken, Result, FollowUpRequired, FollowUpNotes, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy`

The first implementation must add immutable IDs to Service Invoice item rows or introduce a stable conversion map. Invoice number plus description or sheet row is not a durable line identity.

### ServiceReportAcknowledgments

One immutable row per signed acknowledgment:

`AcknowledgmentId, ServiceReportId, AcknowledgmentTextVersion, RepresentativeFullName, RepresentativePosition, RepresentativeDepartment, RepresentativeContact, SignatureDriveFileId, SignatureUrl, SignatureSha256, SignedAt, SignedTimezone, DeviceMetadataJson, ConsentConfirmed, CapturedByUserId`

`DeviceMetadataJson` should contain only minimal diagnostic information such as input type and user-agent class. Do not collect precise location unless a separate business decision and privacy notice approve it.

### ServiceReportAttachments

`AttachmentId, ServiceReportId, AttachmentType, DriveFileId, ExternalUrl, FileName, MimeType, SizeBytes, Sha256, Status, CreatedAt, CreatedBy`

Types: `BEFORE_PHOTO`, `AFTER_PHOTO`, `EQUIPMENT_PHOTO`, `TEST_RESULT`, `CUSTOMER_DOCUMENT`, `OTHER`.

### ServiceReportHistory

`EventId, ServiceReportId, EventType, FromStatus, ToStatus, ChangedFieldsJson, Reason, CommandId, ActorUserId, CreatedAt`

### ServiceReportSequences and ServiceReportCommands

Use the same serialized sequence and idempotency-receipt pattern as Sales Orders:

- `ServiceReportSequences`: `SequenceKey, Prefix, BusinessYear, LastNumber, UpdatedAt`
- `ServiceReportCommands`: `CommandId, PayloadHash, CommandType, ServiceReportId, ResultVersion, ResultJson, CommittedAt, ActorUserId`

## 8. API contract

| Method and path | Responsibility |
|---|---|
| `GET /api/service-reports` | Role-scoped paginated list and filters |
| `POST /api/service-reports` | Create a draft from an assigned Service Invoice |
| `GET /api/service-reports/[id]` | Full detail, permissions, links, acknowledgment and history |
| `PATCH /api/service-reports/[id]` | Save draft with expected version |
| `POST /api/service-reports/[id]/ready` | Validate technician content before customer review |
| `POST /api/service-reports/[id]/attachments` | Multipart upload |
| `DELETE /api/service-reports/[id]/attachments/[attachmentId]` | Remove a draft attachment |
| `POST /api/service-reports/[id]/acknowledge` | Submit representative details and signature using multipart data |
| `POST /api/service-reports/[id]/pdf` | Generate or retry immutable PDF |
| `POST /api/service-reports/[id]/fulfillment/retry` | Authorized Sales Order reconciliation retry |
| `POST /api/service-reports/[id]/void` | Admin void with reason and fulfillment reversal/review |
| `GET /api/service-reports/[id]/history` | Paginated activity trail |
| `GET /api/service-reports/options` | Eligible invoices, users, customers and line mappings |

Every mutation includes a command ID and expected version where applicable. Actor identity, assigned-user checks, timestamps, hashes, status transitions, report number, and fulfillment quantities are server-owned.

## 9. Permissions

| Capability | Assigned technician | Admin | Supervisor/operations | Other users |
|---|---:|---:|---:|---:|
| View assigned report | Yes | Yes | Within approved scope | No by default |
| Create draft from assigned invoice | Yes | Yes | Optional | No |
| Edit draft | Yes | Yes | Optional | No |
| Capture customer acknowledgment | Yes | Yes | Optional | No |
| Void acknowledged report | No | Yes | Optional explicit capability | No |
| Retry fulfillment/PDF | View/request | Yes | Yes | No |

The API must enforce object-level assignment checks independently of the UI. Assignment must use the immutable user ID; names are display snapshots only.

## 10. Acknowledgment and security rules

- Display a versioned statement such as: â€œI acknowledge that the services described above were performed and that I had the opportunity to review the findings and recommendations.â€ Business/legal review must approve the final text.
- Require representative full name, position or department, consent checkbox, and non-empty signature.
- Upload the signature over the authenticated session, validate decoded PNG dimensions and size, calculate SHA-256 server-side, and store it in a restricted Drive folder.
- Never accept a client-supplied Drive ID as proof that the signature belongs to this report.
- Bind the signature hash to the report version and immutable acknowledgment payload.
- After acknowledgment, changes to performed work require a revision that invalidates/reverses prior fulfillment as needed and obtains a new acknowledgment.
- Downloads require authorization against the parent report. Do not make signature files publicly shared.
- Do not log signature bytes, customer contact details, or report document contents.

## 11. Sales Order fulfillment integration

The Service Report must resolve service quantities through stable line mappings:

1. Each activity references a `SalesOrderItemId` whose line type is `SERVICE`.
2. The customer and linked invoice/order must match.
3. Acknowledged completed quantity cannot exceed remaining demand.
4. Post one idempotent `SERVICE_COMPLETION` fulfillment per mapped activity, using the Service Report ID and activity ID as source keys.
5. A retry finds existing source keys and must not double fulfillment.
6. Voiding or superseding a completed report creates explicit reversal events; it never deletes fulfillment history.
7. Shipping-charge lines created from quotations are commercial charges and must not require or receive service-completion fulfillment.

The final rule in item 7 requires a small Sales Order model refinement before rollout: mark shipping/other commercial charges as non-fulfillable, rather than treating them as normal service labor.

## 12. PDF and Drive output

Generate an A4 Service Report containing:

- AIC identity and `AIC-SR-YYYY-NNNN`.
- Service Invoice and Sales Order references.
- Customer, site, technician, service date and visit times.
- Performed work, findings, actions, results and recommendations.
- Attachment references where appropriate.
- Representative acknowledgment statement, signature image, printed full name, position/department, and timestamp.
- Technician name and optional stored employee signature as separate authorship evidence.
- Revision/version indicator and a report verification hash or short reference.

Save the PDF and signature in a dedicated configured Drive folder such as `GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID`. A PDF failure must not erase the report or acknowledgment; show `PDF_FAILED` and allow an authorized retry.

## 13. Delivery phases

| Phase | Deliverables | Exit criteria |
|---|---|---|
| 1. Rules and data audit | Assignment definition, SI/SO mapping audit, acknowledgment text, retention policy | Business approves assignment, acknowledgment and correction rules |
| 2. Foundation | Tabs, types, repository, validation, permissions, commands, history | Draft create/update is idempotent and assignment-protected |
| 3. Technician UI | List, create/edit/detail, responsive activity cards, attachments | Assigned technician completes the workflow on desktop and phone |
| 4. Customer acknowledgment | Review mode, signature canvas, secure upload, immutable acknowledgment | Touch/mouse/stylus tests pass; empty/accidental signatures rejected |
| 5. Documents and fulfillment | PDF, Drive, Sales Order completion/reversal reconciliation | One report produces one PDF and exactly one completion event per activity |
| 6. Production rollout | Staging data, UAT, access review, backup/restore, monitoring | Known Service Invoice completes end-to-end without manual sheet edits |

## 14. Acceptance tests

- Assigned technician can create a report; an unrelated user receives 403 even through direct API calls.
- Admin can create or repair a report with audited attribution.
- A Service Invoice without an assigned technician cannot start the normal technician flow.
- Deleted/void invoices and customer/Sales Order mismatches are rejected.
- Repeated create command returns the same draft; one invoice cannot silently create duplicate final reports.
- Draft reload preserves activities and attachments.
- Customer full name, position, consent, and valid signature are all required.
- Mouse, touch, and stylus strokes render correctly; Clear and Redraw work.
- Resizing or rotating the device does not erase the signature.
- Signature and PDF files remain private and require authorized application access.
- Lost response after acknowledgment returns the same committed acknowledgment on retry.
- PDF failure leaves acknowledgment saved and retryable.
- Only mapped service lines are fulfilled; product and shipping-charge lines are excluded.
- Partial service quantity produces partial fulfillment; later reports cannot exceed remaining quantity.
- Retry does not duplicate fulfillment; void/revision produces explicit reversals.
- Report and Sales Order history identify command, actor, source report, quantity, and timestamp.
- Mobile testing covers 320, 360, 390 and 430 pixel widths, keyboard overlap, signature scrolling, focus order, light/dark themes, and real-device touch input.

## 15. Decisions required before implementation

1. Confirm whether version one permits exactly one report per Service Invoice or multiple visit reports. This plan assumes one final report per invoice.
2. Decide who assigns the technician and at what Service Invoice status assignment becomes required.
3. Approve the exact customer acknowledgment statement.
4. Decide whether representative position/department is required; this plan recommends at least one of them.
5. Define report correction and void authority after customer signature.
6. Set signature, attachment, and PDF retention/access policy.
7. Decide whether arrival/departure time and optional geolocation are business requirements. This plan excludes geolocation by default.
8. Confirm how Service Invoice item rows map to immutable Sales Order service-line IDs.
9. Add a non-fulfillable commercial-charge classification for quotation shipping before Service Report fulfillment goes live.
