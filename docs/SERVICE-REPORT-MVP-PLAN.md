# Service Report MVP implementation plan

Planning baseline: 20 September 2026. Amended: 21 September 2026. Status: the General Service Report MVP has been implemented by Cline and awaits review; the Water Treatment System Service Report variant is a planned follow-up. This document defines the shared version-one module and takes precedence over the broader scope in `SERVICE-REPORT-IMPLEMENTATION-PLAN.md`.

## 0. Two service-report types

The company uses two distinct documents:

1. **General Service Report** - the simpler workflow represented by sample SR 1540 and already implemented in the MVP.
2. **Water Treatment System Service Report** - a separate company form currently represented by a restricted Google Form.

Do not merge their questions into one long form and do not treat "Water Treatment System" as a service type. Add a server-controlled report discriminator:

```text
GENERAL
WATER_TREATMENT
```

Both types share identity, Service Invoice/customer/technician snapshots, assignment checks, status, versioning, history, acknowledgment security, signature storage, Drive storage, and numbering infrastructure. Each type has its own field definition, validation, edit UI, detail presentation, and PDF template.

The water-treatment field inventory was supplied on 21 September 2026. Its schema, grouped form, storage contract, PDF, and rollout are defined in [`WATER-TREATMENT-SERVICE-REPORT-PLAN.md`](./WATER-TREATMENT-SERVICE-REPORT-PLAN.md). Email through both water-sample fields are user-entered; equipment fields from Raw Tank through UV Light use only `WORKING` or `DEFECTIVE`. The remaining unknowns are required flags, engineering units, and whether the supplied PDF is a mandatory layout or an example. Do not invent those values.

## 1. Version-one objective

Replace the current Google Form workflows with type-specific application pages connected to an existing Service Invoice.

The technician assigned to the Service Invoice records the completed work. A representative at the customer site reviews the report, enters their full name, and draws their signature on the device to acknowledge the service.

The implemented `GENERAL` variant mirrors the current General Service Report form:

- Company
- Client name
- Client address
- Service type
- Field report
- Remarks
- Attended by
- Acknowledged by
- Customer signature

The application supplies invoice, customer, assignment, user, timestamp, and report identity fields automatically where possible.

## 2. Confirmed behavior

- One active Service Report per Service Invoice.
- The Service Invoice must have an explicit `AssignedTechnicianUserId` and `AssignedTechnicianName`.
- Do not use `deliveredById` as the technician assignment; it retains its current document-handover meaning.
- The assigned technician and admins can create and edit the draft.
- The assigned technician is automatically shown as **Attended by**. Admins may change the technician only through the Service Invoice assignment, not by typing a different name into the report.
- **Acknowledged by** is the full name of the customer representative who attended or accepted the work.
- The customer representative draws their signature in the application. File upload is not the primary signature method.
- Once acknowledged, the report becomes read-only. An admin may void it with a reason; editing a signed report is not allowed in version one.
- Reopening the same Service Invoice returns its existing report instead of creating a duplicate.
- Version one does not automatically fulfill Sales Order service quantities. That integration follows after the basic report workflow is accepted in production.
- Every report has an immutable `ReportType` selected at creation. It cannot be changed after the draft is created.
- Existing Service Report records created before this amendment are migrated or interpreted as `GENERAL`.
- One Service Invoice has one active report by default, regardless of type. Creating the other type for an invoice that already has an active report requires an explicit future business decision; it is not silently allowed.

## 3. Simplified user flow

1. An admin assigns a technician on the Service Invoice.
2. The technician opens the Service Invoice and selects **Create General Service Report** or **Create Water Treatment System Service Report**. Only types enabled for that invoice are offered.
3. The application creates or opens the existing report and pre-fills:
   - Service Invoice number
   - Company/customer
   - Client address
   - Assigned technician
   - Current service date
4. The technician enters:
   - Service type
   - Field report describing the work performed
   - Remarks, if any
5. The technician selects **Ready for acknowledgment**.
6. The customer representative reviews the complete report, enters their full name and optional position, checks the acknowledgment statement, and draws their signature.
7. The technician submits the acknowledgment.
8. The application locks the report, allocates `AIC-SR-YYYY-NNNN`, saves the signature to Drive, and generates the final PDF.
9. The Service Invoice and Service Report pages display a link to the completed report and PDF.

## 4. Pages

| Route | Purpose |
|---|---|
| `/dashboard/service-reports` | List reports visible to the current user |
| `/dashboard/service-reports/new?invoiceNo=...&type=GENERAL` | Create or open a General report for a Service Invoice |
| `/dashboard/service-reports/new?invoiceNo=...&type=WATER_TREATMENT` | Create or open a Water Treatment System report for a Service Invoice |
| `/dashboard/service-reports/[id]` | View completed or draft report |
| `/dashboard/service-reports/[id]/edit` | Technician edits a draft |
| `/dashboard/service-reports/[id]/acknowledge` | Customer review and signature screen |

