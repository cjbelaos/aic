# Blank Product Name migration preflight

Status: verified dry run; database has not been changed.

Scope: source Product List & Inventory, rows where E (Product Name) is blank and F (General Description) is populated. Source range A1:K1969; 269 qualifying rows.

Source: https://docs.google.com/spreadsheets/d/1TRZza-JaXZrghA9CdqhYCVzJIT9JMNhbwR9y18cGoXk/edit#gid=460586876

Destination: https://docs.google.com/spreadsheets/d/11nHRgH2szW7CoKh-2VD5620tTwMYcBe1U6jzam6npd4/edit

## Verified additions

- 245 new Products using General Description as the name.
- 249 SupplierProducts additions: 245 linked to new Products, 4 linked to existing Products.
- 2 source rows already have verified supplier links: 69 and 337.
- Rows 233/235 are the same sampling cock with punctuation differences and identical unit/cost. Create once.
- 17 source rows are held pending clarification, including two duplicate pairs with conflicting prices.

All proposed additions use existing supplier COMP-308 (VITALITE TRADING CORP.), existing active category and unit records. Categories come from the source for new Products. Units map PC/PCS/1 PC to PIECE, UNIT to UNIT, and SACK/BUNDLE/METER/CAN/BAG/SET to their existing reference records. Missing selling prices stay blank; explicit zero stays zero. Preserve original descriptions, model numbers, dimensions, cost and selling price. Inventory status does not set catalog status. Create active records; do not alter existing selling prices or categories. Supplier preference should be true only when the Product has no active preferred supplier. No source sheet edits are proposed.

Existing Products receiving a missing supplier link:

- Source row 5: 10SL CARBON BLOCK HYDROSEP → PROD-000217 / COMP-308, cost 250.00.
- Source row 37: ANTI SCALANT BALL (SILIPHOS) → PROD-000581 / COMP-308, cost 430.00.
- Source row 213: STRAINER H 2809 TOP (6"-12") → PROD-000589 / COMP-308, cost 220.00.
- Source row 214: STRAINER H 2810 BOTTOM (6"-12") → PROD-000590 / COMP-308, cost 220.00.

## Required source decisions

- Row 7, CO-000006, 10SL EMPTY CARTRIDGE TRANSPARENT: Possible existing PROD-000219: source adds TRANSPARENT; confirm whether same cartridge.
- Row 33, CO-000022, ACTIVATED CARBON 8X12 PURE PRIME 23KILOS/SACK: Existing PROD-000588 uses PC; source cost is per SACK. Unit conversion or correction required.
- Row 45, PA-000018, BRINE TANK 80L BLUE W/ ACCS.: Possible existing PROD-000247; source specifies accessories and BUNDLE, existing is PC.
- Row 73, PA-000046, CNP CDLF 1-17 2HP 3PHASE FLANGE TYPE: Same description as row 74 but conflicting cost: 25330.50 versus 25623.00.
- Row 74, PA-000047, CNP CDLF 1-17 2HP 3PHASE FLANGE TYPE: Same description as row 73 but conflicting cost: 25623.00 versus 25330.50.
- Row 119, PA-000090, HOSE CHLORINATOR 1/4: Source unit 4 METER: confirm whether 250 is per 4-meter piece or per meter.
- Row 126, PA-000096, JACO FIBRA 1084-1/2mm x 1/4" MALE STRAIGHT: Missing source cost; do not assume zero.
- Row 158, PA-000126, MEMBRANE VONTRON 40X21: Possible existing PROD-000281 or PROD-000289; source omits model/ULP.
- Row 159, PA-000127, MEMBRANE VONTRON 40X40: Possible existing PROD-000290 via SP-000263; source omits model.
- Row 179, PA-000144, RUNXIN DIGITAL HEAD F63C1 SOFTENER: Missing unit; possible related F63C1 product has extra timer/specifications.
- Row 184, PA-000149, RUNXIN DIGITAL HEAD F67C1 SEDIMENT (4M3/H): Possible existing PROD-000041 via SP-000038; source omits TIMER and existing Product unit is BUNDLE.
- Row 201, PA-000165, SS304 CHECK VALVE 3/4": Possible existing PROD-000333 via SP-000306; source does not specify swing type.
- Row 253, PA-000216, ZYPE INSIDE REDUCER 1" X 3/4": Same description as row 288 but conflicting cost/selling price: 994/2982 versus 9/27.
- Row 288, PA-000251, ZYPE INSIDE REDUCER 1" X 3/4": Same description as row 253 but conflicting cost/selling price: 9/27 versus 994/2982.
- Row 764, PA-000442, DELTA PLC MPU Ss2 Series 8di/6do, RELAY OUTPUT/CPU MODULE: Possible existing PROD-000478; source description omits specific model. HENENG supplier differs from existing COMP-53.
- Row 765, PA-000443, DELTA PLC Expansion Module/IO Module: Possible existing PROD-000479 or PROD-000670; source omits model. HENENG supplier differs from existing COMP-53.
- Row 766, PA-000444, DELTA PLC Power Supply: Possible existing PROD-000480; source omits model. HENENG supplier differs from existing COMP-53.

Recommended handling: hold all unresolved rows while migrating verified additions. Do not create duplicate generic Products where a model-specific match remains plausible. HENENG TRADE CO., LTD normalizes to existing supplier COMP-341 HENENG TRADECO., LTD, but its three generic PLC descriptions still need product/model confirmation.

## Proposed Products and supplier links

The exact per-row data and all classifications are in blank-product-name-migration-preflight-2026-11-04.json. Proposed rows below retain source numbering for review.

