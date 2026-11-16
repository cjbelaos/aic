import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { withFTIWriteLock } from "@/lib/ftiWriteLock";

type Cell = string | number | boolean;
export type FTIRow = Cell[];
export type FTIValueUpdate = { range: string; values: Cell[][] };
type Snapshot = { settings: FTIRow[]; requests: FTIRow[]; details: FTIRow[]; expenses: FTIRow[]; rates: FTIRow[] };
const eligibleStatuses = new Set(["DRAFT", "SENT", "SUBMITTED", "REQUESTED_FOR_CHANGE", "REJECTED"]);
const pdfHeaders = ["PdfStatus", "PdfRetryAt", "PdfAttempts"];

export function philippineToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function number(value: Cell | undefined, label: string): number {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Invalid ${label} in FTI data.`);
  return result;
}

export function planFTIRecalculation(snapshot: Snapshot, price: number, today: string) {
  if (!Number.isFinite(price) || price <= 0) throw new Error("Fuel price must be greater than zero.");
  const data: FTIValueUpdate[] = [];
  const settingIndex = snapshot.settings.findIndex(r => r[0] === "globalFuelPrice");
  const settingRow = settingIndex < 0 ? snapshot.settings.length + 2 : settingIndex + 2;
  data.push({ range: `FTISettings!A${settingRow}:B${settingRow}`, values: [["globalFuelPrice", price]] });
  let affectedRequests = 0, affectedTrips = 0, pendingPdfs = 0;
  for (const [requestIndex, request] of snapshot.requests.entries()) {
    if (!eligibleStatuses.has(String(request[2]).trim().toUpperCase())) continue;
    const configured = Number(snapshot.rates.find(r => r[0] === request[1])?.[1]);
    const rate = Number.isFinite(configured) && configured > 0 ? configured : 12;
    let changed = false, totalCents = 0;
    for (const [detailIndex, detail] of snapshot.details.entries()) {
      if (detail[1] !== request[0]) continue;
      const date = String(detail[2]);
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error(`Invalid trip date in ${request[0]}. Correct it before changing fuel price.`);
      }
      let subtotal = number(detail[7], "fuel subtotal");
      if (date >= today) {
        const km = number(detail[5], "distance");
        const next = Number((km / rate * price).toFixed(2));
        if (Number(detail[6]) !== price || subtotal !== next) {
          const row = detailIndex + 2;
          data.push({ range: `FTIDetails!G${row}:H${row}`, values: [[price, next]] });
          affectedTrips++;
          changed = true;
        }
        subtotal = next;
      }
      totalCents += Math.round(subtotal * 100) + Math.round(number(detail[8], "toll") * 100);
      for (const expense of snapshot.expenses.filter(e => e[1] === detail[0])) {
        totalCents += Math.round(number(expense[3], "expense") * 100);
      }
    }
    if (!changed) continue;
    affectedRequests++;
    const row = requestIndex + 2;
    data.push({ range: `FTIRequests!F${row}`, values: [[totalCents / 100]] });
    if (request[4]) {
      pendingPdfs++;
      data.push({ range: `FTIRequests!L${row}:N${row}`, values: [["PENDING", "", 0]] });
    }
  }
  return { data, affectedRequests, affectedTrips, pendingPdfs };
}

/** Run under the FTI lock; refuse to overwrite unrelated custom columns. */
export async function ensureFTIWorkflowSchema(): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const tabs = metadata.data.sheets ?? [];
  const request = tabs.find(s => s.properties?.title === "FTIRequests")?.properties;
  if (!request || request.sheetId == null) throw new Error("FTIRequests sheet is missing.");
  if ((request.gridProperties?.columnCount ?? 0) < 14) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: {
      properties: { sheetId: request.sheetId, gridProperties: { columnCount: 14 } }, fields: "gridProperties.columnCount",
    } }] } });
  }
  if (!tabs.some(s => s.properties?.title === "FTISettings")) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: "FTISettings" } } }] } });
  }
  const headers = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "FTIRequests!L1:N1" })).data.values?.[0] ?? [];
  if (headers.some((value, i) => value && value !== pdfHeaders[i])) throw new Error("FTI PDF metadata columns L:N are already in use.");
  if (pdfHeaders.some((value, i) => headers[i] !== value)) {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: "FTIRequests!L1:N1", valueInputOption: "RAW", requestBody: { values: [pdfHeaders] } });
  }
}

export async function recalculateFTIFuel(price: number, now = new Date()) {
  if (!Number.isFinite(price) || price <= 0) throw new Error("Fuel price must be greater than zero.");
  return withFTIWriteLock(async () => {
    await ensureFTIWorkflowSchema();
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const ranges = ["FTISettings!A2:B", "FTIRequests!A2:N", "FTIDetails!A2:I", "FTIExpenses!A2:D", "UserFuelPerKm!A2:B"];
    const values = (await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges })).data.valueRanges ?? [];
    const [settings, requests, details, expenses, rates] = values.map(r => (r.values ?? []) as FTIRow[]);
    const plan = planFTIRecalculation({ settings, requests, details, expenses, rates }, price, philippineToday(now));
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: plan.data } });
    return { fuelPrice: price, affectedRequests: plan.affectedRequests, affectedTrips: plan.affectedTrips, pendingPdfs: plan.pendingPdfs };
  });
}
