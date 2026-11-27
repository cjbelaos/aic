// Reconciles a loaded database against its source snapshot (plan §3), computing each side independently:
// business-key coverage, money totals per document (exact decimals) and next document numbers.
// Prints business keys and counts only.
//
//   node --env-file=.env.local scripts/migration/reconcile.mjs <snapshotDir> [--db-env=STAGING_DATABASE_URL]
import { readFileSync } from "node:fs";
import pg from "pg";
import { TABLES, parseCols } from "./schema-map.mjs";
import { exactNumeric } from "./convert.mjs";

const dir = process.argv[2];
const envName = process.argv.find((a) => a.startsWith("--db-env="))?.split("=")[1] || "STAGING_DATABASE_URL";
const snap = JSON.parse(readFileSync(`${dir}/database.json`, "utf8"));
const report = JSON.parse(readFileSync(`${dir}/import-report.json`, "utf8"));
const client = new pg.Client({ connectionString: process.env[envName], ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql) => (await client.query(sql)).rows;
let failures = 0;
const check = (label, problems) => {
  if (problems.length) failures++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${label}${problems.length ? `\n       ${problems.slice(0, 10).join("\n       ")}${problems.length > 10 ? `\n       … ${problems.length - 10} more` : ""}` : ""}`);
};

// ── exact decimal arithmetic on strings ─────────────────────
const SCALE = 6;
const toUnits = (v) => {
  if (v === null || v === undefined || v === "") return 0n;
  const s = typeof v === "number" ? Number(exactNumeric(v)).toFixed(SCALE) : String(v).replace(/,/g, "").trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const units = BigInt((m[2] || "0") + (m[3] || "").padEnd(SCALE, "0").slice(0, SCALE));
  return m[1] ? -units : units;
};
const fmt = (u) => { const neg = u < 0n; const a = (neg ? -u : u).toString().padStart(SCALE + 1, "0"); return `${neg ? "-" : ""}${a.slice(0, -SCALE)}.${a.slice(-SCALE).replace(/0+$/, "") || "0"}`; };

// ── snapshot access by header ───────────────────────────────
function sheetRows(tab) {
  const { formatted, raw } = snap.tabs[tab];
  const header = (formatted[0] || []).map((h) => String(h ?? "").trim());
  return formatted.slice(1).map((f, i) => ({ f, r: raw[i + 1] || [], row: i + 2 }))
    .filter(({ f }) => f.some((v) => String(v ?? "").trim() !== ""))
    .map(({ f, r, row }) => ({ row, get: (h) => { const k = header.indexOf(h); return { f: String(f[k] ?? "").trim(), r: r[k] }; } }));
}
const skipped = (table) => new Set([...(report.rejected[table] || []), ...(report.excluded[table] || [])].map((x) => x.source_row));

// 1. Business keys: every snapshot key is in the database unless the importer reported skipping it.
for (const t of TABLES) {
  if (!t.pk || t.special) continue;
  const col = parseCols(t).find((c) => c.column === t.pk);
  const isInt = col.type === "i";
  const norm = (v) => (isInt ? String(Number(v)) : String(v));
  const skip = skipped(t.table);
  const rekeyed = new Map((report.rekeyed[t.table] || []).map((x) => [x.source_row, x.reason.split(" kept as ")[1]]));
  const expected = new Set(sheetRows(t.tab).filter((x) => !skip.has(x.row)).map((x) => {
    const v = col.index !== undefined ? null : x.get(col.header).f;
    return rekeyed.get(x.row) ?? norm(v);
  }));
  const actual = new Set((await q(`select ${t.pk}::text k from aic.${t.table}`)).map((r) => norm(r.k)));
  const missing = [...expected].filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expected.has(k));
  if (missing.length || extra.length) check(`keys ${t.table}`, [...missing.map((k) => `missing ${k}`), ...extra.map((k) => `extra ${k}`)]);
}
check("business keys: every table", []);

// 2. Money totals per document.
async function compareTotals(label, tab, keyHeader, amountHeader, sql) {
  const skip = new Set([...skipped(TABLES.find((t) => t.tab === tab).table)]);
  const src = new Map();
  for (const x of sheetRows(tab)) {
    if (skip.has(x.row)) continue;
    const key = x.get(keyHeader).f || "∅";
    const a = x.get(amountHeader);
    const u = toUnits(typeof a.r === "number" ? a.r : a.f === "NULL" ? "" : a.f);
    if (u === null) continue; // unparseable cells are reported by the importer
    src.set(key, (src.get(key) ?? 0n) + u);
  }
  const db = new Map((await q(sql)).map((r) => [r.k ?? "∅", toUnits(r.total)]));
  const problems = [];
  for (const [k, u] of src) if ((db.get(k) ?? 0n) !== u) problems.push(`${k}: sheet ${fmt(u)} vs db ${fmt(db.get(k) ?? 0n)}`);
  for (const k of db.keys()) if (!src.has(k)) problems.push(`${k}: only in db`);
  const sum = [...src.values()].reduce((a, b) => a + b, 0n);
  check(`${label}: ${src.size} documents, total ${fmt(sum)}`, problems);
}
const orig = (col, rawKey) => `coalesce(${col}::text, import_raw->>'${rawKey}')`;
await compareTotals("service invoice lines", "ServiceInvoiceItems", "InvoiceNo", "Amount", `select ${orig("invoice_no", "InvoiceNo")} k, sum(amount) total from aic.service_invoice_items group by 1`);
await compareTotals("sales invoice lines", "SalesInvoiceItems", "InvoiceNo", "Amount", `select ${orig("invoice_no", "InvoiceNo")} k, sum(amount) total from aic.sales_invoice_items group by 1`);
await compareTotals("liquidation receipts", "ReceiptItems", "LiquidationId", "Amount", `select ${orig("liquidation_id", "LiquidationId")} k, sum(amount) total from aic.receipt_items group by 1`);
await compareTotals("liquidation totals", "Liquidations", "LiquidationId", "TotalAmount", `select liquidation_id k, sum(total_amount) total from aic.liquidations group by 1`);
await compareTotals("liquidation requested", "Liquidations", "LiquidationId", "TotalAmountRequested", `select liquidation_id k, sum(total_amount_requested) total from aic.liquidations group by 1`);
await compareTotals("FTI totals", "FTIRequests", "ControlNo", "TotalAmount", `select control_no k, sum(total_amount) total from aic.fti_requests group by 1`);
await compareTotals("FTI detail fuel", "FTIDetails", "ControlNo", "FuelSubTotal", `select ${orig("control_no", "ControlNo")} k, sum(fuel_sub_total) total from aic.fti_details group by 1`);
await compareTotals("FTI detail tolls", "FTIDetails", "ControlNo", "TollFee", `select ${orig("control_no", "ControlNo")} k, sum(toll_fee) total from aic.fti_details group by 1`);
await compareTotals("FTI expenses", "FTIExpenses", "DetailId", "Amount", `select ${orig("detail_id", "DetailId")} k, sum(amount) total from aic.fti_expenses group by 1`);
await compareTotals("quotation amounts", "Quotations", "QuotationNo", "Amount", `select quotation_no k, sum(amount) total from aic.quotations group by 1`);
await compareTotals("sales order grand totals", "SalesOrders", "SalesOrderId", "GrandTotal", `select sales_order_id k, sum(grand_total) total from aic.sales_orders group by 1`);
await compareTotals("sales order lines", "SalesOrderItems", "SalesOrderId", "LineTotal", `select ${orig("sales_order_id", "SalesOrderId")} k, sum(line_total) total from aic.sales_order_items group by 1`);
await compareTotals("purchase order totals", "PurchaseOrders", "PONumber", "TotalAmount", `select po_number k, sum(total_amount) total from aic.purchase_orders group by 1`);
await compareTotals("purchase order lines", "PurchaseOrderItems", "PurchaseOrderId", "TotalAmount", `select ${orig("po_number", "PurchaseOrderId")} k, sum(total_amount) total from aic.purchase_order_items group by 1`);
await compareTotals("proforma totals", "ProformaInvoices", "Id", "TotalAmount", `select id k, sum(total_amount) total from aic.proforma_invoices group by 1`);
await compareTotals("collections", "CollectionHistory", "CollectionId", "AmountCollected", `select collection_id k, sum(amount_collected) total from aic.collection_history group by 1`);
const currencies = await q(`select coalesce(currency, '∅') c, count(*)::int n, sum(grand_total)::text total from aic.sales_orders group by 1 order by 1`);
console.log(`     sales orders by currency: ${currencies.map((c) => `${c.c} ${c.n} docs ${c.total}`).join("; ")}`);

// 3. Next document numbers under the app's rules, from each side.
const maxSuffix = (keys, prefix) => keys.reduce((m, k) => (k.startsWith(prefix) ? Math.max(m, Number.parseInt(k.slice(prefix.length), 10) || 0) : m), 0);
function nextInvoiceNo(keys) {
  let best = null;
  for (const raw of keys) {
    const no = raw.trim();
    if (!no || no.toUpperCase().startsWith("DRAFT-")) continue;
    const m = /^(.*?)(\d+)$/.exec(no);
    if (m && (!best || BigInt(m[2]) > best.value)) best = { prefix: m[1], digits: m[2], value: BigInt(m[2]) };
  }
  return best ? best.prefix + String(best.value + 1n).padStart(best.digits.length, "0") : "";
}
const sheetKeys = (tab, h) => sheetRows(tab).map((x) => x.get(h).f);
const dbKeys = async (table, col) => (await q(`select ${col}::text k from aic.${table} where ${col} is not null`)).map((r) => r.k);
const year = new Date().getFullYear();
const numbering = [
  ["DR", (keys) => Math.max(3642, ...keys.map((k) => Number.parseInt(k, 10)).filter(Number.isFinite)) + 1, sheetKeys("DeliveryReceipts", "DRNumber"), await dbKeys("delivery_receipts", "dr_number")],
  ["service invoice", nextInvoiceNo, sheetKeys("ServiceInvoices", "InvoiceNo"), await dbKeys("service_invoices", "invoice_no")],
  ["sales invoice", nextInvoiceNo, sheetKeys("SalesInvoices", "InvoiceNo"), await dbKeys("sales_invoices", "invoice_no")],
  [`PO ${year}`, (keys) => `AIC-PO-${year}-${String(maxSuffix(keys, `AIC-PO-${year}-`) + 1).padStart(4, "0")}`, sheetKeys("PurchaseOrders", "PONumber"), await dbKeys("purchase_orders", "po_number")],
  [`PR ${year}`, (keys) => maxSuffix(keys, `AIC-PR-${year}-`) + 1, sheetKeys("PurchaseRequests", "PrNo"), await dbKeys("purchase_requests", "pr_no")],
  [`stock transfer ${year}`, (keys) => maxSuffix(keys, `ST-${year}-`) + 1, sheetKeys("StockTransfers", "TransferNo"), await dbKeys("stock_transfers", "transfer_no")],
  ["quotation (highest)", (keys) => keys.filter((k) => /^Q-\d{8}-\d+$/.test(k)).sort().at(-1) ?? "", sheetKeys("Quotations", "QuotationNo"), await dbKeys("quotations", "quotation_no")],
];
const seq = async (table, tab) => {
  const dbRows = await q(`select sequence_key k, prefix, business_year, last_number from aic.${table} order by 1`);
  const src = sheetRows(tab).map((x) => `${x.get("SequenceKey").f}:${x.get("Prefix").f}:${x.get("BusinessYear").f}:${x.get("LastNumber").f}`);
  return [src.join(","), dbRows.map((r) => `${r.k}:${r.prefix}:${r.business_year}:${r.last_number}`).join(",")];
};
const problems = [];
const lines = [];
for (const [label, next, src, db] of numbering) {
  const a = String(next(src)), b = String(next(db));
  lines.push(`${label} → ${a}`);
  if (a !== b) problems.push(`${label}: sheet ${a} vs db ${b}`);
}
for (const [label, table, tab] of [["sales order sequence", "sales_order_sequences", "SalesOrderSequences"], ["service report sequence", "service_report_sequences", "ServiceReportSequences"]]) {
  const [a, b] = await seq(table, tab);
  lines.push(`${label} → ${a}`);
  if (a !== b) problems.push(`${label}: sheet ${a} vs db ${b}`);
}
const soMax = (await q(`select max(sales_order_no) m from aic.sales_orders`))[0].m;
lines.push(`highest sales order no → ${soMax}`);
check(`next document numbers\n       ${lines.join("\n       ")}`, problems);

await client.end();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
