# Product migration result — 4 November 2026

Migration applied and verified by reading every written cell back from the database.

- Added 250 Products in Products!A760:K1009.
- Added 255 SupplierProducts in SupplierProducts!A556:M810.
- Changed existing Product PROD-000588 (ACTIVATED CARBON 8X12 PURE PRIME 23KILOS/SACK) from PC to SACK at Products!E589, with update audit fields.
- Verified all existing destination cells against the saved backup, allowing only that approved unit correction and its audit fields.
- Verified exact new values, unique IDs/codes, valid product/supplier references, and no duplicate preferred supplier for affected Products.
- Two source rows were already linked; three duplicate source rows were consolidated.

## Confirmed corrections applied

- Source row 33: ACTIVATED CARBON 8X12 PURE PRIME 23KILOS/SACK; Product PROD-000588; supplier link SP-000573; unit UNIT-000004; cost 3300; selling blank.
- Source row 73: CNP CDLF 1-17 2HP 3PHASE FLANGE TYPE; Product PROD-000799; supplier link SP-000598; unit UNIT-000002; cost 25623; selling blank.
- Source row 119: HOSE CHLORINATOR 1/4 (4-METER PIECE); Product PROD-000838; supplier link SP-000637; unit UNIT-000002; cost 250; selling blank.
- Source row 126: JACO FIBRA 1084-1/2mm x 1/4" MALE STRAIGHT; Product PROD-000845; supplier link SP-000644; unit UNIT-000002; cost 100; selling blank.
- Source row 179: RUNXIN DIGITAL HEAD F63C1 SOFTENER; Product PROD-000884; supplier link SP-000683; unit UNIT-000005; cost 4620; selling blank.
- Source row 253: ZYPE INSIDE REDUCER 1" X 3/4"; Product PROD-001008; supplier link SP-000809; unit UNIT-000002; cost 9; selling 27.

UNIT-000002 = PC, UNIT-000004 = SACK, UNIT-000005 = BUNDLE. The hose name includes (4-METER PIECE), uses PC, and costs 250 per piece. ZYPE rows 253/288 use the user-confirmed cost 9 and selling price 27 and were added once. Pump rows 73/74 use cost 25623 and were added once. Blank source selling prices remained blank.

## Remaining source rows requiring product identification

- Row 7: 10SL EMPTY CARTRIDGE TRANSPARENT. Possible existing PROD-000219: source adds TRANSPARENT; confirm whether same cartridge.
- Row 45: BRINE TANK 80L BLUE W/ ACCS.. Possible existing PROD-000247; source specifies accessories and BUNDLE, existing is PC.
- Row 158: MEMBRANE VONTRON 40X21. Possible existing PROD-000281 or PROD-000289; source omits model/ULP.
- Row 159: MEMBRANE VONTRON 40X40. Possible existing PROD-000290 via SP-000263; source omits model.
- Row 184: RUNXIN DIGITAL HEAD F67C1 SEDIMENT (4M3/H). Possible existing PROD-000041 via SP-000038; source omits TIMER and existing Product unit is BUNDLE.
- Row 201: SS304 CHECK VALVE 3/4". Possible existing PROD-000333 via SP-000306; source does not specify swing type.
- Row 764: DELTA PLC MPU Ss2 Series 8di/6do, RELAY OUTPUT/CPU MODULE. Possible existing PROD-000478; source description omits specific model. HENENG supplier differs from existing COMP-53.
- Row 765: DELTA PLC Expansion Module/IO Module. Possible existing PROD-000479 or PROD-000670; source omits model. HENENG supplier differs from existing COMP-53.
- Row 766: DELTA PLC Power Supply. Possible existing PROD-000480; source omits model. HENENG supplier differs from existing COMP-53.

These nine rows were not migrated because generic names do not establish whether they are the same existing models, packages or units. Confirm the existing Product ID or state that each is a separate product; for row 45 also confirm the bundle contents/unit. HENENG already exists as COMP-341; rows 764–766 need model confirmation before adding supplier links to that supplier.

## Audit files

- blank-product-name-migration-final-manifest-2026-11-04.json — applied values, source-row decisions and IDs.
- blank-product-name-migration-backup-2026-11-04.json — destination values and native-cell metadata before migration.
- blank-product-name-migration-result-2026-11-04.json — verification result.
- Earlier preflight and initial manifest files are historical drafts; the final manifest above is authoritative.

Database: https://docs.google.com/spreadsheets/d/11nHRgH2szW7CoKh-2VD5620tTwMYcBe1U6jzam6npd4/edit

