# Water Treatment System Service Report implementation amendment

Planning baseline: 21 September 2026. Status: planned extension to the implemented General Service Report MVP. Read this document with `SERVICE-REPORT-MVP-PLAN.md`.

## 1. Scope

The application supports two immutable report types:

- `GENERAL` - the simple General Service Report already implemented by Cline.
- `WATER_TREATMENT` - the equipment and water-treatment inspection report defined here.

Both types reuse the parent `ServiceReports` record, Service Invoice assignment, customer snapshots, status/version/history, acknowledgment, drawn signature, Drive storage, numbering, and permissions. A Water Treatment System report additionally has exactly one `WaterTreatmentServiceReportDetails` row. General reports do not create a row in that tab.

One Service Invoice permits one active Service Report by default, regardless of type. Reopening the same invoice returns its existing report. If it has a different type, the UI explains the conflict instead of changing its type or creating a duplicate.

## 2. Field mapping

| Current form label | Application source |
|---|---|
| Email | User-entered email address |
| Client Name | User-entered; prefill from the Service Invoice/customer when available |
| Address | User-entered; prefill from the Service Invoice service site when available |
| Attended By | Assigned technician name snapshot |
| Acknowledge By | `AcknowledgedByFullName` entered by the customer representative |
| Conforme | Versioned acknowledgment statement plus required `ConsentConfirmed` checkbox |
| Upload Signature | Existing drawn-signature component and private Drive upload |
| Service Type | User-entered shared `ServiceReports.ServiceType` |

`Remarks` and `Recommendation` are separate water-treatment fields. Do not combine them into the General report's `FieldReport`. Water Treatment System validation ignores `FieldReport`.

## 3. Water Treatment System form sections

Render a dedicated Water Treatment System form using responsive cards. Desktop uses paired Before/After columns; small screens show each pair as a stacked card with persistent labels.

### Service information

- Service Invoice No. and report type (read-only)
- Email (user input)
- Client name and address (user input, with editable invoice/customer defaults)
- Service date and Service type (Service type is user input)
- Attended by (read-only assigned technician)

### Water quality and pre-filter

- Feed TDS - Before / After
- Pre Filter Inlet Pressure - Before / After

### RO1A

- Pure TDS - Before / After
- Inlet Pressure - Before / After
- Concentrate Pressure - Before / After
- Pure Flow - Before / After
- Concentrate Flow - Before / After

### RO1B

- Pure TDS - Before / After
- Inlet Pressure - Before / After
- Concentrate Pressure - Before / After
- Pure Flow - Before / After
- Concentrate Flow - Before / After

### RO2

- Pure TDS - Before / After
- Inlet Pressure - Before / After
- Concentrate Pressure - Before / After
- Pure Flow - Before / After
- Concentrate Flow - Before / After

### Loop, media, carbon, softener, and brine

- Start Loop Pressure - Before / After
- End Loop Pressure - Before / After
- Pre Media Pressure - Before / After
- Post Media Pressure - Before / After
- Post Carbon 1 Pressure - Before / After
- Post Carbon 2 Pressure - Before / After
- Post Softener Pressure - Before / After
- Brine Tank Level - Before / After

### Samples and equipment inspection

Both water-sample fields are user-entered free-text answers, matching the current Google Form's **Your answer** control. Every equipment field from **Raw Tank** through **UV Light** uses a controlled selector with exactly these stored values:

```text
WORKING
DEFECTIVE
```

Display them as **Working** and **Defective**. Do not accept arbitrary text or additional choices. Whether an unanswered value is permitted depends on the still-unconfirmed required/optional rule; when optional, store an unanswered field as blank rather than inventing a third status.

- Microbiological Water Sample
- PhysicalChemical Water Sample
- Raw Tank
- Raw Tank Low Level Sensor
- Raw Tank Float Valve
- Raw Tank Full/Refill
- Multi Media Control Valve
- Carbon 1 Control Valve
- Carbon 2 Control Valve
- Softener 1 Control Valve
- Softener 2 Control Valve
- Raw Pump A
- Raw Pump A - APC
- Raw Pump B
- Raw Pump B - APC
- CIP Low Level Sensor
- CIP Full/Refill
- RO Control Panel Terminal
- Feed Control Panel Terminal
- Distribution Control Panel Terminal
- RO1 Pump
- RO2 Pump
- RO1 Membrane
- RO2 Membrane
- RO1 Product Tank Low Level Sensor
- RO1 Product Tank Full/Refill Sensor
- RO2 Product Tank Low Level Sensor
- RO2 Product Tank Full/Refill Sensor
- Distribution Pump
- Pressure Sensors
- UV Light

