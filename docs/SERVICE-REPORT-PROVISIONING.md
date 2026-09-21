# Service Report schema provisioning (manual)

The Service Report module reads five Google Sheets tabs. Nothing in this
repository creates or modifies the live spreadsheet: provision these changes by
hand, then run the read-only verifier.

Read-only verification:

```text
node --env-file=.env.local scripts/verify-service-report-schema.mjs
```

Print the exact header rows (no sheet access required):

```text
node scripts/verify-service-report-schema.mjs --print-headers
```

## 1. ServiceReports: canonical 34-column schema (A:AH)

Row 1 of `ServiceReports` must contain these 34 headers, in this exact order:

| Col | Header | Col | Header |
|---|---|---|---|
| A | `ServiceReportId` | S | `SignatureDriveFileId` |
| B | `ServiceReportNo` | T | `SignatureUrl` |
| C | `ReportType` | U | `SignatureSha256` |
| D | `ServiceInvoiceNo` | V | `SignatureMimeType` |
| E | `CompanyId` | W | `SignatureSize` |
| F | `CompanyNameSnapshot` | X | `SignedAt` |
| G | `ClientNameSnapshot` | Y | `Status` |
| H | `ClientAddressSnapshot` | Z | `Version` |
| I | `AssignedTechnicianUserId` | AA | `PdfDriveFileId` |
| J | `AssignedTechnicianNameSnapshot` | AB | `PdfUrl` |
| K | `ServiceDate` | AC | `PdfGenerationStatus` |
| L | `ServiceType` | AD | `VoidReason` |
| M | `FieldReport` | AE | `CreatedAt` |
| N | `Remarks` | AF | `CreatedBy` |
| O | `AcknowledgedByFullName` | AG | `UpdatedAt` |
| P | `AcknowledgedByPosition` | AH | `UpdatedBy` |
| Q | `AcknowledgmentTextVersion` | | |
| R | `ConsentConfirmed` | | |

Notes:

- `ReportType` is column C. It is **not** appended after `SignatureSize` any
  more; `SignatureMimeType` (V) and `SignatureSize` (W) sit before `SignedAt`
  (X). This order is the contract used by the row mappers
  (`src/lib/serviceReports/reportRow.ts`) and by the verifier, which compares
  names AND order AND width.
- The `CompanyId` column (E) stores the domain field `ServiceReport.customerId`.
- Leave historical `ReportType` cells blank. A blank value resolves to
  `GENERAL`.
- Optional idempotent backfill (writes `GENERAL` only into blank `ReportType`
  cells, after resolving that column from the live header row):

```text
node --env-file=.env.local scripts/backfill-service-report-types.mjs            # preview, read-only
node --env-file=.env.local scripts/backfill-service-report-types.mjs --apply    # writes GENERAL
```

- Data safety: reordering the header row does not move the data underneath it.
  If the header row is reordered, the values must be reordered in the same
  operation; that migration is out of scope here and requires explicit approval.

## 2. Create the WaterTreatmentServiceReportDetails tab

Create a tab named exactly `WaterTreatmentServiceReportDetails` and paste the
header row below into row 1 of that tab in this exact order. `ServiceReportId`
is both the primary key and the foreign key to `ServiceReports`, so a report has
at most one detail row. Do not add a JSON catch-all column. Do not reorder
existing columns; future fields go at the end.

Alternatively, provision it additively with the idempotent script below, which
creates the tab only when it is missing and writes row 1 only (it reads the
headers from `src/lib/serviceReports/constants.ts`, so they cannot drift):

```text
node --env-file=.env.local scripts/provision-water-treatment-details-tab.mjs          # preview, read-only
node --env-file=.env.local scripts/provision-water-treatment-details-tab.mjs --apply  # creates tab + row 1
```

```text
# ServiceReports (34 columns, exact canonical order A:AH, ReportType in column C):
ServiceReportId,ServiceReportNo,ReportType,ServiceInvoiceNo,CompanyId,CompanyNameSnapshot,ClientNameSnapshot,ClientAddressSnapshot,AssignedTechnicianUserId,AssignedTechnicianNameSnapshot,ServiceDate,ServiceType,FieldReport,Remarks,AcknowledgedByFullName,AcknowledgedByPosition,AcknowledgmentTextVersion,ConsentConfirmed,SignatureDriveFileId,SignatureUrl,SignatureSha256,SignatureMimeType,SignatureSize,SignedAt,Status,Version,PdfDriveFileId,PdfUrl,PdfGenerationStatus,VoidReason,CreatedAt,CreatedBy,UpdatedAt,UpdatedBy
```

