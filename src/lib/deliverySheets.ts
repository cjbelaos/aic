import { getSheetsClient, getDatabaseSpreadsheetId, getAccessTokenForFetch } from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
} from "@/types/delivery";

const DELIVERED_BY_NAMES_SHEET = "DeliveredByNames";
const DELIVERED_BY_NAMES_RANGE = `${DELIVERED_BY_NAMES_SHEET}!A2:A`;

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";
const DELIVERY_RECEIPTS_RANGE = `${DELIVERY_RECEIPTS_SHEET}!A2:L`;
// A:DRNumber B:DeliveryDate C:CompanyId D:PONumber E:TRNumber F:ProductCode G:Quantity H:Unit I:Comments J:PreparedBy K:DeliveredBy L:CreatedAt

const PRINT_TEMPLATE_SHEET = "DeliveryReceiptForm";
const DR_SEQUENCE_BASE = 3620;

function formatDateMMDDYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
}

async function getSheetTabGid(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName],
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId) throw new Error(`Sheet "${sheetName}" not found.`);
  return sheet.properties.sheetId;
}

function buildExportUrl(spreadsheetId: string, gid: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&portrait=true&size=letter&gridlines=false&gid=${gid}`;
}

async function fetchExportPdfBase64(printUrl: string): Promise<string> {
  const token = await getAccessTokenForFetch();
  const res = await fetch(printUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to export PDF (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

/** Fetches personnel names from the DeliveredByNames sheet. */
export async function getDriversFromSheets(): Promise<string[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DELIVERED_BY_NAMES_RANGE,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];
    return rows.map((row) => row[0]).filter(Boolean);
  } catch (error) {
    console.error("Failed to fetch drivers:", error);
    throw error;
  }
}

/** Generates the next DR number by scanning the DeliveryReceipts sheet. */
async function generateNextDrNumber(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  let max = 0;
  rows.forEach((row) => {
    const raw = String(row[0] ?? "").trim();
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return Math.max(max, DR_SEQUENCE_BASE) + 1;
}

/**
 * Process new delivery receipt:
 * 1. Generates next DR Number.
 * 2. Looks up company address / TIN from Companies sheet via companyId.
 * 3. Populates the DeliveryReceiptForm template cells.
 * 4. Logs rows into the DeliveryReceipts sheet.
 * 5. Exports the form as PDF (fallback: printUrl only).
 * 6. Returns full DR metadata.
 */
export async function processDeliveryReceipt(
  payload: CreateDeliveryPayload,
): Promise<DeliveryReceiptResponse> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. DR Number
    const drNumber = await generateNextDrNumber(sheets, spreadsheetId);

    // 2. Company details
    const companies = await getCompanies();
    const company = companies.find((c) => c.companyId === payload.companyId);
    if (!company) throw new Error(`Company "${payload.companyId}" not found.`);
    const companyName = company.companyName;
    const address = company.address || "";
    const tin = company.tin || "";

    // 3. Log rows to DeliveryReceipts sheet
    const createdAt = new Date().toISOString();
    const historyRows = payload.items.map((item) => [
      drNumber, payload.date, payload.companyId,
      payload.poNo || "", payload.trNo || "",
      item.productCode, item.quantity, item.unit,
      payload.comments || "", payload.preparedBy || "",
      payload.deliveredBy || "", createdAt,
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: DELIVERY_RECEIPTS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: historyRows },
    });

    // 4. Clear then populate DeliveryReceiptForm template
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${PRINT_TEMPLATE_SHEET}!A13:C35`,
    });

    const templateRows = payload.items.map((item) => [
      item.quantity, item.unit, item.description,
    ]);
    const formattedDate = formatDateMMDDYYYY(payload.date);

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${PRINT_TEMPLATE_SHEET}!F6`,  values: [[drNumber]] },
          { range: `${PRINT_TEMPLATE_SHEET}!B9`,  values: [[companyName]] },
          { range: `${PRINT_TEMPLATE_SHEET}!B10`, values: [[address]] },
          { range: `${PRINT_TEMPLATE_SHEET}!B11`, values: [[tin]] },
          { range: `${PRINT_TEMPLATE_SHEET}!F9`,  values: [[formattedDate]] },
          { range: `${PRINT_TEMPLATE_SHEET}!F10`, values: [[payload.poNo || ""]] },
          { range: `${PRINT_TEMPLATE_SHEET}!F11`, values: [[payload.trNo || ""]] },
          { range: `${PRINT_TEMPLATE_SHEET}!A13:C${12 + templateRows.length}`, values: templateRows },
          { range: `${PRINT_TEMPLATE_SHEET}!A37`, values: [[payload.comments || ""]] },
          { range: `${PRINT_TEMPLATE_SHEET}!A42`, values: [[payload.preparedBy || ""]] },
          { range: `${PRINT_TEMPLATE_SHEET}!A47`, values: [[payload.deliveredBy || ""]] },
        ],
      },
    });

    // 5. Export PDF (non-fatal if it fails)
    const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
    const printUrl = buildExportUrl(spreadsheetId, gid);
    let pdfBase64: string | undefined;
    try { pdfBase64 = await fetchExportPdfBase64(printUrl); }
    catch (e) { console.warn("PDF export failed (will use print URL fallback):", e); }

    return {
      success: true, drNumber, companyName, address, tin,
      date: payload.date, poNo: payload.poNo, trNo: payload.trNo,
      preparedBy: payload.preparedBy, deliveredBy: payload.deliveredBy,
      comments: payload.comments, items: payload.items,
      printUrl, pdfBase64,
    };
  } catch (error) {
    console.error("Failed to process delivery receipt:", error);
    throw error;
  }
}

/**
 * Exports the current DeliveryReceiptForm tab as a PDF base64 string.
 * Used by save-to-drive endpoint for re-fetching after initial creation.
 */
export async function exportDeliveryReceiptFormPdf(): Promise<{
  pdfBase64: string; printUrl: string;
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
  const printUrl = buildExportUrl(spreadsheetId, gid);
  const pdfBase64 = await fetchExportPdfBase64(printUrl);
  return { pdfBase64, printUrl };
}