### Findings and acknowledgment

- Remarks - multiline
- Recommendation - multiline
- Acknowledge By - required customer representative full name
- Position/department - optional under the shared MVP rule
- Conforme acknowledgment - required consent checkbox
- Drawn signature - required

## 4. Measurement and validation rules

- Store measurements as nullable trimmed text in version one. The supplied labels do not state units and entries may contain `N/A`, ranges, or instrument remarks.
- Email, Client Name, Address, Service Type, every Before/After measurement, `Microbiological Water Sample`, and `PhysicalChemical Water Sample` are technician-entered draft fields.
- Invoice/customer values may prefill Client Name and Address for convenience, but the technician may edit them before acknowledgment. Save the entered values as report snapshots; never mutate the source customer or Service Invoice.
- Validate Email as an email address after trimming. Store both water-sample answers as nullable trimmed text.
- The UI may use numeric-friendly input mode but must not coerce blanks to zero.
- Do not append `ppm`, `psi`, `LPM`, percentages, or other units until the business confirms each measurement family.
- Before and After are independent values. Do not require both unless an approved rule says so.
- Preserve explicit `N/A` separately from unanswered when the approved contract needs the distinction.
- Use a discriminated server request union keyed by `reportType`. Reject fields belonging to the other type.
- Water Treatment System readiness requires shared identity/service fields plus fields the business marks required. Do not fabricate requiredness.

## 5. Google Sheets changes

Append `ReportType` after `SignatureSize` in `ServiceReports` if it is not already present. Blank historical values resolve to `GENERAL` and are backfilled idempotently.

Create one tab named `WaterTreatmentServiceReportDetails` with this exact header order:

```text
ServiceReportId,EmailAddress,FeedTdsBefore,FeedTdsAfter,PreFilterInletPressureBefore,PreFilterInletPressureAfter,Ro1aPureTdsBefore,Ro1aPureTdsAfter,Ro1aInletPressureBefore,Ro1aInletPressureAfter,Ro1aConcentratePressureBefore,Ro1aConcentratePressureAfter,Ro1aPureFlowBefore,Ro1aPureFlowAfter,Ro1aConcentrateFlowBefore,Ro1aConcentrateFlowAfter,Ro1bPureTdsBefore,Ro1bPureTdsAfter,Ro1bInletPressureBefore,Ro1bInletPressureAfter,Ro1bConcentratePressureBefore,Ro1bConcentratePressureAfter,Ro1bPureFlowBefore,Ro1bPureFlowAfter,Ro1bConcentrateFlowBefore,Ro1bConcentrateFlowAfter,Ro2PureTdsBefore,Ro2PureTdsAfter,Ro2InletPressureBefore,Ro2InletPressureAfter,Ro2ConcentratePressureBefore,Ro2ConcentratePressureAfter,Ro2PureFlowBefore,Ro2PureFlowAfter,Ro2ConcentrateFlowBefore,Ro2ConcentrateFlowAfter,StartLoopPressureBefore,StartLoopPressureAfter,EndLoopPressureBefore,EndLoopPressureAfter,PreMediaPressureBefore,PreMediaPressureAfter,PostMediaPressureBefore,PostMediaPressureAfter,PostCarbon1PressureBefore,PostCarbon1PressureAfter,PostCarbon2PressureBefore,PostCarbon2PressureAfter,PostSoftenerPressureBefore,PostSoftenerPressureAfter,BrineTankLevelBefore,BrineTankLevelAfter,MicrobiologicalWaterSampleResult,PhysicalChemicalWaterSampleResult,RawTankStatus,RawTankLowLevelSensorStatus,RawTankFloatValveStatus,RawTankFullRefillStatus,MultiMediaControlValveStatus,Carbon1ControlValveStatus,Carbon2ControlValveStatus,Softener1ControlValveStatus,Softener2ControlValveStatus,RawPumpAStatus,RawPumpApcStatus,RawPumpBStatus,RawPumpBApcStatus,CipLowLevelSensorStatus,CipFullRefillStatus,RoControlPanelTerminalStatus,FeedControlPanelTerminalStatus,DistributionControlPanelTerminalStatus,Ro1PumpStatus,Ro2PumpStatus,Ro1MembraneStatus,Ro2MembraneStatus,Ro1ProductTankLowLevelSensorStatus,Ro1ProductTankFullRefillSensorStatus,Ro2ProductTankLowLevelSensorStatus,Ro2ProductTankFullRefillSensorStatus,DistributionPumpStatus,PressureSensorsStatus,UvLightStatus,Remarks,Recommendation,CreatedAt,CreatedBy,UpdatedAt,UpdatedBy
```

