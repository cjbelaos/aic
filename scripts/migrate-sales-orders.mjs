// Phase 5 — Sales Order migration tool.
//
// Modes:
//   * dry-run (default): analyze the frozen snapshot and print the import plan.
//     Never reads or writes any spreadsheet.
//   * --verify: read back persisted staging state and report rows present.
//   * --apply: write to a STAGING workbook only. Requires --staging AND
//     --target-spreadsheet <id>. Live/legacy workbooks are never touched.
//
// Durable replay protection: every source line maps to a deterministic
// ImportKey (derived from the batch id and the source row). Before writing we
// read the target's SalesOrderImportMap tab and skip every key already
// present, so re-running the same snapshot adds ZERO new rows.
//
// Provenance & preserved unknowns: each import-map row records the source
// spreadsheet/sheet/row/batch and the SHA-256 of the source row. Lines with
// missing quantity or unit amount are routed to the REVIEW queue and are NOT
// written with invented zeros.
//
// Example:
//   node scripts/migrate-sales-orders.mjs --snapshot snapshot.json
//   node scripts/migrate-sales-orders.mjs --snapshot snapshot.json --apply --staging --target-spreadsheet <staging-id>
//   node scripts/migrate-sales-orders.mjs --snapshot snapshot.json --verify --target-spreadsheet <staging-id>
//   node scripts/migrate-sales-orders.mjs --self-test

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const HEADERS = {
  orders: ["SalesOrderId", "SalesOrderNo", "LegacyTrackerNo", "ReceivedDate", "CustomerId",
    "CustomerNameSnapshot", "CustomerTINSnapshot", "BillingAddressSnapshot", "ContactId",
    "ContactNameSnapshot", "ContactPhoneSnapshot", "DeliveryAddressSnapshot", "CustomerPONo",
    "QuotationNo", "PaymentTermId", "PaymentTermsSnapshot", "RequiredDate", "AssignedToUserId",
    "Currency", "OrderStatus", "FulfillmentStatus", "SubtotalExTax", "DiscountTotal", "TaxTotal",
    "GrandTotal", "Remarks", "Version", "ConfirmedAt", "ClosedAt", "CancelReason", "ImportQuality",
    "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  items: ["SalesOrderItemId", "SalesOrderId", "LineNo", "OrderCategory", "LineType", "ProductId",
    "ProductCodeSnapshot", "ProductNameSnapshot", "CustomerProductNameSnapshot", "Description",
    "UnitId", "UnitSnapshot", "Quantity", "UnitPrice", "PriceSource", "CustomerProductPriceId",
    "QuotationLineReference", "DiscountAmount", "TaxMode", "TaxRate", "SubtotalExTax", "TaxAmount",
    "LineTotal", "FulfilledQty", "CancelledQty", "LineStatus", "PriceOverrideReason", "CreatedAt",
    "CreatedBy", "UpdatedAt", "UpdatedBy"],
  importMap: ["ImportKey", "SourceSpreadsheetId", "SourceSheetId", "SourceRow", "SourceTrackerNo",
    "SourceHash", "TargetSalesOrderId", "TargetSalesOrderItemId", "ImportBatchId", "ImportStatus",
    "IssueCodes", "ImportedAt"],
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv.length > index + 1 ? process.argv[index + 1] : null;
}
const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