Add a **Create Service Report** menu to each eligible Service Invoice row and preview. The menu contains **General Service Report** and **Water Treatment System Service Report**. When a report already exists, replace creation actions with **View Service Report** and display its type.

If no technician is assigned, disable creation and show: ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œAssign a technician before creating a Service Report.ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â

## 5. Form design

Use the same page structure, cards, spacing, controls, loading feedback, and responsive behavior as Delivery Release and Sales Orders.

### Service information

- Service Report No. - read-only; displays `Draft` before acknowledgment
- Service Invoice No. - read-only
- Service date - required date field
- Company - read-only from Service Invoice
- Client name - read-only customer/company snapshot
- Client address - read-only address snapshot, with a draft-only correction field if the service site differs
- Service type - required short text or controlled selection
- Attended by - read-only assigned technician name
- Report type - read-only after creation and displayed as `General Service Report` or `Water Treatment System Service Report`

### General report

- Field report - required multiline text describing the work performed
- Remarks - optional multiline text for recommendations, unresolved issues, or follow-up

### Water Treatment System report

Implement the typed Water Treatment System contract in [`WATER-TREATMENT-SERVICE-REPORT-PLAN.md`](./WATER-TREATMENT-SERVICE-REPORT-PLAN.md). It includes every supplied Before/After measurement, sample and equipment check, Remarks, and Recommendation. The Water Treatment System page reuses the common shell and acknowledgment component but renders a dedicated Water Treatment System form. It must not place Water Treatment System answers into the General `FieldReport` or an untyped JSON/catch-all column.

Email, Client Name, Address, Service Type, all Before/After measurements, and both water-sample answers are technician-entered draft fields. The equipment choices are `WORKING` and `DEFECTIVE`. Required flags and measurement units must still be confirmed before production enablement.
### Customer acknowledgment

- Acknowledged by - required representative full name
- Position/department - optional in version one
- Acknowledgment checkbox - required
- Signature canvas - required
- Clear signature
- Redraw signature
- Submit acknowledgment

Display this statement immediately above the checkbox and signature:

> I acknowledge that the service described in this report was performed and that I had the opportunity to review the field report and remarks.

The final wording remains subject to business review.

## 6. Signature experience

- Support mouse, touch, stylus, and pointer events.
- Draw black strokes on a white background.
- Disable page scrolling while the user is drawing inside the canvas.
- Preserve the drawing when the viewport resizes or the device rotates.
- Provide Clear and Redraw actions.
- Reject an empty signature and very short accidental marks.
- Show the representative's typed full name beneath the canvas.
- Send the signature as PNG multipart data only when acknowledgment is submitted.
- Upload it to a private folder configured by `GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID`.
- Store Drive ID, authorized application URL, SHA-256 hash, size, MIME type, and signed timestamp. Do not store base64 data in Sheets or logs.

## 7. Google Sheets changes

The shared module uses the four implemented tabs plus the one-to-one `WaterTreatmentServiceReportDetails` tab. Add the report discriminator to `ServiceReports` and use the exact append-only Water Treatment System header contract in [`WATER-TREATMENT-SERVICE-REPORT-PLAN.md`](./WATER-TREATMENT-SERVICE-REPORT-PLAN.md).

### `ServiceReports`

```text
ServiceReportId,ServiceReportNo,ServiceInvoiceNo,CustomerId,CompanyNameSnapshot,ClientNameSnapshot,ClientAddressSnapshot,AssignedTechnicianUserId,AssignedTechnicianNameSnapshot,ServiceDate,ServiceType,FieldReport,Remarks,AcknowledgedByFullName,AcknowledgedByPosition,AcknowledgmentTextVersion,ConsentConfirmed,SignatureDriveFileId,SignatureUrl,SignatureSha256,SignedAt,Status,Version,PdfDriveFileId,PdfUrl,PdfGenerationStatus,VoidReason,CreatedAt,CreatedBy,UpdatedAt,UpdatedBy,SignatureMimeType,SignatureSize,ReportType
```

### `ServiceReportHistory`

```text
EventId,ServiceReportId,EventType,FromStatus,ToStatus,ChangedFieldsJson,Reason,CommandId,ActorUserId,CreatedAt
```

### `ServiceReportSequences`

```text
SequenceKey,Prefix,BusinessYear,LastNumber,UpdatedAt
```

### `ServiceReportCommands`

```text
CommandId,PayloadHash,CommandType,ServiceReportId,ResultVersion,ResultJson,CommittedAt,ActorUserId
```

Append these columns to the end of `ServiceInvoices`:

```text
AssignedTechnicianUserId,AssignedTechnicianName,ServiceReportId,ServiceReportStatus
```

Do not shift or rename existing columns.

Because the General MVP is already implemented, append `ReportType` after the existing `SignatureSize` column and update the repository and verification contracts together. Do not rename the implemented `CompanyNameSnapshot` or `ClientNameSnapshot` columns during this amendment. Treat blank historical report types as `GENERAL`, then run an idempotent backfill to write `GENERAL`.

