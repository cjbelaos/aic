import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getServiceInvoices } from "@/lib/serviceInvoiceSheets";
import { getCompanies } from "@/lib/companySheets";
import { readSalesOrderItemsAll } from "@/lib/salesOrders/repository";
import { isInScope, normalizeInvoiceNo, projectTrackerRow, type TrackerCell, type TrackerProjection } from "./projection.ts";
import { applyTrackerWrites, DIRECTORY_IMPORT_ROWS, firstAppendRow, planRow, readTrackerSnapshot, type PlannedRow } from "./sheet.ts";

export interface TrackerSyncMeta { status: "synced" | "failed" | "needs_review"; row?: number; syncedAt: string; error?: string; values?: TrackerCell[] }
export type TrackerSyncOutcome = "added" | "updated" | "unchanged" | "needs_review" | "failed";
export interface TrackerSyncReport {
  results: { invoiceNo: string; outcome: TrackerSyncOutcome; row?: number; reason?: string }[];
  customersAdded: string[];
}

const INVOICES_RANGE = "ServiceInvoices!A1:T";
const META_COLUMN = 19;

function parseMeta(value: unknown): Record<string, unknown> {
  try { const parsed = JSON.parse(String(value ?? "")); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
const trackerMeta = (value: unknown) => parseMeta(value).trackerSync as TrackerSyncMeta | undefined;

/** Merge only the trackerSync key into each invoice's metadata, re-reading column T just before writing. */
async function recordMeta(sheets: Awaited<ReturnType<typeof getSheetsClient>>, spreadsheetId: string, updates: Map<number, TrackerSyncMeta>) {
  if (!updates.size) return;
  const rowNumbers = [...updates.keys()];
  // One retry: losing the record after a successful tracker write would orphan the row's ownership.
  for (let attempt = 1; ; attempt++) {
    try {
      const fresh = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: rowNumbers.map(row => `ServiceInvoices!T${row}`) });
      const data = rowNumbers.map((row, index) => ({
        range: `ServiceInvoices!T${row}`,
        values: [[JSON.stringify({ ...parseMeta(fresh.data.valueRanges?.[index]?.values?.[0]?.[0]), trackerSync: updates.get(row) })]],
      }));
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
      return;
    } catch (error) { if (attempt >= 2) throw error; }
  }
}

/** Syncs in this server process run one at a time, so two of them never race for the same tracker row. */
let queue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/** Sync every in-scope invoice (or only the given numbers) to the accounting tracker. Throws only when the tracker or app data cannot be read. */
export function syncServiceInvoicesToTracker(only?: string[]): Promise<TrackerSyncReport> {
  return runExclusive(() => syncNow(only));
}

