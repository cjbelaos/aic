/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only by default. --apply adds application records only; never edits the source tracker.
const fs = require("node:fs"), crypto = require("node:crypto");
const load = require("./proforma-runtime.cjs").createLoader();
async function main() {
  const { getDatabaseSpreadsheetId, getSheetsClient } = load("src/lib/googleSheets.ts");
  const { PROFORMA_TAB, PROFORMA_HEADERS, PROFORMA_LEGACY_HEADERS, proformaToRow, readProformas, readProformaRawRows, withProformaLock } = load("src/lib/proforma/repository.ts");
  const { readProformaSource } = load("src/lib/proforma/tracker.ts");
  const { readSalesOrders } = load("src/lib/salesOrders/repository.ts");
  const { buildProformaMigration } = load("src/lib/proforma/migration.ts");
  const source = await readProformaSource();
  const sheets = await getSheetsClient(), spreadsheetId = await getDatabaseSpreadsheetId();
  if (spreadsheetId === source.spreadsheetId) throw new Error("Expected a separate application database, not the source tracker.");
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const tab = metadata.data.sheets.find(sheet => sheet.properties.title === PROFORMA_TAB);
  const existing = tab ? await readProformas() : [];
  const destinationRaw = tab ? await readProformaRawRows() : [];
  const oldHeaders = destinationRaw[0] ?? [];
  const removeSyncError = PROFORMA_LEGACY_HEADERS.every((header, index) => oldHeaders[index] === header);
  if (removeSyncError && destinationRaw.slice(1).some(row => row[23])) throw new Error("Existing failed source writes need review before removing their diagnostic column.");
  const orders = await readSalesOrders();
  const plan = buildProformaMigration(source.rows, orders, existing, new Date().toISOString());
  const sourceHash = crypto.createHash("sha256").update(JSON.stringify(source.rows)).digest("hex");
  const report = { mode: process.argv.includes("--apply") ? "apply" : "dry-run", sourceSpreadsheetId: source.spreadsheetId, sourceSheetId: source.sheetId, sourceHash,
    removeSyncError, importCount: plan.imports.length, linkedCount: plan.imports.filter(invoice => invoice.salesOrderId).length, total: plan.imports.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    issues: plan.issues, skipped: plan.skipped, numbers: plan.imports.map(invoice => ({ row: invoice.sourceRow, tr: invoice.trNo, original: invoice.sourceInvoiceNo, target: invoice.invoiceNo, linked: !!invoice.salesOrderId })),
  };
  if (process.argv.includes("--verify-last-backup")) {
    const latest = fs.readdirSync("tmp").filter(name => /^proforma-migration-backup-\d+\.json$/.test(name)).sort().at(-1);
    if (!latest) throw new Error("No proforma backup found.");
    const backup = JSON.parse(fs.readFileSync(`tmp/${latest}`, "utf8"));
    for (const invoice of backup.existing) if (JSON.stringify(existing.find(row => row.id === invoice.id)) !== JSON.stringify(invoice)) throw new Error(`Existing record differs from backup: ${invoice.invoiceNo}.`);
    report.preservedRecordCount = backup.existing.length;
  }
  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync("tmp/proforma-migration-plan.json", JSON.stringify(report, null, 2));
  if (process.argv.includes("--apply")) {
    await withProformaLock(async () => {
      const fresh = await readProformaSource();
      if (crypto.createHash("sha256").update(JSON.stringify(fresh.rows)).digest("hex") !== sourceHash) throw new Error("Source changed since planning. Rerun the migration.");
      const current = tab ? await readProformas() : [];
      if (JSON.stringify(current) !== JSON.stringify(existing)) throw new Error("Destination changed since planning. Rerun the migration.");
      if (tab && JSON.stringify(await readProformaRawRows()) !== JSON.stringify(destinationRaw)) throw new Error("Destination schema or data changed. Rerun the migration.");
      fs.writeFileSync(`tmp/proforma-migration-backup-${Date.now()}.json`, JSON.stringify({ existing, destinationRaw, sourceRows: source.rows, sourceHash }, null, 2));
      const sheetId = tab?.properties.sheetId ?? Math.floor(Math.random() * 1e9) + 1;
      const values = [PROFORMA_HEADERS, ...existing.map(proformaToRow), ...plan.imports.map(proformaToRow)];
      const requests = [];
      if (removeSyncError) requests.push({ deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: 23, endIndex: 24 } } });
      if (!tab) requests.push({ addSheet: { properties: { sheetId, title: PROFORMA_TAB, gridProperties: { rowCount: 1000, columnCount: PROFORMA_HEADERS.length, frozenRowCount: 1 } } } });
      requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: values.length, startColumnIndex: 0, endColumnIndex: PROFORMA_HEADERS.length }, rows: values.map(row => ({ values: row.map(value => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: String(value) } })) })), fields: "userEnteredValue" } });
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      const readback = await readProformas();
      if (readback.length !== existing.length + plan.imports.length) throw new Error("Readback record count differs from migration plan.");
      for (const invoice of [...existing, ...plan.imports]) if (JSON.stringify(readback.find(row => row.id === invoice.id)) !== JSON.stringify(invoice)) throw new Error(`Readback mismatch for ${invoice.invoiceNo}.`);
      const sourceAfter = await readProformaSource();
      if (crypto.createHash("sha256").update(JSON.stringify(sourceAfter.rows)).digest("hex") !== sourceHash) throw new Error("Source tracker changed during migration; inspect before proceeding.");
      report.verified = true;
    });
    fs.writeFileSync("tmp/proforma-migration-result.json", JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