export function snapshotKey(row) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function stableId(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function planImport(snapshot) {
  const orders = new Map();
  const review = [];
  let lineCount = 0;
  const batchId = `BATCH-${snapshot.id ?? "local"}`;
  const source = { spreadsheetId: snapshot.spreadsheetId ?? "", sheetId: snapshot.trackerSheetId ?? "" };

  (snapshot.tracker ?? []).forEach((row, index) => {
    const sourceRow = index + 2;
    const trackerNo = String(row[0] ?? "").trim();
    const incomplete = isBlank(row[9]) || isBlank(row[10]);
    const key = snapshotKey(row);
    const importKey = `IMP-${source.spreadsheetId}-${source.sheetId}-${batchId}-${sourceRow}`;
    if (incomplete) {
      review.push({ sourceRow, trackerNo, importKey, issue: "incomplete line (quantity or unit amount missing); preserved as unknown for review" });
    }
    lineCount += 1;
    if (!orders.has(trackerNo)) {
      orders.set(trackerNo, {
        orderKey: stableId(`${source.spreadsheetId}:${source.sheetId}:${batchId}:${trackerNo || "row-" + sourceRow}`),
        trackerNo,
        receivedDate: String(row[1] ?? "").trim(),
        customer: String(row[4] ?? "").trim(),
        poRef: String(row[3] ?? "").trim(),
        category: String(row[2] ?? "").trim(),
        lines: [],
      });
    }
    const order = orders.get(trackerNo);
    if (!isBlank(order.customer) && order.customer !== String(row[4] ?? "").trim()) {
      review.push({ sourceRow, trackerNo, importKey, issue: "customer mismatch within the same tracker group" });
    }
    order.lines.push({
      importKey,
      lineNo: order.lines.length + 1,
      sourceRow,
      sourceHash: key,
      sku: String(row[6] ?? "").trim(),
      productName: String(row[7] ?? "").trim(),
      description: String(row[8] ?? "").trim(),
      qty: isBlank(row[9]) ? "" : row[9],
      unitAmount: isBlank(row[10]) ? "" : row[10],
      discount: row[11] === undefined || isBlank(row[11]) ? null : row[11],
      vat: row[12] === undefined || isBlank(row[12]) ? null : row[12],
      total: row[13] === undefined || isBlank(row[13]) ? null : row[13],
      lineKey: stableId(importKey),
      category: String(row[2] ?? "").trim(),
      remarks: String(row[5] ?? ""),
    });
  });

  return {
    batchId,
    source,
    orderCount: orders.size,
    lineCount,
    reviewCount: review.length,
    review,
    orders: [...orders.values()],
  };
}
const IMPORT_EDGE = 2; // first data row in every tab

function orderToColumns(order, importedAt) {
  return [
    order.orderKey, "", order.trackerNo, order.receivedDate, "",
    order.customer, "", "", "", "", "", "", order.poRef, "", "", "", "", "",
    "", "CONFIRMED", "UNFULFILLED", "", "", "", "", order.category, 1, "", "", "", "LEGACY_UNVERIFIED",
    importedAt, "migration-script", importedAt, "migration-script",
  ];
}

function lineToColumns(line, order, importedAt) {
  return [
    line.lineKey, order.orderKey, line.lineNo, line.category, "PRODUCT",
    "", line.sku, line.productName, "", line.description, "", "", line.qty, line.unitAmount,
    "LEGACY", "", "", line.discount ?? "", "", "", "", line.vat ?? "", line.total ?? "",
    0, 0, "ACTIVE", "", importedAt, "migration-script", importedAt, "migration-script",
  ];
}

function importMapColumns(line, order, source, importedAt, batchId) {
  return [
    line.importKey, source.spreadsheetId, source.sheetId, line.sourceRow, order.trackerNo,
    line.sourceHash, order.orderKey, line.lineKey, batchId, "IMPORTED", "", importedAt,
  ];
}

/** Existing ImportKeys in the target workbook (durable replay protection). */
export async function readPersistedImportKeys(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderImportMap!A2:A" });
  return new Set((response.data.values ?? []).map(row => String(row[0] ?? "")).filter(Boolean));
}

/** Provisions headers; tolerant when a tab already exists with a header row. */
export async function ensureSalesOrderHeaders(sheets, spreadsheetId) {
  for (const [tab, headers] of [["SalesOrders", HEADERS.orders], ["SalesOrderItems", HEADERS.items], ["SalesOrderImportMap", HEADERS.importMap]]) {
    const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:AZ1` });
    const actual = result.data.values?.[0] ?? [];
    if (headers.some((h, i) => actual[i] !== h)) throw new Error(`Provision/verify ${tab} headers before importing; no headers were overwritten.`);
  }
  return true;
}
/**
 * Applies one import plan to a STAGING workbook. Lines whose ImportKey already
 * exists are skipped (replay-protected). Each tracker group is committed as
 * ONE atomic batch (order header + item lines + import-map rows). Returns
 * write statistics for verification.
 */
export async function applyImportPlan(sheets, spreadsheetId, plan, { alreadyImported = new Set() } = {}) {
  const importedAt = new Date().toISOString();
  const source = plan.source;
  let writtenOrders = 0;
  let writtenLines = 0;
  let writtenMaps = 0;
  let skippedMaps = 0;
  let firstFreeRows = null;

  const locateFreeRows = async () => {
    if (firstFreeRows) return firstFreeRows;
    const read = async (range) => {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return (response.data.values ?? []).length;
    };
    firstFreeRows = {
      orders: (await read("SalesOrders!A2:AI")) + IMPORT_EDGE,
      items: (await read("SalesOrderItems!A2:AE")) + IMPORT_EDGE,
      importMap: (await read("SalesOrderImportMap!A2:A")) + IMPORT_EDGE,
    };
    return firstFreeRows;
  };

  const existingMaps = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderImportMap!A2:L" })).data.values ?? [];
  const hashes = new Map(existingMaps.filter(row => row[0]).map(row => [String(row[0]), String(row[5])]));
  const existingOrders = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrders!A2:AI" })).data.values ?? [];
  const orderIds = new Set(existingOrders.map(row => row[0]));
  for (const order of plan.orders) {
    for (const line of order.lines) {
      if (hashes.has(line.importKey) && hashes.get(line.importKey) !== line.sourceHash) throw new Error(`Changed source hash requires review: ${line.importKey}`);
      if (hashes.has(line.importKey)) alreadyImported.add(line.importKey);
    }
    const newLines = order.lines.filter((line) => !alreadyImported.has(line.importKey));
    skippedMaps += order.lines.length - newLines.length;
    if (newLines.length === 0) continue;
    const free = await locateFreeRows();
    const itemsRow = free.items;
    const ordersRow = free.orders;
    const mapRow = free.importMap;
    const itemRows = newLines.map((line) => lineToColumns(line, order, importedAt));
    const mapRows = newLines.map((line) => importMapColumns(line, order, source, importedAt, plan.batchId));
    // One atomic request: header + item lines + provenance rows together.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `SalesOrderItems!A${itemsRow}`, values: itemRows },
          { range: `SalesOrderImportMap!A${mapRow}`, values: mapRows },
          ...(!orderIds.has(order.orderKey) ? [{ range: `SalesOrders!A${ordersRow}`, values: [orderToColumns(order, importedAt)] }] : []),
        ],
      },
    });
    const newOrder = !orderIds.has(order.orderKey);
    if (newOrder) writtenOrders += 1;
    orderIds.add(order.orderKey);
    writtenLines += newLines.length;
    writtenMaps += newLines.length;
    firstFreeRows = { orders: ordersRow + (newOrder ? 1 : 0), items: itemsRow + newLines.length, importMap: mapRow + newLines.length };
  }
  return { writtenOrders, writtenLines, writtenMaps, skippedMaps };
}

/** Read-back verification: counts actually persisted rows in the target. */
export async function verifyPersistedState(sheets, spreadsheetId, plan) {
  const orders = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrders!A2:C" })).data.values ?? [];
  const items = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderItems!A2:B" })).data.values ?? [];
  const maps = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "SalesOrderImportMap!A2:F" })).data.values ?? [];
  return {
    ordersPresent: orders.filter((row) => row[0] && plan.orders.some(order => order.orderKey === row[0])).length,
    linesPresent: items.filter((row) => row[0] && plan.orders.some(order => order.lines.some(line => line.lineKey === row[0]))).length,
    mapsPresent: maps.length,
    expectedOrders: plan.orders.length,
    expectedLines: plan.lineCount,
  };
}
function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) {
      return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    }
    const parsed = JSON.parse(raw);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  throw new Error("Configure service-account credentials (GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY).");
}

/** In-memory Sheets boundary for the self-test (mock storage, not a fake gateway). */
function makeFakeSheets() {
  const tabs = { SalesOrders: [HEADERS.orders], SalesOrderItems: [HEADERS.items], SalesOrderImportMap: [HEADERS.importMap] };
  const api = {
    async get({ range }) {
      const [tabName, a1] = String(range).split("!");
      const tab = tabs[tabName] ?? (tabs[tabName] = [[]]);
      const startRow = Number((a1.match(/\d+/) ?? ["1"])[0]);
      const endLetter = String((a1.match(/[A-Z]+$/) ?? ["A"])[0]);
      const width = a1.endsWith("1") ? 52 : endLetter === "A" ? 1 : endLetter === "B" ? 2 : endLetter === "C" ? 3 : endLetter === "F" ? 6 : 52;
      const values = [];
      for (let r = startRow - 1; r < (a1.endsWith("1") ? 1 : tab.length); r++) values.push(tab[r].slice(0, width));
      return { data: { values } };
    },
    async batchUpdate({ requestBody }) {
      if (requestBody.valueInputOption !== "RAW") throw new Error("Migration text must use RAW.");
      for (const { range, values } of requestBody.data) {
        const [tabName, a1] = String(range).split("!");
        const tab = tabs[tabName] ?? (tabs[tabName] = [[]]);
        const startRow = Number((a1.match(/\d+/) ?? ["1"])[0]) - 1;
        values.forEach((rowValues, index) => {
          const target = startRow + index;
          while (tab.length <= target) tab.push([]);
          rowValues.forEach((cell, col) => { tab[target][col] = cell; });
        });
      }
      return { data: {} };
    },
  };
  return { spreadsheets: { values: api }, tabs };
}

const SNAPSHOT = {
  id: "self-test",
  spreadsheetId: "fake-source-1",
  trackerSheetId: "tabs-1",
  tracker: [
    ["2001", "2026-09-01", "Parts", "PO-0001", "ACME", "", "SKU-1", "Bolt", "Bolt M6", 4, 5, 0, 20, "", ""],
    ["2001", "2026-09-01", "Parts", "PO-0001", "ACME", "", "SKU-8", "Washer", "Washer M6", 8, 1, 0, 8, "", ""],
    ["2002", "2026-09-02", "Services/ Repair", "", "Beta", "", "SRV-1", "Labor", "Repair labor", 1, 800, 0, 800, "", ""],
    ["2003", "2026-09-03", "Parts", "", "Gamma", "", "SKU-9", "Nut", "Nut", null, 3, 0, 6, "", ""],
  ],
};

async function selfTest() {
  const sheets = makeFakeSheets();
  // Orders and item tabs need independent append positions.
  sheets.tabs.SalesOrders.push(...Array.from({ length: 8 }, (_, i) => [`existing-${i}`]));
  const spreadsheetId = "fake-staging-1";
  const plan = planImport(SNAPSHOT);
  await ensureSalesOrderHeaders(sheets, spreadsheetId);
  const first = await applyImportPlan(sheets, spreadsheetId, plan, { alreadyImported: await readPersistedImportKeys(sheets, spreadsheetId) });
  const stateAfterFirst = await verifyPersistedState(sheets, spreadsheetId, plan);
  // Replay: persisted import-map keys make a second apply write ZERO rows.
  const second = await applyImportPlan(sheets, spreadsheetId, plan, { alreadyImported: await readPersistedImportKeys(sheets, spreadsheetId) });
  const stateAfterReplay = await verifyPersistedState(sheets, spreadsheetId, plan);
  const reviewRouted = plan.review.some((entry) => entry.sourceRow === 5);
  const checks = {
    ordersCreated: first.writtenOrders === 3,
    linesCreated: first.writtenLines === 4 && stateAfterFirst.linesPresent === 4,
    provenance: stateAfterFirst.mapsPresent === 4,
    replayWritesZero: second.writtenOrders === 0 && second.writtenLines === 0,
    replayAddsZeroRows: stateAfterFirst.linesPresent === stateAfterReplay.linesPresent && stateAfterFirst.mapsPresent === stateAfterReplay.mapsPresent,
    reviewRouted,
    existingOrdersPreserved: sheets.tabs.SalesOrders[8][0] === "existing-7",
    unknownTotalPreserved: sheets.tabs.SalesOrderItems[1][22] === "",
    missingQuantityPreserved: sheets.tabs.SalesOrderItems[4][12] === "",
  };
  const changedPlan = planImport({ ...SNAPSHOT, tracker: SNAPSHOT.tracker.map((row, i) => i ? row : row.map((cell, j) => j === 9 ? 999 : cell)) });
  let changedRejected = false;
  try { await applyImportPlan(sheets, spreadsheetId, changedPlan); } catch (error) { changedRejected = /Changed source hash/.test(error.message); }
  checks.changedSnapshotRejected = changedRejected;
  let readFailed = false;
  try { await readPersistedImportKeys({ spreadsheets: { values: { get: async () => { throw new Error("read unavailable"); } } } }, spreadsheetId); }
  catch { readFailed = true; }
  checks.failedReadCannotBeEmptyWorkbook = readFailed;
  if (Object.values(checks).some((pass) => !pass)) {
    console.error("migrate self-test FAILED", JSON.stringify({ checks, first, second, stateAfterFirst }, null, 2));
    return false;
  }
  console.log(
    "migrate-sales-orders self-test passed: atomic staging apply persisted orders/lines/import-map, " +
    "replay added zero rows, review lines were routed without inventing zeros.",
  );
  return true;
}
async function main() {
  if (process.argv.includes("--self-test")) {
    return (await selfTest()) ? 0 : 1;
  }
  const snapshotPath = argValue("--snapshot");
  if (!snapshotPath || !existsSync(snapshotPath)) {
    console.log("Usage: node scripts/migrate-sales-orders.mjs --snapshot snapshot.json [--apply --staging --target-spreadsheet <id> | --verify --target-spreadsheet <id>]");
    return 2;
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const plan = planImport(snapshot);
  const apply = process.argv.includes("--apply");
  const staging = process.argv.includes("--staging");
  const target = argValue("--target-spreadsheet");
  const verify = process.argv.includes("--verify");

  if (apply) {
    if (target !== process.env.SALES_ORDER_MIGRATION_STAGING_ID || !target || target === snapshot.spreadsheetId || target === process.env.GOOGLE_SHEET_ID_DATABASE || target === process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID) {
      throw new Error("Explicit SALES_ORDER_MIGRATION_STAGING_ID must match an isolated staging target distinct from source/app/reporting workbooks.");
    }
    if (!staging || !target) {
      console.log("Applied runs require both --staging and --target-spreadsheet <id> (staging-copy verification before cutover).");
      return 3;
    }
    const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    await ensureSalesOrderHeaders(sheets, target);
    const alreadyImported = await readPersistedImportKeys(sheets, target);
    const result = await applyImportPlan(sheets, target, plan, { alreadyImported });
    const persisted = await verifyPersistedState(sheets, target, plan);
    console.log(JSON.stringify({ applyStyle: true, target, batchId: plan.batchId, result, persisted, review: plan.review }, null, 2));
    return 0;
  }
  if (verify) {
    if (!target) {
      console.log("--verify requires --target-spreadsheet <id>.");
      return 3;
    }
    const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    const persisted = await verifyPersistedState(sheets, target, plan);
    console.log(JSON.stringify({ verify: true, target, batchId: plan.batchId, persisted }, null, 2));
    return 0;
  }

  console.log(JSON.stringify({
    applyStyle: false,
    batchId: plan.batchId,
    orders: plan.orderCount,
    lines: plan.lineCount,
    reviewQueue: plan.review,
    totalsKeepSeparate: "source totals are preserved verbatim; recalculated totals are compared separately at reconciliation",
  }, null, 2));
  return 0;
}

process.exitCode = await main();