- Row 5 (CO-000004): 10SL CARBON BLOCK HYDROSEP — link existing PROD-000217; unit UNIT-000002; cost 250.00; selling 0.00.
- Row 8 (CO-000007): 10SL GAC EMPRESS — new Product; unit UNIT-000002; cost 230.00; selling 0.00.
- Row 9 (CO-000008): 20BB CARBON PUREPRIME — new Product; unit UNIT-000002; cost 900.00; selling 0.00.
- Row 10 (CO-000009): 20BB EMPTY CARTRIDGE FOR RESIN HOUSING — new Product; unit UNIT-000002; cost 360.00; selling 0.00.
- Row 11 (CO-000010): 20 BB CARBON BLOCK PUREPRIME — new Product; unit UNIT-000002; cost 800.00; selling 0.00.
- Row 12 (CO-000011): 20BB X5m FILTER PUREPRIME — new Product; unit UNIT-000002; cost 380.00; selling 0.00.
- Row 13 (CO-000012): 20 BB CCK BL PLUMP GAC CARTRIDGE UDF — new Product; unit UNIT-000002; cost 800.00; selling 0.00.
- Row 14 (CO-000013): 20SL 10m FILTER PUREPRIME — new Product; unit UNIT-000002; cost 90.00; selling 0.00.
- Row 15 (CO-000014): 20SL 10m FILTER WATERCHECK — new Product; unit UNIT-000002; cost 90.00; selling 0.00.
- Row 17 (CO-000016): 20SL 5m FILTER WATERCHECK — new Product; unit UNIT-000002; cost 75.00; selling blank.
- Row 19 (CO-000018): 20SL EMPTY CARTRIDGE TRANSPARENT BLUE CAP — new Product; unit UNIT-000002; cost 192.00; selling blank.
- Row 20 (CO-000019): 20SL GAC EMPRESS — new Product; unit UNIT-000002; cost 0.00; selling blank.
- Row 22 (PA-000002): ACQUATEDELA ATJ-150 1.3HP(1.0KW) — new Product; unit UNIT-000026; cost 4,595.00; selling blank.
- Row 23 (PA-000003): ACQUATEDELA ATS-1000 1.3HP(1KW) — new Product; unit UNIT-000002; cost 4,800.00; selling blank.
- Row 28 (PA-000008): ACQUATEDELA CHV 8-3DCW 3HP (2.2KW) W/PRESSURE TANK — new Product; unit UNIT-000002; cost 22,815.00; selling blank.
- Row 29 (PA-000009): ACQUATEDELA CHV 8-3DCW 3HP (2.2KW) W/PRESSURE TANK INVERTER CONTROLLER WITH WIFI — new Product; unit UNIT-000002; cost 25,155.00; selling blank.
- Row 31 (CO-000020): AQUAMETER IN LITERS — new Product; unit UNIT-000002; cost 2,000.00; selling blank.
- Row 32 (CO-000021): AQUAMETER GALM-09 MODEL BK IN GALLONS — new Product; unit UNIT-000002; cost 2,000.00; selling blank.
- Row 34 (CO-000023): ALKALINE FILTER E-508 — new Product; unit UNIT-000002; cost 1,500.00; selling blank.
- Row 37 (CO-000026): ANTI SCALANT BALL (SILIPHOS) — link existing PROD-000581; unit UNIT-000002; cost 430.00; selling blank.
- Row 38 (PA-000011): AQ 230 SB CONDUCTIVITY MONITOR — new Product; unit UNIT-000002; cost 2,500.00; selling blank.
- Row 39 (PA-000012): BRACKET STEEL BB TAIWAN — new Product; unit UNIT-000002; cost 200.00; selling blank.
- Row 40 (PA-000013): BRACKET STEEL TW (NEW-SLIM) 20SL — new Product; unit UNIT-000002; cost 60.00; selling blank.
- Row 41 (PA-000014): BRACKET STEEL T3S TAIWAN — new Product; unit UNIT-000002; cost 250.00; selling blank.
- Row 42 (PA-000015): BRINE TANK JS/Y 1000L WT (BK CAP) — new Product; unit UNIT-000002; cost 19,000.00; selling blank.
- Row 43 (PA-000016): BRINE TANK 160-180 L W / ACCS. — new Product; unit UNIT-000005; cost 4,200.00; selling blank.
- Row 46 (PA-000019): BRINE WELL FOR BRINE TANK (64L/105L) — new Product; unit UNIT-000002; cost 200.00; selling blank.
- Row 47 (PA-000020): BUSHING REDUCER m-f 1" x 1/4" HEX PIPE STAINLESS — new Product; unit UNIT-000002; cost 80.00; selling blank.
- Row 48 (PA-000021): CAST IRON BUTTERFLY VALVE 3" — new Product; unit UNIT-000002; cost 2,117.00; selling blank.
- Row 49 (PA-000022): CHEMICAL TANK METERING TANK 100LITERS — new Product; unit UNIT-000002; cost 2,600.00; selling blank.
- Row 50 (PA-000023): CNP FAN FOR CDLF 1-19 (Y2-90-02) WT — new Product; unit UNIT-000002; cost 220.00; selling blank.
- Row 51 (PA-000024): CNP HORIZONTAL PUMP 2-40 — new Product; unit UNIT-000002; cost 11,700.00; selling blank.
- Row 56 (PA-000029): CNP HORIZONTAL PUMP CHL 8-30 (3HP)2.2KW-3PH — new Product; unit UNIT-000002; cost 19,008.00; selling 38,016.00.
- Row 57 (PA-000030): CHV 8-3DCW WITH WIFI — new Product; unit UNIT-000002; cost 25,155.00; selling 50,310.00.
- Row 58 (PA-000031): CNP VERTICAL PUMP CDLF 1-9 1HP(0.75KW)220V 1PH — new Product; unit UNIT-000002; cost 20,344.50; selling 40,689.00.
- Row 59 (PA-000032): CNP VERTIVAL PUMP CDLF 1-13 — new Product; unit UNIT-000002; cost 24,700.50; selling 49,401.00.
- Row 60 (PA-000033): CNP HRTL HORIZONTAL PUMP 2-60 (1.5 HP) 1PHASE 220V — new Product; unit UNIT-000002; cost 14,008.50; selling 28,017.00.
- Row 61 (PA-000034): CNP VERTICAL PUMP CDLF 2-11 3HP(2.2KW)220V — new Product; unit UNIT-000026; cost 24,586.00; selling 49,172.00.
- Row 62 (PA-000035): CNP VERTICAL PUMP 1-15 (2HP) 220-1PH — new Product; unit UNIT-000002; cost 26,100.00; selling 52,200.00.
- Row 63 (PA-000036): CNP VERTICAL PUMP CDLF 3-17 3HP(2.2KW)220V/440V-3HP — new Product; unit UNIT-000002; cost 27,504.00; selling 55,008.00.
- Row 66 (PA-000039): CNP VERTICAL PUMP CDMF 3-22 (5.5 HP) 220V 440V 3PHASE — new Product; unit UNIT-000002; cost 35,307.00; selling 70,614.00.
- Row 70 (PA-000043): CNP VERTICAL PUMP CDMF 1-17 (2HP) 220V/440V - 3PHASE — new Product; unit UNIT-000002; cost 25,330.50; selling blank.
- Row 75 (PA-000048): CNP CDMF 3-14 PUMP THREADED SINGLE PHASE — new Product; unit UNIT-000002; cost 25,798.50; selling blank.
- Row 78 (PA-000051): DIAPHRAGM PUMP 1.6GPM 160 PSI — new Product; unit UNIT-000002; cost 3,600.00; selling blank.
- Row 79 (PA-000052): DIAPHRAGM PUMP 1.8GPM 160 PSI — new Product; unit UNIT-000002; cost 3,600.00; selling blank.
- Row 80 (PA-000053): DSL-12SSIC MECHANICAL SEAL 2ND GEN. 1-4 TONS — new Product; unit UNIT-000002; cost 3,150.00; selling blank.
- Row 82 (PA-000055): EMPRESS ALKALINE MACHINE E-508 — new Product; unit UNIT-000026; cost 15,050.00; selling blank.
- Row 83 (PA-000056): EMPRESS DIAPHRAGM PUMP 1.6GPM 60PSI — new Product; unit UNIT-000002; cost 3,600.00; selling blank.
- Row 84 (PA-000057): EMPRESS EWF-100A W/ FITTINGS — new Product; unit UNIT-000026; cost 2,080.00; selling blank.
- Row 85 (PA-000058): EMPRESS EWF-100B — new Product; unit UNIT-000026; cost 1,600.00; selling blank.
- Row 86 (PA-000059): EMPRESS EWF-200 RO SYSTEM ST-50 — new Product; unit UNIT-000026; cost 7,850.00; selling blank.
- Row 87 (PA-000060): EMPRESS EWF-50 — new Product; unit UNIT-000026; cost 1,600.00; selling blank.
- Row 88 (PA-000061): EMPRESS HOSE 3/8" CREAM COLOR (150 MTER/ROLL) — new Product; unit UNIT-000007; cost 40.00; selling blank.
- Row 90 (PA-000063): FILTER HOUSING WITH BRACKET 10 INC NPT 3/4" WITH ACCS. — new Product; unit UNIT-000005; cost 520.00; selling 1,300.00.
- Row 91 (PA-000064): FILTER HOUSING 5" — new Product; unit UNIT-000002; cost 415.00; selling 1,037.50.
- Row 92 (PA-000065): FILMTEC TW30-1812 100 GPD — new Product; unit UNIT-000002; cost 2,800.00; selling blank.
- Row 93 (PA-000066): FILMTEC BW30-400 80X40 1.G — new Product; unit UNIT-000002; cost 32,000.00; selling blank.
- Row 94 (PA-000067): FILMTEC TW30-1812 50 GPD — new Product; unit UNIT-000002; cost 1,800.00; selling blank.
- Row 95 (PA-000068): FITTING STAINLESS SPC 1/2" (4X0.75) MALE STRAIGHT — new Product; unit UNIT-000002; cost 60.00; selling blank.
- Row 96 (PA-000069): FITTING STAINLESS SPCf 1/4" (4X0.75) FEMALE STRAIGHT — new Product; unit UNIT-000002; cost 60.00; selling blank.
- Row 97 (PA-000070): FITTING STAINLESS SPE 1/8" (4X7.5) TEE PLAIN — new Product; unit UNIT-000002; cost 60.00; selling blank.
- Row 98 (PA-000071): FLECK VALVE HEAD 5600 2.5" MEDIA — new Product; unit UNIT-000002; cost 4,037.50; selling blank.
- Row 99 (PA-000072): FLOWMETER PANEL 2 GPM (AQUA 176MM-SHORT) — new Product; unit UNIT-000002; cost 850.00; selling blank.
- Row 102 (CO-000027): FORMOSA VINYL ADHESIVE — new Product; unit UNIT-000008; cost 163.00; selling blank.
- Row 103 (PA-000075): FRP TANK 7"x40 " (-2.5-T) — new Product; unit UNIT-000005; cost 1,710.00; selling blank.
- Row 104 (PA-000076): FRP TANK 13" X 54"(-2.5T)WAVE CYBER BEIGE COLOR W/ ACCS. — new Product; unit UNIT-000005; cost 4,700.00; selling blank.
- Row 105 (PA-000077): FRP TANK 16" X 65"(-2.5T) WAVE CYBER BEIGE COLOR W/ ACCS. — new Product; unit UNIT-000002; cost 11,300.00; selling blank.
- Row 106 (PA-000078): FRP TANK 16" X 65"(-4T) WAVE CYBER BEIGE COLOR — new Product; unit UNIT-000002; cost 12,600.00; selling blank.
- Row 107 (PA-000079): FRP TANK 8" X 44"(-2.5-T) — new Product; unit UNIT-000002; cost 2,050.00; selling blank.
- Row 108 (PA-000080): FRP TANK 8" X 44"(-2.5T)WAVE CYBER BEIGE COLOR W/ ACCS. — new Product; unit UNIT-000005; cost 1,850.00; selling blank.
- Row 109 (PA-000081): FRP TANK 9" X 48"(-2.5T)WAVE CYBER BEIGE COLOR W/ ACCS. — new Product; unit UNIT-000005; cost 2,050.00; selling blank.
- Row 110 (PA-000082): FRP TANK 21"x62" (-4T) WAVE CYBER BEIGE COLOR W/ACCS. — new Product; unit UNIT-000005; cost 25,650.00; selling blank.
- Row 111 (PA-000083): FRP TANK 21"x62" (-4T-4B) WAVE CYBER BEIGE COLOR W/ACCS. — new Product; unit UNIT-000005; cost 28,650.00; selling blank.
- Row 112 (PA-000084): FRP TANK 42x72" (-6FT-6FB) WAVECYBER BEIGE COLOR — new Product; unit UNIT-000002; cost 85,000.00; selling blank.
- Row 113 (PA-000085): H9914-A FRP ADAPTER (4") (OCTAGON) (CLOSURE) — new Product; unit UNIT-000002; cost 530.00; selling blank.
- Row 114 (PA-000086): H9903-B FRP ADAPTER (4" X 2.5") BLACK COLOR — new Product; unit UNIT-000002; cost 350.00; selling blank.
- Row 115 (PA-000087): H9909-1 AIRCHECK FOR BRINE TANK — new Product; unit UNIT-000002; cost 350.00; selling blank.
- Row 116 (PA-000088): HALF-CAP NON SPILL TYPE FOR ROUND CONT. — new Product; unit UNIT-000002; cost 4.00; selling blank.
- Row 117 (CO-000028): HARDNESS TEST KIT — new Product; unit UNIT-000002; cost 1,500.00; selling blank.
- Row 118 (PA-000089): HEAT GUN AP 1600W MODEL — new Product; unit UNIT-000002; cost 550.00; selling blank.
- Row 120 (CO-000029): HI-GRADE RESIN H-C 100E 25L/SACK — new Product; unit UNIT-000009; cost 2,090.00; selling blank.
- Row 121 (PA-000091): HIGH PRESSURE HOSE 1/8 CHINAUST HOSE 4x0.75 mmtp — new Product; unit UNIT-000007; cost 35.00; selling blank.
- Row 122 (PA-000092): HYDRONOUTICS ESPA 3 — new Product; unit UNIT-000002; cost 12,500.00; selling blank.
- Row 123 (PA-000093): IN-LINE TDS MONITOR CONDUCTIVITY/MOTOR — new Product; unit UNIT-000002; cost 2,500.00; selling blank.
- Row 124 (PA-000094): JACO C-1068- 3/8mm x 1/2" MALE STRAIGHT CONNECTOR — new Product; unit UNIT-000002; cost 60.00; selling blank.
- Row 125 (PA-000095): JACO FIBRA 1066-3/8mm x 3/8" MALE STRAIGHT — new Product; unit UNIT-000002; cost 120.00; selling blank.
- Row 127 (PA-000097): JACO FIBRA 1086-1/2"MM 3/8" MALE STRAIGHT( US 220PSI) — new Product; unit UNIT-000002; cost 96.00; selling blank.
- Row 128 (PA-000098): JACO FIBRA 1088-1/2MM X 1/2" MALE STRAIGHT(US 220PSI) — new Product; unit UNIT-000002; cost 74.00; selling blank.
- Row 129 (PA-000099): JACO FIBRA 2564-3/8mm x 1/4" FEMALE STRAIGHT(US 220PSI) — new Product; unit UNIT-000002; cost 86.00; selling blank.
- Row 130 (PA-000100): JACO FIBRA 2566-3/8mm x 3/8" FEMALE STRAIGHT — new Product; unit UNIT-000002; cost 70.00; selling blank.
- Row 131 (PA-000101): JACO FIBRA 2588-1/2mm x 1/2" FEMALE STRAIGHT(US 220PSI) — new Product; unit UNIT-000002; cost 96.00; selling blank.
- Row 132 (PA-000102): JACO FIBRA 4088-1/2mm x 1/2" MALE ELBOW — new Product; unit UNIT-000002; cost 96.00; selling blank.
- Row 133 (PA-000103): JACO FIBRA 4588-1/2mm x 1/2" FEMALE ELBOW — new Product; unit UNIT-000002; cost 144.00; selling blank.
- Row 134 (PA-000104): JACO FIBRA 706-3/8mm x 3/8" UNION TEE — new Product; unit UNIT-000002; cost 158.00; selling blank.
- Row 135 (PA-000105): JACO FIBRA 708-1/2mm x 1/2" UNION TEE — new Product; unit UNIT-000002; cost 162.00; selling blank.
- Row 136 (PA-000106): JACO PN-8 - 1/2X1/2" MALE PIPE STRAIGHT — new Product; unit UNIT-000002; cost 100.00; selling blank.
- Row 137 (PA-000107): JACO PN-12 - 3/4 X 3/4"MALE PIPE STRAIGHT — new Product; unit UNIT-000002; cost 100.00; selling blank.
- Row 138 (PA-000108): JACO PN-4-1/4"X1/4"MALE-PIPE STRAIGHT (TW) PLASTIC NIPLE — new Product; unit UNIT-000002; cost 80.00; selling blank.
- Row 139 (PA-000109): JACO Z-1044- 1/4mm x 1/4" MALE STRAIGHT CONNECTOR — new Product; unit UNIT-000002; cost 80.00; selling blank.
- Row 140 (PA-000110): JACO Z-106 4 - 3/8MM X 1/4" MALE STRAIGHT CONNECTOR — new Product; unit UNIT-000002; cost 90.00; selling blank.
- Row 141 (PA-000111): JACO Z-1068- 3/8mm x 1/2" MALE STRAIGHT CONNECTOR — new Product; unit UNIT-000002; cost 75.00; selling blank.
- Row 142 (PA-000112): JACO Z-1088- 1/2mm x 1/2" MALE STRAIGHT CONNECTOR — new Product; unit UNIT-000002; cost 74.00; selling blank.
- Row 143 (PA-000113): JACO Z-4068- 3/8" X 1/2" MALE ELBOW CONNECTOR — new Product; unit UNIT-000002; cost 80.00; selling blank.
- Row 144 (PA-000114): JACO Z-4044-1/4x1/4" MALE ELBOW CONNECTOR (TW) — new Product; unit UNIT-000002; cost 80.00; selling blank.
- Row 145 (PA-000115): JACO Z-1564 3/8mmX1/4mm UNION CONN (TW) — new Product; unit UNIT-000002; cost 65.00; selling blank.
- Row 146 (PA-000116): JACO HOSE 3/8 10X6.5 BLUE — new Product; unit UNIT-000007; cost 75.00; selling blank.
- Row 147 (CO-000030): JAMES CUMMING ANTHRACITE 0.83MM (32L/SACK) — new Product; unit UNIT-000004; cost 2,260.00; selling blank.
- Row 148 (PA-000117): JOHN GUEST HOSE 1/2 BLUE (75m/roll) — new Product; unit UNIT-000007; cost 120.00; selling blank.
- Row 149 (PA-000118): JOHN GUEST HOSE 1/2 WHITE(75m/roll) — new Product; unit UNIT-000007; cost 90.00; selling blank.
- Row 150 (CO-000031): MANGANESE ZEOLITE 30KGS. — new Product; unit UNIT-000004; cost 2,600.00; selling blank.
- Row 151 (PA-000119): MAZAKI HIGH PRESSURE SWITCH MPC-30 — new Product; unit UNIT-000002; cost 800.00; selling blank.
- Row 154 (PA-000122): MAZAKI AUTOMATIC PUMP CONTROL 1  1/4 (MAC4) — new Product; unit UNIT-000002; cost 2,000.00; selling 4,500.00.
- Row 156 (PA-000124): APC MAZAKI MAC04 220-240V 50/60Hz 30A MAX 10Bar — new Product; unit UNIT-000002; cost 2,000.00; selling 4,500.00.
- Row 157 (PA-000125): MECHANICAL SEAL FOR HORIZONTAL PUMP — new Product; unit UNIT-000002; cost 780.00; selling blank.
- Row 160 (CO-000032): PEBBLES #10 — new Product; unit UNIT-000004; cost 650.00; selling blank.
- Row 161 (CO-000033): PEBBLES #5 — new Product; unit UNIT-000009; cost 550.00; selling blank.
- Row 162 (PA-000128): PIPE CUTTER DL 2506 — new Product; unit UNIT-000002; cost 478.00; selling blank.
- Row 163 (PA-000129): PRESSURE CONTROL VALVE 1/2" X1/4" — new Product; unit UNIT-000002; cost 600.00; selling blank.
- Row 172 (PA-000138): PRESSURE TANK G-28 STRGVRTL PRESSURE TK 28 GAL — new Product; unit UNIT-000002; cost 7,500.00; selling blank.
- Row 173 (CO-000034): PURE PRIME ACTIVATED CARBON 8 X 12 — new Product; unit UNIT-000002; cost 3,300.00; selling blank.
- Row 174 (PA-000139): RISER TUBE FOR 10X54 FRP — new Product; unit UNIT-000002; cost 220.00; selling blank.
- Row 176 (PA-000141): RO CONTROLLER W/ MANUAL FLUSHING — new Product; unit UNIT-000002; cost 3,150.00; selling blank.
- Row 177 (PA-000142): R.O TUBING HOSE 1/4" BL COLOR (300MTR/ROLL) — new Product; unit UNIT-000007; cost 35.00; selling blank.
- Row 178 (PA-000143): ROUND CONTAINER 5 GALLON — new Product; unit UNIT-000002; cost 122.00; selling blank.
- Row 181 (PA-000146): RUNXIN DIGITAL HEAD F63B1 SOFTENER (4M3/H) W/ STRAINER — new Product; unit UNIT-000005; cost 4,500.00; selling blank.
- Row 182 (PA-000147): RUNXIN DIGITAL HEAD F63P1 SOFTENER (4M3/H) — new Product; unit UNIT-000005; cost 3,200.00; selling blank.
- Row 183 (PA-000148): RUNXIN DIGITAL HEAD F67B1 SEDIMENT (4M3/H) W/ STRAINER — new Product; unit UNIT-000005; cost 4,500.00; selling blank.
- Row 186 (PA-000151): RUNXIN DIGITAL HEAD F74A1 SOFTENER 4"(10M3/H) — new Product; unit UNIT-000002; cost 9,800.00; selling blank.
- Row 187 (PA-000152): RUNXIN DIGITAL HEAD F74B1/N74B1 — new Product; unit UNIT-000002; cost 11,600.00; selling blank.
- Row 188 (PA-000153): RUNXIN DIGITAL HEAD F74B1/N74B1 SOFT 4" (10M3/H) TIMER — new Product; unit UNIT-000002; cost 12,095.00; selling blank.
- Row 189 (PA-000154): RUNXIN DIGITAL HEAD F75A1 SEDIMENT 4" (10m3/h) — new Product; unit UNIT-000002; cost 9,500.00; selling blank.
- Row 192 (PA-000157): RUNXIN DIGITAL HEAD N75B1/F75B1 SED (10M3/H) TIMER — new Product; unit UNIT-000002; cost 11,684.00; selling blank.
- Row 193 (PA-000158): RUNXIN MANUAL HEAD F56A3 SEDIMENT (4M3/H) — new Product; unit UNIT-000005; cost 1,080.00; selling blank.
- Row 194 (PA-000159): RUNXIN MANUAL HEAD F64a SOFTENER 2.5" (4M3/H) W/ STRAINER — new Product; unit UNIT-000002; cost 1,300.00; selling blank.
- Row 195 (PA-000160): RUNXIN DIGITAL HEAD F112A3/F78A3 SOFT (40M3/H) METER — new Product; unit UNIT-000002; cost 62,500.00; selling blank.
- Row 196 (CO-000035): SILICA SAND 25 KILOS/SACK — new Product; unit UNIT-000004; cost 550.00; selling blank.
- Row 199 (PA-000163): SOLENOID VALVE 1" BRASS SANLIXIN — new Product; unit UNIT-000002; cost 2,500.00; selling blank.
- Row 202 (PA-000166): SS304 VESSEL 4021 W/ PLASTIC END CAP — new Product; unit UNIT-000002; cost 3,500.00; selling blank.
- Row 203 (PA-000167): SS304 VESSEL 4040 W/ SS304 END CAP — new Product; unit UNIT-000002; cost 7,000.00; selling blank.
- Row 204 (PA-000168): SS304 VESSEL 4040 w/PLASTIC END CAP - A SEAMLESS — new Product; unit UNIT-000002; cost 4,500.00; selling blank.
- Row 208 (PA-000172): STRAINER H 182-1 THREADED TOP NPT 1 1/2(4") (182L) 21x62 — new Product; unit UNIT-000002; cost 836.00; selling blank.
- Row 209 (PA-000173): STRAINER H 182-PLAIN TOP NPT 1x 1/2" (4) FLECK 21x62 — new Product; unit UNIT-000002; cost 936.00; selling blank.
- Row 210 (PA-000174): STRAINER H 2805 TOP (6"-12") — new Product; unit UNIT-000002; cost 140.00; selling blank.
- Row 211 (PA-000175): STRAINER H 2807 BOTTOM (6"-12") — new Product; unit UNIT-000002; cost 140.00; selling blank.
- Row 212 (PA-000176): STRAINER H 2808 BOTTOM 4"(14"-36") 21x62 — new Product; unit UNIT-000002; cost 900.00; selling blank.
- Row 213 (PA-000177): STRAINER H 2809 TOP (6"-12") — link existing PROD-000589; unit UNIT-000002; cost 220.00; selling blank.
- Row 214 (PA-000178): STRAINER H 2810 BOTTOM (6"-12") — link existing PROD-000590; unit UNIT-000002; cost 220.00; selling blank.
- Row 215 (PA-000179): STRAINER H 173N TOP DIST. (42-48") — new Product; unit UNIT-000002; cost 6,000.00; selling blank.
- Row 216 (PA-000180): STRAINER HD 5674 DBL BTTM (48") — new Product; unit UNIT-000002; cost 8,800.00; selling blank.
- Row 217 (PA-000181): STRAINER HU 6370-B2 BTTM(18-21"53x174) (THICK) 21x62 — new Product; unit UNIT-000002; cost 2,400.00; selling blank.
- Row 218 (CO-000036): TITANIUM TEFLON TAPE 3/4" 10M — new Product; unit UNIT-000002; cost 10.00; selling blank.
- Row 219 (PA-000182): ULTRA VIOLET WONDER  LAMP 1GPM — new Product; unit UNIT-000002; cost 900.00; selling 1,800.00.
- Row 227 (PA-000190): ULTRA VIOLET WONDER SET 1 GPM CR-60 — new Product; unit UNIT-000006; cost 2,300.00; selling blank.
- Row 228 (PA-000191): ULTRA VIOLET WONDER SET 12 GPM W-720 — new Product; unit UNIT-000006; cost 12,000.00; selling blank.
- Row 229 (PA-000192): ULTRA VIOLET WONDER SET 2 GPM W-120 — new Product; unit UNIT-000006; cost 4,200.00; selling blank.
- Row 231 (PA-000194): ULTRA VIOLET WONDER SET 8 GPM W-480 — new Product; unit UNIT-000006; cost 7,500.00; selling blank.
- Row 232 (PA-000195): ULTRA VIOLET WONDER SET 24 GPM — new Product; unit UNIT-000006; cost 23,000.00; selling blank.
- Row 233 (PA-000196): VA-05 SAMPLING COCK 1/4" STAINLESS — new Product; unit UNIT-000002; cost 100.00; selling blank.
- Row 236 (PA-000199): VA-05 SAMPLING COCK 3/8"-STAINLESS — new Product; unit UNIT-000002; cost 120.00; selling blank.
- Row 239 (PA-000202): WLS-1 FLOAT SWITCH-NEW 3M — new Product; unit UNIT-000002; cost 300.00; selling blank.
- Row 243 (PA-000206): ZYPE 45 ELBOW PLAIN 1" — new Product; unit UNIT-000002; cost 18.00; selling 54.00.
- Row 244 (PA-000207): ZYPE 45 ELBOW PLAIN 1/2" — new Product; unit UNIT-000002; cost 7.00; selling 21.00.
- Row 245 (PA-000208): ZYPE 45 ELBOW PLAIN 3/4" — new Product; unit UNIT-000002; cost 12.00; selling 36.00.
- Row 246 (PA-000209): ZYPE 90 ELBOW PLAIN 1 X 1/2" — new Product; unit UNIT-000002; cost 48.00; selling 144.00.
- Row 247 (PA-000210): ZYPE 90 ELBOW PLAIN 1 X 1/4" — new Product; unit UNIT-000002; cost 36.00; selling 108.00.
- Row 248 (PA-000211): ZYPE 90 ELBOW PLAIN 1" — new Product; unit UNIT-000002; cost 19.00; selling 57.00.
- Row 249 (PA-000212): ZYPE 90 ELBOW PLAIN 1/2" (MALE) — new Product; unit UNIT-000002; cost 8.00; selling 24.00.
- Row 250 (PA-000213): ZYPE 90 ELBOW PLAIN 3/4" — new Product; unit UNIT-000002; cost 12.00; selling 36.00.
- Row 251 (PA-000214): ZYPE 90 ELBOW THREADED 1/2" (FEMALE) — new Product; unit UNIT-000002; cost 19.00; selling 57.00.
- Row 252 (PA-000215): ZYPE 90 ELBOW THREADED 3/4" — new Product; unit UNIT-000002; cost 23.00; selling 69.00.
- Row 254 (PA-000217): ZYPE DOUBLE UNION BALL VALVE 3/4" — new Product; unit UNIT-000002; cost 290.00; selling 870.00.
- Row 255 (PA-000218): ZYPE DOUBLE UNION BALL VALVE 1/2" — new Product; unit UNIT-000002; cost 217.00; selling 651.00.
- Row 256 (PA-000219): ZYPE DOUBLE UNION BALL VALVE 1" — new Product; unit UNIT-000002; cost 363.00; selling 1,089.00.
- Row 257 (PA-000220): ZYPE BALL CHECK VALVE 1/2" — new Product; unit UNIT-000002; cost 624.00; selling 1,872.00.
- Row 258 (PA-000221): ZYPE BALL CHECK VALVE 3/4" — new Product; unit UNIT-000002; cost 757.00; selling 2,271.00.
- Row 259 (PA-000222): ZYPE BALL VALVE 1'' — new Product; unit UNIT-000002; cost 96.00; selling 288.00.
- Row 260 (PA-000223): ZYPE BALL VALVE 1 1/2" — new Product; unit UNIT-000002; cost 188.00; selling 564.00.
- Row 261 (PA-000224): ZYPE BALL VALVE 1 1/4" — new Product; unit UNIT-000002; cost 123.00; selling 369.00.
- Row 262 (PA-000225): ZYPE BALL VALVE 1/2" — new Product; unit UNIT-000002; cost 51.00; selling 153.00.
- Row 263 (PA-000226): ZYPE BALL VALVE 3/4" — new Product; unit UNIT-000002; cost 74.00; selling 222.00.
- Row 264 (PA-000227): ZYPE CLAMP 1 X 1/2" — new Product; unit UNIT-000002; cost 28.00; selling 84.00.
- Row 265 (PA-000228): ZYPE CLAMP 1 X 1/4" — new Product; unit UNIT-000002; cost 22.00; selling 66.00.
- Row 266 (PA-000229): ZYPE CLAMP 1" — new Product; unit UNIT-000002; cost 19.00; selling 57.00.
- Row 267 (PA-000230): ZYPE CLAMP 1/2" — new Product; unit UNIT-000002; cost 14.00; selling 42.00.
- Row 268 (PA-000231): ZYPE CLAMP 3/4" — new Product; unit UNIT-000002; cost 16.00; selling 48.00.
- Row 269 (PA-000232): ZYPE COUPLING PLAIN 1 X 1/2" — new Product; unit UNIT-000002; cost 38.00; selling 114.00.
- Row 270 (PA-000233): ZYPE COUPLING PLAIN 1 X 1/4" — new Product; unit UNIT-000002; cost 19.00; selling 57.00.
- Row 271 (PA-000234): ZYPE COUPLING PLAIN 1" — new Product; unit UNIT-000002; cost 13.00; selling 39.00.
- Row 272 (PA-000235): ZYPE COUPLING PLAIN 1/2" — new Product; unit UNIT-000002; cost 5.50; selling 16.50.
- Row 273 (PA-000236): ZYPE COUPLING PLAIN 3/4" — new Product; unit UNIT-000002; cost 8.00; selling 24.00.
- Row 274 (PA-000237): ZYPE COUPLING (INS.) REDUCER THREADED 1/2" X 1/4" — new Product; unit UNIT-000002; cost 6.50; selling 19.50.
- Row 275 (PA-000238): ZYPE COUPLING THREADED 1" — new Product; unit UNIT-000002; cost 15.00; selling 45.00.
- Row 276 (PA-000239): ZYPE COUPLING THREADED 1/2" — new Product; unit UNIT-000002; cost 6.50; selling 19.50.
- Row 277 (PA-000240): ZYPE COUPLING THREADED 2" — new Product; unit UNIT-000002; cost 81.00; selling 243.00.
- Row 278 (PA-000241): ZYPE COUPLING THREADED 3/4" — new Product; unit UNIT-000002; cost 11.00; selling 33.00.
- Row 279 (PA-000242): ZYPE COUPLING THREADED 4" — new Product; unit UNIT-000002; cost 792.00; selling 2,376.00.
- Row 280 (PA-000243): ZYPE END CAP 1/2" — new Product; unit UNIT-000002; cost 5.50; selling 16.50.
- Row 281 (PA-000244): ZYPE END CAP THREADED 1/2" — new Product; unit UNIT-000002; cost 6.50; selling 19.50.
- Row 282 (PA-000245): ZYPE FLANGE W/ GASKET 1" — new Product; unit UNIT-000005; cost 185.00; selling 555.00.
- Row 283 (PA-000246): ZYPE FLANGE W/ GASKET 1" DN 25 — new Product; unit UNIT-000002; cost 169.00; selling 507.00.
- Row 284 (PA-000247): ZYPE FLANGE W/ GASKET 2" — new Product; unit UNIT-000005; cost 387.00; selling 1,161.00.
- Row 285 (PA-000248): ZYPE FLANGE W/ GASKET 4" — new Product; unit UNIT-000005; cost 770.00; selling 2,310.00.
- Row 286 (PA-000249): ZYPE INSIDE REDUCER 1 1/2" X 1 1/4" — new Product; unit UNIT-000002; cost 25.00; selling 75.00.
- Row 287 (PA-000250): ZYPE INSIDE REDUCER 1 1/4 X 1" — new Product; unit UNIT-000002; cost 14.00; selling 42.00.
- Row 289 (PA-000252): ZYPE INSIDE REDUCER 2" X 1 1/2" — new Product; unit UNIT-000002; cost 32.00; selling 96.00.
- Row 290 (PA-000253): ZYPE INSIDE REDUCER 3/4" X 1/2" — new Product; unit UNIT-000002; cost 5.50; selling 16.50.
- Row 291 (PA-000254): ZYPE MALE ADAPTOR 1 1/2 — new Product; unit UNIT-000002; cost 36.00; selling 108.00.
- Row 292 (PA-000255): ZYPE MALE ADAPTOR 1 1/4" — new Product; unit UNIT-000002; cost 25.00; selling 75.00.
- Row 293 (PA-000256): ZYPE MALE ADAPTOR 1" — new Product; unit UNIT-000002; cost 15.00; selling 45.00.
- Row 294 (PA-000257): ZYPE MALE ADAPTOR 1/2" — new Product; unit UNIT-000002; cost 6.50; selling 19.50.
- Row 295 (PA-000258): ZYPE MALE ADAPTOR 2" — new Product; unit UNIT-000002; cost 58.00; selling 174.00.
- Row 296 (PA-000259): ZYPE MALE ADAPTOR 3/4" — new Product; unit UNIT-000002; cost 10.00; selling 30.00.
- Row 297 (PA-000260): ZYPE MALE ADAPTOR 4" — new Product; unit UNIT-000002; cost 1,051.00; selling 3,153.00.
- Row 298 (PA-000261): ZYPE OUTSIDE REDUCER 1" X 1/2" — new Product; unit UNIT-000002; cost 13.00; selling 39.00.
- Row 299 (PA-000262): ZYPE OUTSIDE REDUCER 1" X 3/4" — new Product; unit UNIT-000002; cost 14.00; selling 42.00.
- Row 300 (PA-000263): ZYPE OUTSIDE REDUCER 3/4" x 1/2" — new Product; unit UNIT-000002; cost 8.00; selling 24.00.
- Row 301 (PA-000264): ZYPE UNION PATENTE PLAIN 2" — new Product; unit UNIT-000002; cost 278.00; selling 834.00.
- Row 302 (PA-000265): ZYPE UNION PATENTE PLAIN 1 1/2" — new Product; unit UNIT-000002; cost 170.00; selling 510.00.
- Row 303 (PA-000266): ZYPE UNION PATENTE PLAIN 1 1/4" — new Product; unit UNIT-000002; cost 106.00; selling 318.00.
- Row 304 (PA-000267): ZYPE UNION PATENTE PLAIN 1" — new Product; unit UNIT-000002; cost 71.00; selling 213.00.
- Row 305 (PA-000268): ZYPE UNION PATENTE PLAIN 1/2" — new Product; unit UNIT-000002; cost 34.00; selling 102.00.
- Row 306 (PA-000269): ZYPE UNION PATENTE PLAIN 3/4" — new Product; unit UNIT-000002; cost 45.00; selling 135.00.
- Row 307 (PA-000270): ZYPE UNION PATENTE THREADED 1 1/4" — new Product; unit UNIT-000002; cost 106.00; selling 318.00.
- Row 308 (PA-000271): ZYPE UNION PATENTE THREADED 1" — new Product; unit UNIT-000002; cost 71.00; selling 213.00.
- Row 309 (PA-000272): ZYPE UNION PATENTE THREADED 1/2" — new Product; unit UNIT-000002; cost 34.00; selling 102.00.
- Row 310 (PA-000273): ZYPE UNION PATENTE THREADED 3/4" — new Product; unit UNIT-000002; cost 45.00; selling 135.00.
- Row 311 (PA-000274): ZYPE PIPE  1/2" — new Product; unit UNIT-000002; cost 131.00; selling 393.00.
- Row 312 (PA-000275): ZYPE PIPE 1 1/2 (4 METERS) 21x62 — new Product; unit UNIT-000002; cost 557.00; selling 1,671.00.
- Row 313 (PA-000276): ZYPE PIPE 1 1/4 — new Product; unit UNIT-000002; cost 355.00; selling 1,065.00.
- Row 314 (PA-000277): ZYPE PIPE 1" — new Product; unit UNIT-000002; cost 315.00; selling 945.00.
- Row 315 (PA-000278): ZYPE PIPE 2" — new Product; unit UNIT-000002; cost 885.00; selling 1,770.00.
- Row 316 (PA-000279): ZYPE PIPE 3/4" — new Product; unit UNIT-000002; cost 204.00; selling 612.00.
- Row 317 (PA-000280): ZYPE PIPE 4" — new Product; unit UNIT-000002; cost 2,923.00; selling 5,846.00.
- Row 318 (PA-000281): ZYPE PPR S2.5PN20 WHITE PIPE 20mm x 3.4(1/2") — new Product; unit UNIT-000002; cost 156.00; selling 468.00.
- Row 319 (PA-000282): ZYPE PPR WHITE 90 ELBOW 25MM(3/4") — new Product; unit UNIT-000002; cost 10.00; selling 30.00.
- Row 320 (PA-000283): ZYPE PPR WHITE FEMALE ELBOW 25X3/4" — new Product; unit UNIT-000002; cost 65.00; selling 195.00.
- Row 321 (PA-000284): ZYPE PPR WHITE MALE ADAPTER TYPE 20 X 1/2" — new Product; unit UNIT-000002; cost 43.00; selling 129.00.
- Row 322 (PA-000285): ZYPE PPR WHITE MALE ADAPTER TYPE 25 X 3/4" — new Product; unit UNIT-000002; cost 58.00; selling 174.00.
- Row 323 (PA-000286): ZYPE PPR WHITE MALE ADAPTER TYPE A 32 X 1" — new Product; unit UNIT-000002; cost 152.00; selling 456.00.
- Row 324 (PA-000287): ZYPE PPR WHITE PLASTIC BALL VALVE 32MM 1" — new Product; unit UNIT-000002; cost 64.00; selling 192.00.
- Row 325 (PA-000288): ZYPE PPR WHITE FEMALE THRD UNION 32X1" — new Product; unit UNIT-000002; cost 178.00; selling 534.00.
- Row 326 (PA-000289): ZYPE PPR WHITE TEE PLAIN 32MM (1") — new Product; unit UNIT-000002; cost 21.00; selling 63.00.
- Row 327 (PA-000290): ZYPE PPR WHITE 90 ELBOW 32MM (1") — new Product; unit UNIT-000002; cost 17.00; selling 51.00.
- Row 328 (PA-000291): ZYPE PPR WHITE MALE THRD UNION PAT. 32X1" — new Product; unit UNIT-000002; cost 182.00; selling 546.00.
- Row 329 (PA-000292): ZYPE TEE PLAIN 1 1/2" — new Product; unit UNIT-000002; cost 77.00; selling 231.00.
- Row 330 (PA-000293): ZYPE TEE PLAIN 1 1/4" — new Product; unit UNIT-000002; cost 52.00; selling 156.00.
- Row 331 (PA-000294): ZYPE TEE PLAIN 1" — new Product; unit UNIT-000002; cost 30.00; selling 90.00.
- Row 332 (PA-000295): ZYPE TEE PLAIN 1/2" — new Product; unit UNIT-000002; cost 11.00; selling 33.00.
- Row 333 (PA-000296): ZYPE TEE PLAIN 3/4" — new Product; unit UNIT-000002; cost 16.00; selling 48.00.

## Execution checks

Before committing: re-read Products, SupplierProducts and qualifying source rows; reject changed source prices, units, names or supplier mappings; re-run duplicate checks; allocate ProductId and SupplierProductId from current maximum suffixes, generate unique ProductCode using the application's generator, check active reference IDs, preferred-supplier uniqueness and empty destination ranges. Save the pre-migration destination rows and the exact addition manifest. Extend the Products grid if needed. Apply related additions atomically, then read them back and verify values, unique IDs/codes, supplier references and every source-row outcome. Never overwrite existing rows to make space.