The previously proposed tabs `ServiceReportActivities`, `ServiceReportAcknowledgments`, and `ServiceReportAttachments` are deferred. Their essential version-one values live in `ServiceReports`.

## 8. Statuses

| Status | Meaning |
|---|---|
| `DRAFT` | Technician can edit the report |
| `READY_FOR_ACKNOWLEDGMENT` | Technician content is complete and customer may review it |
| `ACKNOWLEDGED` | Customer signed; report content is locked |
| `PDF_FAILED` | Acknowledgment is saved but PDF generation needs retry |
| `VOID` | Admin invalidated the report with a reason |

Successful PDF generation remains represented by `Status = ACKNOWLEDGED` and `PdfGenerationStatus = READY`.

## 9. API contract

| Method and path | Responsibility |
|---|---|
| `GET /api/service-reports` | Role-scoped list |
| `POST /api/service-reports` | Create or return existing report from Service Invoice and required `reportType` |
| `GET /api/service-reports/[id]` | Report detail and allowed actions |
| `PATCH /api/service-reports/[id]` | Save draft using expected version |
| `POST /api/service-reports/[id]/ready` | Validate and open acknowledgment step |
| `POST /api/service-reports/[id]/acknowledge` | Multipart representative details, consent, and PNG signature |
| `POST /api/service-reports/[id]/pdf` | Generate or retry final PDF |
| `POST /api/service-reports/[id]/void` | Admin void with required reason |
| `GET /api/service-reports/[id]/history` | Report history |
| `GET /api/service-reports/options` | Eligible Service Invoices and users |

Every mutation uses a UUID command ID. Draft edits use an expected version. Server code owns the actor, timestamps, assignment checks, report number, hashes, transitions, and PDF state.

List and detail responses expose both the stable enum and display label. List filters support `reportType=GENERAL|WATER_TREATMENT`. Reject unknown types and reject attempts to change a report's type through PATCH.

## 10. Permissions

- Assigned technician: view, create, edit draft, mark ready, capture acknowledgment.
- Admin: all technician actions, assignment management, void, and PDF retry.
- Other internal users: read only if their role explicitly permits it.
- Customer representative: no application account; interacts only with the supervised acknowledgment screen on the technician's authenticated device.

The API must verify assignment on every request. Hiding buttons is insufficient.

## 11. Final PDF

For `GENERAL`, generate the existing simple A4 General Service Report matching the current company document:

- AIC header and Service Report number
- Service Invoice reference
- Date
- Company
- Client name
- Client address
- Service type
- Field report
- Remarks
- Attended by
- Acknowledged by and optional position
- Customer signature
- Signed date and time

PDF failure must not remove the acknowledgment. Mark PDF generation failed and allow an admin retry.

For `WATER_TREATMENT`, implement the separate PDF in [`WATER-TREATMENT-SERVICE-REPORT-PLAN.md`](./WATER-TREATMENT-SERVICE-REPORT-PLAN.md). Both templates use the same immutable acknowledgment/signature evidence and PDF failure/retry behavior. Store the report type in the document metadata and filename, for example `AIC-SR-2026-0001-General.pdf` or `AIC-SR-2026-0002-Water-Treatment.pdf`. Measurement units remain gated on business confirmation.

## 12. Acceptance tests

- Assigned technician can create and edit; unrelated user receives 403 through the API.
- Missing technician assignment blocks creation with a clear message.
- Repeated creation for one invoice returns the same report.
- Required service type and field report validation works.
- Draft conflict returns the current version without discarding typed content.
- Customer full name, consent, and meaningful signature are required.
- Mouse, touch, and stylus drawing work; Clear and Redraw work.
- Rotation/resize does not erase the signature.
- Lost acknowledgment response can be retried without a second report number or signature record.
- Signed report is read-only.
- Signature file stays private and is not stored in Sheets as base64.
- PDF failure preserves acknowledgment and supports retry.
- Void requires admin permission and a reason.
- Desktop and 320, 360, 390, and 430 pixel layouts remain usable.
- Report creation requires a valid immutable type.
- Existing blank-type reports resolve as `GENERAL` during migration compatibility.
- A General report renders only General fields and uses the General PDF.
- A Water Treatment System report renders only the approved water-treatment fields and uses the Water Treatment System PDF.
- PATCH cannot switch `GENERAL` to `WATER_TREATMENT` or the reverse.
- List, badges, filters, Service Invoice action labels, PDFs, and history show the correct report type.

## 13. Deferred scope

- Multiple visits or multiple reports per invoice
- Repeatable performed-service activity rows
- Parts and inventory consumption
- Before/after photos and general attachments
- Automatic Sales Order service fulfillment
- Fulfillment reversals from report voids
- Customer email delivery
- Geolocation
- Offline signature capture
- Supervisor approval
- Water Treatment System production enablement until required fields, measurement units, and final PDF layout are approved

These may be added after the basic report matches the current company workflow and passes user acceptance testing.