```text
# WaterTreatmentServiceReportDetails (89 columns, exact order):
ServiceReportId,EmailAddress,FeedTdsBefore,FeedTdsAfter,PreFilterInletPressureBefore,PreFilterInletPressureAfter,Ro1aPureTdsBefore,Ro1aPureTdsAfter,Ro1aInletPressureBefore,Ro1aInletPressureAfter,Ro1aConcentratePressureBefore,Ro1aConcentratePressureAfter,Ro1aPureFlowBefore,Ro1aPureFlowAfter,Ro1aConcentrateFlowBefore,Ro1aConcentrateFlowAfter,Ro1bPureTdsBefore,Ro1bPureTdsAfter,Ro1bInletPressureBefore,Ro1bInletPressureAfter,Ro1bConcentratePressureBefore,Ro1bConcentratePressureAfter,Ro1bPureFlowBefore,Ro1bPureFlowAfter,Ro1bConcentrateFlowBefore,Ro1bConcentrateFlowAfter,Ro2PureTdsBefore,Ro2PureTdsAfter,Ro2InletPressureBefore,Ro2InletPressureAfter,Ro2ConcentratePressureBefore,Ro2ConcentratePressureAfter,Ro2PureFlowBefore,Ro2PureFlowAfter,Ro2ConcentrateFlowBefore,Ro2ConcentrateFlowAfter,StartLoopPressureBefore,StartLoopPressureAfter,EndLoopPressureBefore,EndLoopPressureAfter,PreMediaPressureBefore,PreMediaPressureAfter,PostMediaPressureBefore,PostMediaPressureAfter,PostCarbon1PressureBefore,PostCarbon1PressureAfter,PostCarbon2PressureBefore,PostCarbon2PressureAfter,PostSoftenerPressureBefore,PostSoftenerPressureAfter,BrineTankLevelBefore,BrineTankLevelAfter,MicrobiologicalWaterSampleResult,PhysicalChemicalWaterSampleResult,RawTankStatus,RawTankLowLevelSensorStatus,RawTankFloatValveStatus,RawTankFullRefillStatus,MultiMediaControlValveStatus,Carbon1ControlValveStatus,Carbon2ControlValveStatus,Softener1ControlValveStatus,Softener2ControlValveStatus,RawPumpAStatus,RawPumpApcStatus,RawPumpBStatus,RawPumpBApcStatus,CipLowLevelSensorStatus,CipFullRefillStatus,RoControlPanelTerminalStatus,FeedControlPanelTerminalStatus,DistributionControlPanelTerminalStatus,Ro1PumpStatus,Ro2PumpStatus,Ro1MembraneStatus,Ro2MembraneStatus,Ro1ProductTankLowLevelSensorStatus,Ro1ProductTankFullRefillSensorStatus,Ro2ProductTankLowLevelSensorStatus,Ro2ProductTankFullRefillSensorStatus,DistributionPumpStatus,PressureSensorsStatus,UvLightStatus,Remarks,Recommendation,CreatedAt,CreatedBy,UpdatedAt,UpdatedBy
```

Only the `WaterTreatmentServiceReportDetails` header line belongs in that new
tab; the `ServiceReports` line above is shown for reference. The tab carries
exactly these 89 columns (the application writer asserts the row width), and
`ServiceReportId` is both the primary key and the foreign key to
`ServiceReports`, so a single report owns at most one detail row.

General (non-water-treatment) reports never create a row in this tab.

## 3. Drive folder

Ensure `GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID` points at the private folder
used for customer signatures and final PDFs. Files stay private; the UI reads
them through the authenticated proxy.

## 4. Expected tab set

1. `ServiceReports` (34 columns, A:AH, canonical order above; `ReportType` in C)
2. `WaterTreatmentServiceReportDetails` (89 columns)
3. `ServiceReportHistory`
4. `ServiceReportSequences`
5. `ServiceReportCommands`

The `ServiceInvoices` integration columns `AssignedTechnicianUserId`,
`AssignedTechnicianName`, `ServiceReportId`, and `ServiceReportStatus` (O..R)
are unchanged.