`ServiceReportId` is both primary key and foreign key to `ServiceReports`. Future fields go at the end; never reorder existing columns.

The complete version-one tab set is:

1. `ServiceReports`
2. `WaterTreatmentServiceReportDetails`
3. `ServiceReportHistory`
4. `ServiceReportSequences`
5. `ServiceReportCommands`

The existing `ServiceInvoices` integration columns remain unchanged.

## 6. API, repository, and UI changes

- Add a Water Treatment System header constant and row-width assertion to the schema verifier.
- Write the parent and detail row as one logical report operation. Do not leave an incomplete parent Water Treatment System record after a detail-write failure.
- `POST /api/service-reports` requires `reportType` and returns the existing report for its Service Invoice. A type mismatch returns a business conflict with the existing report ID and type.
- Detail responses include `waterTreatmentDetails` only for `WATER_TREATMENT`.
- PATCH validates type-specific fields and expected version. `ReportType` is immutable.
- Pages dispatch from the stored type to dedicated General or Water Treatment System components.
- Keep the signature pad and acknowledgment endpoint shared.
- Duplicate message: `A service report already exists for this invoice. Open report AIC-SR-...`.

## 7. Water Treatment System PDF

Create a separate Water Treatment System PDF with shared identity fields, grouped Before/After measurement tables, an equipment/sample status table, separate Remarks and Recommendation, and shared acknowledgment/signature evidence. Repeat table headings and the report number as pages require.

Blank values render as an em dash or `Not recorded`; zero remains distinct from blank. Do not print unconfirmed engineering units.

## 8. Rollout

1. Back up the existing Service Report tabs and code contract.
2. Append `ReportType` and create `WaterTreatmentServiceReportDetails` with the exact header order.
3. Deploy compatibility first: blank type means `GENERAL`; General reports need no detail row.
4. Add schema verification and repository mapping.
5. Add the Water Treatment System form, detail view, validation, and PDF behind an admin-controlled feature flag.
6. Configure free-text water-sample answers and `WORKING`/`DEFECTIVE` selectors from Raw Tank through UV Light, then confirm required flags from the authorized legacy form.
7. Test with a staging Service Invoice and compare the generated PDF to the supplied company sample.
8. Enable Water Treatment System creation without changing General reports.

## 9. Acceptance tests

- Water Treatment System create produces one parent and one detail row sharing `ServiceReportId`.
- Repeated create opens the existing report and creates no duplicate.
- A different type for an invoice with an active report returns a clear conflict.
- General reports work without a Water Treatment System detail row.
- Blank measurements never become zero.
- Before/After pairs and all equipment statuses survive save, reload, detail, and PDF.
- Equipment statuses from Raw Tank through UV Light accept only `WORKING` or `DEFECTIVE`; arbitrary text and any other nonblank value are rejected server-side.
- Email, client, address, Service Type, measurements, and water-sample answers preserve the technician's entered draft values. Attended By remains the server-owned assigned-technician snapshot.
- Representative name, consent, and meaningful drawn signature are required.
- Signed reports are immutable and PDF failure remains retryable.
- The form works at 320, 360, 390, and 430 pixel widths without a horizontal measurement grid.

## 10. Remaining business confirmations

1. Which questions are required.
2. Units for each TDS, pressure, flow, and tank-level field.
3. Whether `PhysicalChemical Water Sample` needs different display punctuation or spacing.
4. Whether the supplied PDF is the mandatory final layout or an example submission.