async function syncNow(only?: string[]): Promise<TrackerSyncReport> {
  const sheets = await getSheetsClient();
  const databaseId = await getDatabaseSpreadsheetId();
  const wanted = only ? new Set(only.map(normalizeInvoiceNo)) : undefined;
  const dbRows = (await sheets.spreadsheets.values.get({ spreadsheetId: databaseId, range: INVOICES_RANGE })).data.values ?? [];
  // Row number and raw status per invoice; getServiceInvoices omits deleted invoices.
  const stored = new Map<string, { row: number; status: string; meta?: TrackerSyncMeta }>();
  dbRows.forEach((row, index) => {
    const invoiceNo = String(row[0] ?? "").trim();
    const status = String(row[8] ?? "created").trim() || "created";
    if (index === 0 || !isInScope(invoiceNo, status) || (wanted && !wanted.has(normalizeInvoiceNo(invoiceNo)))) return;
    stored.set(invoiceNo, { row: index + 1, status, meta: trackerMeta(row[META_COLUMN]) });
  });
  const report: TrackerSyncReport = { results: [], customersAdded: [] };
  if (!stored.size) return report;

  const now = () => new Date().toISOString();
  let loaded;
  try { loaded = await Promise.all([readTrackerSnapshot(sheets), getServiceInvoices(), readSalesOrderItemsAll(), getCompanies()]); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordMeta(sheets, databaseId, new Map([...stored.values()].map(entry => [entry.row, { ...entry.meta, status: "failed", syncedAt: now(), error: message } as TrackerSyncMeta])));
    throw error;
  }
  const [snapshot, summaries, salesOrderItems, companies] = loaded;
  const byNo = new Map(summaries.map(invoice => [invoice.invoiceNo, invoice]));

  let nextRow = firstAppendRow(snapshot);
  const writes: { row: PlannedRow; dbRow: number; outcome: TrackerSyncOutcome }[] = [];
  const metaOnly = new Map<number, TrackerSyncMeta>();
  const newCustomers: { name: string; tin: string; address: string }[] = [];
  for (const [invoiceNo, entry] of stored) {
    const lastWritten = entry.meta?.values;
    let projection: TrackerProjection;
    const invoice = byNo.get(invoiceNo);
    if (entry.status === "deleted" || !invoice) {
      if (!lastWritten) continue; // never on the tracker; nothing to cancel
      const [, , c, e, h] = lastWritten;
      projection = { a: "", b: "CANCELLED", c: c as number | "", e: String(e ?? ""), h: String(h ?? ""), j: "" };
    } else {
      const company = companies.find(candidate => candidate.companyId === invoice.customerId || candidate.id === invoice.customerId);
      if (!company?.companyName) {
        const message = `Customer ${invoice.customerId} is not in Companies; not copied to the tracker.`;
        report.results.push({ invoiceNo, outcome: "failed", reason: message });
        metaOnly.set(entry.row, { ...entry.meta, status: "failed", syncedAt: now(), error: message });
        continue;
      }
      try {
        projection = projectTrackerRow({
          ...invoice,
          companyName: company.companyName,
          salesOrderLines: invoice.salesOrderId ? salesOrderItems.filter(line => line.salesOrderId === invoice.salesOrderId) : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.results.push({ invoiceNo, outcome: "failed", reason: message });
        metaOnly.set(entry.row, { ...entry.meta, status: "failed", syncedAt: now(), error: message });
        continue;
      }
    }
    const plan = planRow(snapshot, invoiceNo, projection, lastWritten, () => nextRow++);
    const review = (reason: string) => {
      report.results.push({ invoiceNo, outcome: "needs_review", reason });
      if (entry.meta?.status !== "needs_review" || entry.meta.error !== reason) metaOnly.set(entry.row, { ...entry.meta, status: "needs_review", syncedAt: now(), error: reason });
    };
    if (plan.kind === "needs_review") { review(plan.reason); continue; }
    if (!plan.changed && !plan.row.appended) {
      report.results.push({ invoiceNo, outcome: "unchanged", row: plan.row.rowNumber });
      if (entry.meta?.status !== "synced") metaOnly.set(entry.row, { status: "synced", row: plan.row.rowNumber, syncedAt: now(), values: plan.row.cells });
      continue;
    }
    const name = projection.e;
    if (name && !snapshot.directoryNames.has(name) && !newCustomers.some(customer => customer.name === name)) {
      if (snapshot.directoryRowCount + newCustomers.length >= DIRECTORY_IMPORT_ROWS) {
        review(`Customer "${name}" is not in Client Directory and SALES ORDER TRACKER's Client Directory is at the tracker's 500-row import limit. Extend the IMPORTRANGE range, then sync again.`);
        continue;
      }
      const company = invoice && companies.find(candidate => candidate.companyId === invoice.customerId || candidate.id === invoice.customerId);
      newCustomers.push({ name, tin: company?.tin ?? "", address: company?.address ?? "" });
    }
    writes.push({ row: plan.row, dbRow: entry.row, outcome: lastWritten ? "updated" : "added" });
  }

  const metaUpdates = new Map(metaOnly);
  try {
    await applyTrackerWrites(sheets, snapshot, writes.map(write => write.row), newCustomers);
    report.customersAdded = newCustomers.map(customer => customer.name);
    for (const write of writes) {
      report.results.push({ invoiceNo: write.row.invoiceNo, outcome: write.outcome, row: write.row.rowNumber });
      metaUpdates.set(write.dbRow, { status: "synced", row: write.row.rowNumber, syncedAt: now(), values: write.row.cells });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const write of writes) {
      report.results.push({ invoiceNo: write.row.invoiceNo, outcome: "failed", row: write.row.rowNumber, reason: message });
      metaUpdates.set(write.dbRow, { ...stored.get(write.row.invoiceNo)?.meta, status: "failed", syncedAt: now(), error: message });
    }
  }
  await recordMeta(sheets, databaseId, metaUpdates);
  return report;
}

/** Auto-sync after a save. Never throws: failures are recorded on the invoice as trackerSync.status = "failed" or "needs_review". */
export async function syncServiceInvoiceToTracker(invoiceNo: string): Promise<void> {
  try { await syncServiceInvoicesToTracker([invoiceNo]); }
  catch (error) { console.error(`Service Invoice ${invoiceNo} could not be copied to the accounting tracker:`, error); }
}
