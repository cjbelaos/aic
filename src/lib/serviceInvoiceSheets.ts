import { allocateInvoiceDiscounts, resolveInvoiceDiscount, hydrateInvoiceDiscount, invoiceDiscountSnapshot, type InvoiceDiscountData } from "./serviceInvoiceDiscounts";
import { parseInvoiceMetadata, paymentStatusFor, validatePaymentStatus, assertUnpaid, requireStatusReason, type InvoiceTrackingData } from "./serviceInvoiceTracking";
import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
  getDriveUploadClient,
} from "@/lib/googleSheets";
import { getCustomers, getCompanies } from "@/lib/companySheets";
import {
  CreateServiceInvoicePayload,
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
  ServiceInvoiceItem,
} from "@/types/serviceInvoice";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";
import { getUserById } from "@/lib/userSheets";
import { resolveDeliveryReceiptDeliveredBy, resolveDeliveryReceiptReferences } from "@/lib/deliverySheets";
import { ensureAutomaticDocumentHandover, getDocumentHandovers } from "@/lib/documentHandoverSheets";
import { getOrderDetail, postFulfillments, type Actor } from "@/lib/salesOrders/service";
import { getProducts } from "@/lib/productSheets";
import { validateManualCategories } from "@/lib/serviceInvoiceFilters";
import { readSalesOrderListSnapshot, readSalesOrderById } from "@/lib/salesOrders/repository";

const SERVICE_INVOICES_SHEET = "ServiceInvoices";
const SERVICE_INVOICES_RANGE = `${SERVICE_INVOICES_SHEET}!A2:U`;
// The append range locates the logical table. Restrict it to the invoice-number
// column so a stray value in a later column cannot shift an entire row right.
const SERVICE_INVOICES_APPEND_RANGE = `${SERVICE_INVOICES_SHEET}!A2:A`;
const SERVICE_INVOICES_HEADERS = [
  "InvoiceNo", "Date", "CustomerId", "PreparedBy", "CreatedBy", "CreatedAt",
  "UpdatedBy", "UpdatedAt", "Status", "DriveFileLink", "ContractId", "DRNo",
  "AssignedTechnicianUserId", "AssignedTechnicianName", "ServiceReportId",
  "ServiceReportStatus", "PONumber", "TRNumber", "SalesOrderId",
  "ManualCompletionData", "ReferenceMode",
] as const;
// A:InvoiceNo B:Date C:CustomerId D:PreparedBy E:CreatedBy F:CreatedAt G:UpdatedBy H:UpdatedAt I:Status J:DriveFileLink K:ContractId L:DRNo
// M:AssignedTechnicianUserId N:AssignedTechnicianName O:ServiceReportId P:ServiceReportStatus
// Q:PONumber R:TRNumber S:SalesOrderId T:ManualCompletionData U:ReferenceMode

const SERVICE_INVOICE_ITEMS_SHEET = "ServiceInvoiceItems";
const SERVICE_INVOICE_ITEMS_RANGE = `${SERVICE_INVOICE_ITEMS_SHEET}!A2:G`;
const SERVICE_INVOICE_ITEMS_APPEND_RANGE = `${SERVICE_INVOICE_ITEMS_SHEET}!A2:A`;
// A:InvoiceNo B:Description C:Qty D:UnitPrice E:Amount F:ProductId G:ProductCategoryId

export async function readServiceInvoiceItemValues(sheets: Awaited<ReturnType<typeof getSheetsClient>>, spreadsheetId: string): Promise<string[][]> {
  try {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: SERVICE_INVOICE_ITEMS_RANGE });
    return (response.data.values || []) as string[][];
  } catch (error) {
    const status = (error as { code?: number; response?: { status?: number } }).response?.status ?? (error as { code?: number }).code;
    if (status !== 400) throw error;
    const legacy = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICE_ITEMS_SHEET}!A2:E` });
    return (legacy.data.values || []) as string[][];
  }
}

async function ensureServiceInvoiceItemCatalogHeaders(sheets: Awaited<ReturnType<typeof getSheetsClient>>, spreadsheetId: string): Promise<void> {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, ranges: [SERVICE_INVOICE_ITEMS_SHEET], fields: "sheets.properties(sheetId,title,gridProperties.columnCount)" });
  const tab = metadata.data.sheets?.find((entry) => entry.properties?.title === SERVICE_INVOICE_ITEMS_SHEET)?.properties;
  if (tab?.sheetId == null) throw new Error("ServiceInvoiceItems tab was not found.");
  if ((tab.gridProperties?.columnCount ?? 0) < 7) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { columnCount: 7 } }, fields: "gridProperties.columnCount" } }] } });
  }
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICE_ITEMS_SHEET}!F1:G1` });
  const headers = response.data.values?.[0] || [];
  if (headers[0] === "ProductId" && headers[1] === "ProductCategoryId") return;
  if (headers.some((value) => String(value || "").trim())) throw new Error("ServiceInvoiceItems columns F:G are already in use; product links cannot be saved.");
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SERVICE_INVOICE_ITEMS_SHEET}!F1:G1`, valueInputOption: "RAW", requestBody: { values: [["ProductId", "ProductCategoryId"]] } });
}

async function itemCatalogReferences(items: ServiceInvoiceItem[]): Promise<Array<{ productId: string; categoryId: string }>> {
  if (!items.some((item) => item.productId)) return items.map(() => ({ productId: "", categoryId: "" }));
  const products = await getProducts();
  return items.map((item) => {
    if (!item.productId) return { productId: "", categoryId: "" };
    const product = products.find((candidate) => candidate.productId === item.productId);
    if (!product) throw new Error(`Product "${item.productId}" was not found.`);
    return { productId: product.productId, categoryId: product.productCategoryId };
  });
}

const PRINT_TEMPLATE_SHEET = "ServiceInvoiceForm";
// Template cells (ServiceInvoiceForm):
//   CustomerName -> B5:E5 (write to anchor cell B5)
//   TIN          -> B6
//   Address      -> B7
//   Date         -> B2:F2 (write to anchor cell B2)
//   PO / SO-TR   -> B4:F4 (two text lines below the date)
//   Items        -> rows 10-28 (B=Description, C=Qty, D=UnitPrice, E=Amount [formula/calculated])
//   PreparedBy   -> A35 (write to anchor cell A35)
const TEMPLATE_ITEM_START_ROW = 10;
const TEMPLATE_ITEM_END_ROW = 28;

// Invoice numbers typed from the physical paper are numeric. When a draft
// (DRAFT-*) is promoted to a real status, the next sequential number is
// generated from the highest existing numeric invoice number.
const SI_SEQUENCE_BASE = 1000;

function appendedRowNumber(updatedRange: string | null | undefined, sheetName: string, endColumn: string, rowCount: number): number {
  const range = updatedRange || "";
  const match = new RegExp(`^'?${sheetName}'?!A(\\d+):${endColumn}(\\d+)$`).exec(range);
  if (!match || Number(match[2]) - Number(match[1]) + 1 !== rowCount) {
    throw new Error(`${sheetName} append landed outside columns A:${endColumn} or wrote an unexpected number of rows (${range || "no range returned"}).`);
  }
  return Number(match[1]);
}

/**
 * Generates the next sequential Service Invoice number by scanning existing
 * non-draft invoice numbers and incrementing the highest numeric value.
 * Draft placeholders ("DRAFT-...") are ignored so they never reserve a number.
 */
async function generateNextInvoiceNo(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
): Promise<string> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  let max = 0;
  rows.forEach((row) => {
    const raw = String(row[0] ?? "").trim();
    if (!raw || raw.startsWith("DRAFT-")) return;
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return String(Math.max(max, SI_SEQUENCE_BASE) + 1);
}

function formatDateMMDDYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
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
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );
  if (!sheet?.properties?.sheetId)
    throw new Error(`Sheet "${sheetName}" not found.`);
  return sheet.properties.sheetId;
}

function buildExportUrl(spreadsheetId: string, gid: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&portrait=true&size=a4&gridlines=false&gid=${gid}`;
}

async function fetchExportPdfBase64(printUrl: string): Promise<string> {
  const token = await getAccessTokenForFetch();
  const res = await fetch(printUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to export PDF (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

/** Descriptions are stored and printed in ALL CAPS. */
function normalizeDescription(desc: string): string {
  return (desc || "").trim().toUpperCase();
}

/**
 * Resolved assigned-technician pair. The field names keep the historical
 * `deliveredBy` spelling: the values are the technician stored in ServiceInvoices
 * M/N, or the linked Delivery Receipt's technician snapshot.
 */
type DeliveredByResolution = {
  deliveredById?: string;
  deliveredByName?: string;
};

type ManualCompletionData = InvoiceTrackingData & {
  manualCategories?: string[];
  replacesInvoiceNo?: string;
  replacementInvoiceNo?: string;
  status?: "COMPLETED" | "REVERSED";
  completionDate?: string;
  technicianId?: string;
  technicianName?: string;
  notes?: string;
  fulfillmentIds?: string[];
};

function parseManualCompletionData(value: unknown): ManualCompletionData {
  return parseInvoiceMetadata(value) as ManualCompletionData;
}

/** A linked DR wins, then a direct Sales Order, then manual document references. */
async function resolveInvoiceReferences(payload: Pick<CreateServiceInvoicePayload, "drNumber" | "salesOrderId" | "poNo" | "trNo" | "referenceMode">): Promise<{ poNo: string; trNo: string; salesOrderId?: string }> {
  if (payload.drNumber !== undefined && payload.drNumber !== null) {
    return resolveDeliveryReceiptReferences(payload.drNumber);
  }
  const salesOrderId = String(payload.salesOrderId ?? "").trim();
  if (payload.referenceMode === "TR_NUMBER") {
    return { poNo: String(payload.poNo ?? "").trim(), trNo: String(payload.trNo ?? "").trim() };
  }
  if (salesOrderId) {
    const order = await getOrderDetail(salesOrderId);
    return { poNo: order.order.customerPONo || "", trNo: order.order.salesOrderNo || "", salesOrderId };
  }
  return { poNo: String(payload.poNo ?? "").trim(), trNo: String(payload.trNo ?? "").trim() };
}

/** Applies the Service Invoice source-of-truth rules for its assignee. */
async function resolveAssignedTechnician(payload: { assignedTechnicianUserId?: string; deliveredById?: string }): Promise<{ assignedTechnicianUserId: string; assignedTechnicianName: string }> {
  // `deliveredById` is accepted as the legacy name of the same field.
  const id = String(payload.assignedTechnicianUserId ?? payload.deliveredById ?? "").trim();
  if (!id) return { assignedTechnicianUserId: "", assignedTechnicianName: "" };
  const user = await getUserById(id);
  if (!user) throw new Error(`Assigned technician user "${id}" not found.`);
  return { assignedTechnicianUserId: user.userId, assignedTechnicianName: user.fullName };
}

async function resolveServiceInvoiceDeliveredBy(
  payload: Pick<CreateServiceInvoicePayload, "drNumber" | "deliveredById">,
  isFinal: boolean,
): Promise<DeliveredByResolution> {
  if (payload.drNumber !== undefined && payload.drNumber !== null) {
    const inherited = await resolveDeliveryReceiptDeliveredBy(payload.drNumber);
    if (isFinal && inherited.identityError) throw new Error(inherited.identityError);
    return {
      deliveredById: inherited.deliveredById,
      deliveredByName: inherited.deliveredByName,
    };
  }

  const requestedId = payload.deliveredById?.trim();
  if (!requestedId) {
    if (isFinal) throw new Error("Assigned Technician is required before finalizing a Service Invoice.");
    return {};
  }
  const user = await getUserById(requestedId);
  if (!user?.fullName.trim()) {
    throw new Error("Assigned Technician must be an active application user.");
  }
  return { deliveredById: user.userId, deliveredByName: user.fullName };
}

/**
 * Resolves the "Full Name - Position Title" line for the print template by
 * joining the current user (Users sheet) with their position (Positions sheet).
 */
async function resolvePreparedByTitle(
  userId: string,
  fallback: string,
): Promise<string> {
  if (!userId) return fallback;
  try {
    const [{ getUsers }, { getPositions }] = await Promise.all([
      import("@/lib/userSheets"),
      import("@/lib/positionSheets"),
    ]);
    const users = await getUsers();
    const user = users.find((u) => u.userId === userId);
    if (!user) return fallback;
    let label = user.fullName || fallback;
    if (user.positionId) {
      const positions = await getPositions();
      const pos = positions.find((p) => p.positionId === user.positionId);
      if (pos?.positionTitle) label += ` - ${pos.positionTitle}`;
    }
    return label;
  } catch {
    return fallback;
  }
}

/** Resolves just the position title (Positions sheet) for a user, if any. */
export async function resolvePreparedByPosition(
  userId: string,
): Promise<string> {
  if (!userId) return "";
  try {
    const [{ getUsers }, { getPositions }] = await Promise.all([
      import("@/lib/userSheets"),
      import("@/lib/positionSheets"),
    ]);
    const users = await getUsers();
    const user = users.find((u) => u.userId === userId);
    if (!user?.positionId) return "";
    const positions = await getPositions();
    const pos = positions.find((p) => p.positionId === user.positionId);
    return pos?.positionTitle || "";
  } catch {
    return "";
  }
}

/** Finds the 1-based row of an invoice in ServiceInvoices (0 if not found). */
async function findInvoiceRow(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  invoiceNo: string,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  return (
    rows.findIndex(
      (row) => String(row[0] ?? "").trim() === String(invoiceNo).trim(),
    ) + 2
  );
}

/** Finds all item rows in ServiceInvoiceItems for a given invoice. */
async function findInvoiceItemRows(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  invoiceNo: string,
): Promise<Array<{ rowNumber: number; rowData: string[] }>> {
  const rows = await readServiceInvoiceItemValues(sheets, spreadsheetId);
  const result: Array<{ rowNumber: number; rowData: string[] }> = [];
  rows.forEach((row, idx) => {
    if (String(row[0] ?? "").trim() === String(invoiceNo).trim()) {
      result.push({ rowNumber: idx + 2, rowData: row });
    }
  });
  return result;
}

const legacyScanCache = new Map<string, { scanned: boolean; expiresAt: number }>();
async function identifyLegacyScan(link: string): Promise<boolean | undefined> {
  const fileId = link.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? link.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  if (!fileId) return undefined;
  const cached = legacyScanCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.scanned;
  try {
    const drive = await getDriveUploadClient();
    const file = await drive.files.get({ fileId, fields: "name,trashed" });
    const name = file.data.name || "";
    const scanned = !file.data.trashed && name.startsWith("SI-SCANNED_");
    if (!name.startsWith("SI-SCANNED_") && !name.startsWith("SI-")) return undefined;
    if (legacyScanCache.size > 1000) legacyScanCache.clear();
    legacyScanCache.set(fileId, { scanned, expiresAt: Date.now() + 300_000 });
    return scanned;
  } catch { return undefined; }
}

/** Tracking stays in the existing T metadata cell; no new sheet schema. */
export async function updateServiceInvoicePayment(invoiceNo: string, value: unknown, userId: string): Promise<void> {
  const paymentStatus = validatePaymentStatus(value);
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error("Invoice not found.");
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}` });
  const row = response.data.values?.[0] ?? [];
  if (!["created", "paid"].includes(String(row[8]))) throw new Error("Payment labels can only be changed on active invoices.");
  const metadata = parseManualCompletionData(row[19]);
  const previousStatus = paymentStatusFor(String(row[8]), metadata);
  if (paymentStatus === previousStatus) return;
  const changedAt = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
    { range: `${SERVICE_INVOICES_SHEET}!T${rowNumber}`, values: [[JSON.stringify({ ...metadata, paymentStatus, paymentHistory: [...(Array.isArray(metadata.paymentHistory) ? metadata.paymentHistory : []), { status: paymentStatus, previousStatus, changedBy: userId, changedAt }] })]] },
    { range: `${SERVICE_INVOICES_SHEET}!G${rowNumber}:I${rowNumber}`, values: [[userId, changedAt, "created"]] },
  ] } });
}

export async function recordServiceInvoiceScan(invoiceNo: string, fileLink: string, userId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error("Invoice not found.");
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!T${rowNumber}` });
  const metadata = parseManualCompletionData(response.data.values?.[0]?.[0]);
  const scannedAt = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
    { range: `${SERVICE_INVOICES_SHEET}!J${rowNumber}`, values: [[fileLink]] },
    { range: `${SERVICE_INVOICES_SHEET}!T${rowNumber}`, values: [[JSON.stringify({ ...metadata, scannedFileLink: fileLink, scannedBy: userId, scannedAt })]] },
    { range: `${SERVICE_INVOICES_SHEET}!G${rowNumber}:H${rowNumber}`, values: [[userId, scannedAt]] },
  ] } });
}

/** Fetches and groups service invoice rows into summaries by InvoiceNo. */
export async function getServiceInvoices(): Promise<ServiceInvoiceSummary[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const [invResponse, itemsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: SERVICE_INVOICES_RANGE,
      }),
      readServiceInvoiceItemValues(sheets, spreadsheetId),
    ]);

    const invRows = invResponse.data.values;
    if (!invRows || invRows.length === 0) return [];

    const itemRows = itemsResponse;
    const itemsByInvoice = new Map<string, ServiceInvoiceItem[]>();
    for (const itemRow of itemRows) {
      const invoiceNo = String(itemRow[0] ?? "").trim();
      if (!invoiceNo) continue;
      const item: ServiceInvoiceItem = {
        productId: String(itemRow[5] ?? "").trim() || undefined,
        productCategoryId: String(itemRow[6] ?? "").trim() || undefined,
        description: String(itemRow[1] ?? "").trim(),
        quantity: parseFloat(String(itemRow[2] ?? "0")) || 0,
        unitPrice: parseFloat(String(itemRow[3] ?? "0")) || 0,
        amount: parseFloat(String(itemRow[4] ?? "0")) || 0,
      };
      if (!itemsByInvoice.has(invoiceNo)) itemsByInvoice.set(invoiceNo, []);
      itemsByInvoice.get(invoiceNo)!.push(item);
    }

    const companies = await getCompanies().catch(() => []);

    const summaries = invRows
      .map((row) => {
        const invoiceNo = String(row[0] ?? "").trim();
        if (!invoiceNo) return null;
        const status = String(row[8] ?? "created").trim() || "created";
        const manualCompletion = parseManualCompletionData(row[19]);
        const discountData = invoiceDiscountSnapshot(manualCompletion.discountData);
        hydrateInvoiceDiscount(itemsByInvoice.get(invoiceNo) || [], discountData);
        if (status === "deleted") return null;
        return {
          invoiceNo,
          date: String(row[1] ?? "").trim(),
          customerId: String(row[2] ?? "").trim(),
          preparedBy: String(row[3] ?? "").trim(),
          createdBy: String(row[4] ?? "").trim() || undefined,
          createdAt: String(row[5] ?? "").trim(),
          updatedBy: String(row[6] ?? "").trim() || undefined,
          updatedAt: String(row[7] ?? "").trim() || undefined,
          status: status === "paid" ? "created" : status,
          paymentStatus: paymentStatusFor(status, manualCompletion),
          statusReason: manualCompletion.statusReason,
          scannedFileLink: manualCompletion.scannedFileLink,
          scannedStatus: manualCompletion.scannedFileLink ? "scanned" : "not_scanned",
          driveFileLink: String(row[9] ?? "").trim() || undefined,
          contractId: String(row[10] ?? "").trim() || undefined,
          drNumber: row[11]
            ? parseInt(String(row[11]), 10) || undefined
            : undefined,
          assignedTechnicianUserId: String(row[12] ?? "").trim() || undefined,
          assignedTechnicianName: String(row[13] ?? "").trim() || undefined,
          serviceReportId: String(row[14] ?? "").trim() || undefined,
          serviceReportStatus: String(row[15] ?? "").trim() || undefined,
          poNo: String(row[16] ?? "").trim() || undefined,
          trNo: String(row[17] ?? "").trim() || undefined,
          salesOrderId: String(row[18] ?? "").trim() || undefined,
          referenceMode: row[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER",
          manualCompletionStatus: manualCompletion.status,
          manualCategories: manualCompletion.manualCategories,
          manualCompletionDate: manualCompletion.completionDate,
          manualCompletionTechnicianId: manualCompletion.technicianId,
          manualCompletionTechnicianName: manualCompletion.technicianName,
          manualCompletionNotes: manualCompletion.notes,
          manualCompletionFulfillmentIds: manualCompletion.fulfillmentIds,
          replacesInvoiceNo: manualCompletion.replacesInvoiceNo,
          replacementInvoiceNo: manualCompletion.replacementInvoiceNo,
          items: itemsByInvoice.get(invoiceNo) || [],
          discountSettings: discountData?.discountSettings,
          discountAmount: discountData?.discountAmount,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map((data) => {
        const company = companies.find(
          (c) => c.companyId === data.customerId || c.id === data.customerId,
        );
        return {
          ...data,
          companyName: company?.companyName || data.customerId,
        } as ServiceInvoiceSummary;
      })
      .sort((a, b) => {
        const aNumber = Number(a.invoiceNo);
        const bNumber = Number(b.invoiceNo);
        const aIsNumeric = Number.isFinite(aNumber);
        const bIsNumeric = Number.isFinite(bNumber);

        // Paper invoice numbers are numeric. Keep draft placeholders after
        // finalized invoices while preserving a predictable order among them.
        if (aIsNumeric && bIsNumeric) return bNumber - aNumber;
        if (aIsNumeric) return -1;
        if (bIsNumeric) return 1;
        return b.invoiceNo.localeCompare(a.invoiceNo);
      });
    // The list reads synchronized Q/R values in one Sheets request. Resolving a
    // DR or Sales Order per invoice here exhausts the Sheets read quota.
    // Existing uploaded scans used the SI-SCANNED_ filename convention.
    for (let index = 0; index < summaries.length; index += 5) {
      await Promise.all(summaries.slice(index, index + 5).map(async invoice => {
        if (!invoice.scannedFileLink && invoice.driveFileLink) {
          const scan = await identifyLegacyScan(invoice.driveFileLink);
          invoice.scannedFileLink = scan === true ? invoice.driveFileLink : undefined;
          invoice.scannedStatus = scan === true ? "scanned" : "not_scanned";
          invoice.scanVerificationPending = scan === undefined;
        }
      }));
    }
    const storedStatuses = new Map(invRows.map(row => [String(row[0]).trim(), String(row[8]).trim()]));
    const linkedIds = new Set(summaries.filter(invoice => ["draft", "created"].includes(storedStatuses.get(invoice.invoiceNo) || "")).map(invoice => invoice.salesOrderId).filter(Boolean));
    if (linkedIds.size) {
      const source = await readSalesOrderListSnapshot();
      for (const order of source.orders.filter(order => linkedIds.has(order.salesOrderId))) {
        const group = summaries.filter(invoice => invoice.salesOrderId === order.salesOrderId && ["draft", "created", "paid"].includes(invoice.status));
        // Keep cent allocations already saved for this order version. Historical
        // invoices without a snapshot pick up discounts on their first read.
        const allocations = allocateInvoiceDiscounts({ order, items: source.items.filter(item => item.salesOrderId === order.salesOrderId) }, group.map(invoice => ({ ...invoice, status: storedStatuses.get(invoice.invoiceNo), discountData: { discountSettings: invoice.discountSettings, discountAmount: invoice.discountAmount ?? 0, itemDiscounts: [] } })));
        group.forEach((invoice, index) => {
          if (!["draft", "created"].includes(storedStatuses.get(invoice.invoiceNo) || "")) return;
          invoice.discountSettings = allocations[index].discountSettings;
          invoice.discountAmount = allocations[index].discountAmount;
          hydrateInvoiceDiscount(invoice.items, allocations[index]);
        });
      }
    }
    return summaries;
  } catch (error) {
    console.error("Failed to fetch service invoices:", error);
    throw error;
  }
}

/** Populates the ServiceInvoiceForm print template with the given data. */
async function populateServiceInvoiceTemplate(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  data: {
    companyName: string;
    address: string;
    tin: string;
    date: string;
    preparedBy: string;
    poNo?: string;
    trNo?: string;
    items: ServiceInvoiceItem[];
    discountSettings?: import("./discounts").DiscountSettings;
    discountAmount?: number;
  },
): Promise<void> {
  // Clear ONLY the item data area (rows 10-28, columns B-D)
  // Column E (Amount) holds formula =Cx*Dx, so we exclude it from clear/write
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${PRINT_TEMPLATE_SHEET}!B${TEMPLATE_ITEM_START_ROW}:D${TEMPLATE_ITEM_END_ROW}`,
  });

  const formattedDate = formatDateMMDDYYYY(data.date);

  const descriptions: Array<[string]> = [];
  const quantities: Array<[string]> = [];
  const unitPrices: Array<[string]> = [];
  const maxItems = TEMPLATE_ITEM_END_ROW - TEMPLATE_ITEM_START_ROW + 1;
  data.items.slice(0, maxItems).forEach((item) => {
    descriptions.push([normalizeDescription(item.description)]);
    quantities.push([String(item.quantity)]);
    unitPrices.push([String(item.unitPrice)]);
  });

  const itemCount = descriptions.length;
  const dataValues: Array<{
    range: string;
    values: Array<Array<string>>;
  }> = [
    { range: `${PRINT_TEMPLATE_SHEET}!B5`, values: [[data.companyName]] },
    { range: `${PRINT_TEMPLATE_SHEET}!B6`, values: [[data.tin]] },
    { range: `${PRINT_TEMPLATE_SHEET}!B7`, values: [[data.address]] },
    { range: `${PRINT_TEMPLATE_SHEET}!B2`, values: [[formattedDate]] },
    { range: `${PRINT_TEMPLATE_SHEET}!B4`, values: [[`PO No.: ${data.poNo || "—"}    SO / TR No.: ${data.trNo || "—"}`]] },
    { range: `${PRINT_TEMPLATE_SHEET}!A35`, values: [[data.preparedBy]] },
  ];

  if (itemCount > 0) {
    const lastRow = TEMPLATE_ITEM_START_ROW + itemCount - 1;
    dataValues.push(
      {
        range: `${PRINT_TEMPLATE_SHEET}!B${TEMPLATE_ITEM_START_ROW}:B${lastRow}`,
        values: descriptions,
      },
      {
        range: `${PRINT_TEMPLATE_SHEET}!C${TEMPLATE_ITEM_START_ROW}:C${lastRow}`,
        values: quantities,
      },
      {
        range: `${PRINT_TEMPLATE_SHEET}!D${TEMPLATE_ITEM_START_ROW}:D${lastRow}`,
        values: unitPrices,
      },
    );
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: dataValues,
    },
  });
}

/**
 * Processes a new service invoice.
 */
export async function processServiceInvoice(
  payload: CreateServiceInvoicePayload,
  userId = "",
): Promise<ServiceInvoiceResponse> {
  try {
    if (payload.status && !["draft", "created"].includes(payload.status)) throw new Error("Invalid invoice status for creation.");
    if (payload.status === "cancelled") throw new Error("Use Cancel and create corrected copy to cancel a Service Invoice.");
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const isDraft = payload.status === "draft";
    let invoiceNo = String(payload.invoiceNo ?? "").trim();

    if (!invoiceNo) {
      if (isDraft) {
        invoiceNo = `DRAFT-${Date.now()}`;
      } else {
        throw new Error("Invoice No. is required.");
      }
    }

    if (!invoiceNo.startsWith("DRAFT-")) {
      const allRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SERVICE_INVOICES_SHEET}!A2:A`,
      });
      const existingNos = (allRows.data.values || [])
        .map((row) => String(row[0] ?? "").trim())
        .filter(Boolean);
      if (existingNos.includes(invoiceNo)) {
        throw new Error(
          `Invoice No. "${invoiceNo}" already exists. Please check the number on the paper.`,
        );
      }
    }

    const customers = await getCustomers();
    const company = customers.find((c) => c.companyId === payload.customerId);
    if (!company)
      throw new Error(`Customer "${payload.customerId}" not found.`);
    const companyName = company.companyName;
    const address = company.address || "";
    const tin = company.tin || "";

    const createdAt = new Date().toISOString();
    // Technician source: a linked DR wins, else the explicit technician, else the
    // legacy `deliveredById` alias. `assignedTechnicianUserId` is passed through as
    // the requested user so the "required when finalizing" rule still applies.
    const deliveredBy = await resolveServiceInvoiceDeliveredBy(
      { drNumber: payload.drNumber, deliveredById: payload.assignedTechnicianUserId ?? payload.deliveredById },
      !isDraft,
    );
    const assignedTechnician = await resolveAssignedTechnician(payload);
    // Columns M/N hold the assigned technician: a linked DR's technician wins,
    // then the explicit technician, then the legacy `deliveredById` alias.
    const technicianId = deliveredBy.deliveredById || assignedTechnician.assignedTechnicianUserId || "";
    const technicianName = deliveredBy.deliveredById
      ? deliveredBy.deliveredByName || assignedTechnician.assignedTechnicianName || ""
      : assignedTechnician.assignedTechnicianName || deliveredBy.deliveredByName || "";
    const references = await resolveInvoiceReferences(payload);
    if (references.salesOrderId) {
      const order = await getOrderDetail(references.salesOrderId);
      if (order.order.customerId !== payload.customerId) {
        throw new Error("The selected Sales Order belongs to a different customer.");
      }
    }
    let discountData = resolveInvoiceDiscount(payload.items, payload.discountSettings, references.salesOrderId ? await getOrderDetail(references.salesOrderId) : undefined);
    hydrateInvoiceDiscount(payload.items, discountData);
    const catalogReferences = await itemCatalogReferences(payload.items);
    if (catalogReferences.some((entry) => entry.productId)) await ensureServiceInvoiceItemCatalogHeaders(sheets, spreadsheetId);
    const headerRow = [
      invoiceNo,
      payload.date,
      payload.customerId,
      payload.preparedBy || "",
      userId,
      createdAt,
      userId,
      createdAt,
      payload.status || "created",
      "",
      payload.contractId || "",
      payload.drNumber?.toString() || "",
      technicianId, // M: AssignedTechnicianUserId
      technicianName, // N: AssignedTechnicianName
      "", // O: ServiceReportId (written by the Service Report link)
      "", // P: ServiceReportStatus
      references.poNo, // Q: PONumber
      references.trNo, // R: TRNumber
      references.salesOrderId || "", // S: direct SalesOrderId
      JSON.stringify({ discountData }), // T: metadata
      payload.referenceMode || "SALES_ORDER", // U: ReferenceMode
    ];
    if (headerRow.length !== SERVICE_INVOICES_HEADERS.length) {
      throw new Error("ServiceInvoices row width does not match the A:U schema.");
    }
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A1:U1`,
    });
    const actualHeaders = (headerResponse.data.values?.[0] || []).map((value) => String(value ?? "").trim());
    if (SERVICE_INVOICES_HEADERS.some((expected, index) => actualHeaders[index] !== expected)) {
      throw new Error("ServiceInvoices headers do not match the expected A:U columns. Invoice was not saved.");
    }
    const appendResponse = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SERVICE_INVOICES_APPEND_RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [headerRow] },
    });
    const appendedRow = appendedRowNumber(appendResponse.data.updates?.updatedRange, SERVICE_INVOICES_SHEET, "U", 1);
    const savedRow = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${appendedRow}:U${appendedRow}`,
    });
    if (String(savedRow.data.values?.[0]?.[0] ?? "").trim() !== invoiceNo) {
      throw new Error(`ServiceInvoices row ${appendedRow} could not be verified in column A. Invoice items were not saved.`);
    }

    const itemRows = payload.items.map((item, index) => [
      invoiceNo,
      normalizeDescription(item.description),
      item.quantity,
      item.unitPrice,
      (item.quantity || 0) * (item.unitPrice || 0),
      catalogReferences[index].productId,
      catalogReferences[index].categoryId,
    ]);
    if (itemRows.length > 0) {
      const itemsAppendResponse = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: SERVICE_INVOICE_ITEMS_APPEND_RANGE,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: itemRows },
      });
      appendedRowNumber(itemsAppendResponse.data.updates?.updatedRange, SERVICE_INVOICE_ITEMS_SHEET, "G", itemRows.length);
    }

    if (references.salesOrderId) {
      const allocations = await syncSalesOrderInvoiceDiscounts(await getOrderDetail(references.salesOrderId));
      discountData = allocations[invoiceNo] ?? discountData;
      hydrateInvoiceDiscount(payload.items, discountData);
    }
    let trackerAssignmentOutcome: ServiceInvoiceResponse["trackerAssignmentOutcome"];
    let trackerAssignmentWarning: string | undefined;
    if (!isDraft && technicianId && technicianName) {
      try {
        const assignment = await ensureAutomaticDocumentHandover({
          documentType: "service_invoice",
          documentNumber: invoiceNo,
          customerName: companyName,
          assignedToId: technicianId,
          assignedToName: technicianName,
          assignedBy: userId,
          assignedByName: payload.preparedBy || userId,
          notes: "Automatically assigned from Service Invoice",
        });
        trackerAssignmentOutcome = assignment.outcome;
        if (assignment.outcome === "already_returned") {
          trackerAssignmentWarning = "The existing Document Tracker assignment was returned and requires manual review.";
        }
      } catch (error) {
        trackerAssignmentWarning = `Service Invoice was saved, but Document Tracker assignment failed: ${error instanceof Error ? error.message : "unknown error"}`;
      }

    }

    return {
      success: true,
      invoiceNo,
      companyName,
      address,
      tin,
      date: payload.date,
      preparedBy: payload.preparedBy || "",
      items: payload.items,
      discountSettings: discountData.discountSettings,
      discountAmount: discountData.discountAmount,
      status: payload.status || "created",

      contractId: payload.contractId,
      drNumber: payload.drNumber ?? undefined,
      poNo: references.poNo || undefined,
      trNo: references.trNo || undefined,
      salesOrderId: references.salesOrderId || undefined,
      referenceMode: payload.referenceMode || "SALES_ORDER",
      assignedTechnicianUserId: technicianId || undefined,
      assignedTechnicianName: technicianName || undefined,
      trackerAssignmentOutcome,
      trackerAssignmentWarning,
    };
  } catch (error) {
    console.error("Failed to process service invoice:", error);
    throw error;
  }
}

export interface UpdateServiceInvoicePayload extends Partial<CreateServiceInvoicePayload> {
  status?: string;
  manualCategories?: string[];
  statusReason?: string;
}

/** Category-only update: preserve invoice money, PDF links and completion history. */
export async function updateServiceInvoiceCategory(invoiceNo: string, value: unknown, userId: string): Promise<void> {
  const manualCategories = validateManualCategories(value);
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error("Invoice not found.");
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}` });
  const row = response.data.values?.[0] ?? [];
  if (["cancelled", "void", "deleted"].includes(String(row[8]))) throw new Error("This Service Invoice can no longer be edited.");
  const dr = String(row[11] ?? "").trim();
  const orderId = dr ? (await resolveDeliveryReceiptReferences(Number(dr))).salesOrderId : String(row[18] ?? "").trim();
  const automatic = orderId ? (await readSalesOrderById(orderId)) ? (await getOrderDetail(orderId)).category : "Uncategorized" : row[10] ? "PMS" : "Uncategorized";
  if (automatic && automatic !== "Uncategorized") throw new Error("Invoice category is automatically assigned by its Sales Order or PMS contract.");
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
    { range: `${SERVICE_INVOICES_SHEET}!T${rowNumber}`, values: [[JSON.stringify({ ...parseManualCompletionData(row[19]), manualCategories })]] },
    { range: `${SERVICE_INVOICES_SHEET}!G${rowNumber}:H${rowNumber}`, values: [[userId, new Date().toISOString()]] },
  ] } });
}

/** A paper invoice can only be replaced before any payment is recorded. */
function assertReplaceableStatus(status: string): void {
  if (status !== "created") throw new Error("Only an unpaid, created Service Invoice can be cancelled and replaced.");
}

export async function cancelAndCreateCorrectedServiceInvoice(invoiceNo: string, userId: string, reason: string): Promise<string> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}` });
  const row = response.data.values?.[0] || [];
  const metadata = parseManualCompletionData(row[19]);
  if (metadata.replacementInvoiceNo) return metadata.replacementInvoiceNo;
  assertReplaceableStatus(String(row[8] ?? "").trim());
  assertUnpaid(String(row[8]), metadata);
  const statusReason = requireStatusReason(reason);

  // Recover a draft left by an interrupted request before creating another one.
  const all = await sheets.spreadsheets.values.get({ spreadsheetId, range: SERVICE_INVOICES_RANGE });
  const existing = (all.data.values || []).find((candidate) => parseManualCompletionData(candidate[19]).replacesInvoiceNo === invoiceNo);
  let replacementNo = String(existing?.[0] ?? "").trim();
  if (!replacementNo) {
    const itemRows = await findInvoiceItemRows(sheets, spreadsheetId, invoiceNo);
    const replacement = await processServiceInvoice({
      invoiceNo: "", status: "draft", date: String(row[1] ?? ""),
      customerId: String(row[2] ?? ""), preparedBy: String(row[3] ?? ""),
      items: itemRows.map(({ rowData }) => ({ description: String(rowData[1] ?? ""), quantity: Number(rowData[2]) || 0, unitPrice: Number(rowData[3]) || 0, productId: String(rowData[5] ?? "") || undefined, productCategoryId: String(rowData[6] ?? "") || undefined })),
      contractId: String(row[10] ?? ""), drNumber: Number(row[11]) || undefined,
      assignedTechnicianUserId: String(row[12] ?? "") || undefined,
      referenceMode: row[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER",
      discountSettings: invoiceDiscountSnapshot(metadata.discountData)?.discountSettings,
      poNo: String(row[16] ?? ""), trNo: String(row[17] ?? ""), salesOrderId: String(row[18] ?? "") || undefined,
    }, userId);
    replacementNo = replacement.invoiceNo;
  }
  const replacementRowNumber = await findInvoiceRow(sheets, spreadsheetId, replacementNo);
  const replacementRow = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!T${replacementRowNumber}` });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: [
    { range: `${SERVICE_INVOICES_SHEET}!T${replacementRowNumber}`, values: [[JSON.stringify({ ...parseManualCompletionData(replacementRow.data.values?.[0]?.[0]), manualCategories: metadata.manualCategories, replacesInvoiceNo: invoiceNo })]] },
    { range: `${SERVICE_INVOICES_SHEET}!G${rowNumber}:I${rowNumber}`, values: [[userId, new Date().toISOString(), "cancelled"]] },
    { range: `${SERVICE_INVOICES_SHEET}!T${rowNumber}`, values: [[JSON.stringify({ ...metadata, replacementInvoiceNo: replacementNo, statusReason, statusHistory: [...(Array.isArray(metadata.statusHistory) ? metadata.statusHistory : []), { status: "cancelled", reason: statusReason, changedBy: userId, changedAt: new Date().toISOString() }] })]] },
  ] } });
  return replacementNo;
}

/** Updates an existing service invoice header and its items. */
export async function updateServiceInvoice(
  invoiceNo: string,
  payload: UpdateServiceInvoicePayload,
  userId = "",
): Promise<ServiceInvoiceSummary> {
  try {
    if (payload.manualCategories !== undefined) validateManualCategories(payload.manualCategories);
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
    if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const oldStatus = String(currentRow[8] ?? "created").trim();
    const currentMetadata = parseManualCompletionData(currentRow[19]);
    const newStatus = payload.status ?? (oldStatus === "paid" ? "created" : oldStatus);
    if (!["draft", "created", "void"].includes(newStatus)) throw new Error("Invalid invoice status.");
    if (newStatus === "void" || (newStatus === "draft" && oldStatus !== "draft")) assertUnpaid(oldStatus, currentMetadata);
    const statusReason = newStatus === "void" ? requireStatusReason(payload.statusReason) : currentMetadata.statusReason;
    const catalogReferences = payload.items ? await itemCatalogReferences(payload.items) : undefined;
    if (catalogReferences?.some((entry) => entry.productId)) await ensureServiceInvoiceItemCatalogHeaders(sheets, spreadsheetId);
    if (oldStatus === "cancelled" || oldStatus === "void" || oldStatus === "deleted") throw new Error("This Service Invoice can no longer be edited.");
    if (newStatus === "cancelled") throw new Error("Use Cancel and create corrected copy to cancel a Service Invoice.");
    if (parseManualCompletionData(currentRow[19]).replacesInvoiceNo && !["draft", "created", "void"].includes(newStatus)) throw new Error("A corrected copy must be finalized as created before payment.");

    const isFinal = newStatus !== "draft";
    const updatedAt = new Date().toISOString();

    // A draft uses a DRAFT-* placeholder as its invoice number. When it is
    // promoted to a real status (draft -> created/paid/etc.), assign a new
    // sequential invoice number now so the finalized invoice has one.
    let effectiveInvoiceNo = invoiceNo;
    if (invoiceNo.startsWith("DRAFT-") && newStatus !== "draft") {
      const requestedNo = String(payload.invoiceNo ?? "").trim();
      if (parseManualCompletionData(currentRow[19]).replacesInvoiceNo) {
        if (!requestedNo || requestedNo.startsWith("DRAFT-")) throw new Error("Enter the new number from the physical Service Invoice form.");
        const taken = await findInvoiceRow(sheets, spreadsheetId, requestedNo);
        if (taken > 1) throw new Error(`Invoice No. "${requestedNo}" already exists.`);
        effectiveInvoiceNo = requestedNo;
      } else {
        effectiveInvoiceNo = await generateNextInvoiceNo(sheets, spreadsheetId);
      }
    }

    const requestedDrNumber = payload.drNumber !== undefined
      ? payload.drNumber
      : (String(currentRow[11] ?? "").trim() ? parseInt(String(currentRow[11]), 10) : undefined);
    const linkedDrNumber = typeof requestedDrNumber === "number" && !isNaN(requestedDrNumber)
      ? requestedDrNumber
      : undefined;
    const references = await resolveInvoiceReferences({
      drNumber: linkedDrNumber,
      referenceMode: payload.referenceMode ?? (currentRow[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER"),
      salesOrderId: linkedDrNumber === undefined
        ? (payload.salesOrderId !== undefined ? payload.salesOrderId : String(currentRow[18] ?? "").trim())
        : undefined,
      poNo: payload.poNo !== undefined ? payload.poNo : String(currentRow[16] ?? "").trim(),
      trNo: payload.trNo !== undefined ? payload.trNo : String(currentRow[17] ?? "").trim(),
    });
    if (references.salesOrderId) {
      const order = await getOrderDetail(references.salesOrderId);
      const customerId = payload.customerId ?? String(currentRow[2] ?? "").trim();
      if (order.order.customerId !== customerId) {
        throw new Error("The selected Sales Order belongs to a different customer.");
      }
    }
    const discountItems = payload.items ?? (await findInvoiceItemRows(sheets, spreadsheetId, invoiceNo)).map(({ rowData }) => ({ description: String(rowData[1] ?? ""), quantity: Number(rowData[2]) || 0, unitPrice: Number(rowData[3]) || 0, productId: String(rowData[5] ?? "") || undefined }));
    const previousDiscount = invoiceDiscountSnapshot(currentMetadata.discountData);
    hydrateInvoiceDiscount(discountItems, previousDiscount);
    const discountData = ["draft", "created"].includes(newStatus)
      ? resolveInvoiceDiscount(discountItems, payload.discountSettings ?? previousDiscount?.discountSettings, references.salesOrderId ? await getOrderDetail(references.salesOrderId) : undefined)
      : previousDiscount;
    hydrateInvoiceDiscount(discountItems, discountData);

    let deliveredBy: DeliveredByResolution;
    if (linkedDrNumber !== undefined) {
      // A linked DR always wins, even if a client submits another user ID.
      deliveredBy = await resolveServiceInvoiceDeliveredBy({ drNumber: linkedDrNumber }, isFinal);
    } else if (payload.assignedTechnicianUserId !== undefined || payload.deliveredById !== undefined) {
      // The explicit technician (or its legacy `deliveredById` alias) replaces the
      // stored value. No DR is linked here, so it decides alone. An explicitly
      // empty value clears M/N.
      const resolved = await resolveAssignedTechnician(payload);
      deliveredBy = {
        deliveredById: resolved.assignedTechnicianUserId,
        deliveredByName: resolved.assignedTechnicianName,
      };
    } else {
      deliveredBy = {
        deliveredById: String(currentRow[12] ?? "").trim() || undefined,
        deliveredByName: String(currentRow[13] ?? "").trim() || undefined,
      };
      if (isFinal && !deliveredBy.deliveredById) {
        throw new Error("Delivered By is required before finalizing a Service Invoice.");
      }
    }

    // M/N hold the assigned technician; O/P are owned by the Service Report link.
    const currentTechnicianId = String(currentRow[12] ?? "").trim() || "";
    const currentTechnicianName = String(currentRow[13] ?? "").trim() || "";
    const assignedTechnician = payload.assignedTechnicianUserId !== undefined || payload.deliveredById !== undefined
      ? await resolveAssignedTechnician(payload)
      : { assignedTechnicianUserId: currentTechnicianId, assignedTechnicianName: currentTechnicianName };
    // The values written to M/N: a linked DR's technician wins, else the explicit
    // technician, else the stored value.
    const technicianIdForRow = linkedDrNumber !== undefined && deliveredBy.deliveredById
      ? deliveredBy.deliveredById
      : assignedTechnician.assignedTechnicianUserId || "";
    const technicianNameForRow = linkedDrNumber !== undefined && deliveredBy.deliveredById
      ? deliveredBy.deliveredByName || ""
      : assignedTechnician.assignedTechnicianName || "";
    const updatedRow = [
      effectiveInvoiceNo,
      payload.date ?? String(currentRow[1] ?? "").trim(),
      payload.customerId ?? String(currentRow[2] ?? "").trim(),
      payload.preparedBy ?? String(currentRow[3] ?? "").trim(),
      String(currentRow[4] ?? "").trim(),
      String(currentRow[5] ?? "").trim(),
      userId || String(currentRow[6] ?? "").trim(),
      updatedAt,
      payload.status ?? String(currentRow[8] ?? "created").trim(),
      String(currentRow[9] ?? "").trim(),
      payload.contractId !== undefined
        ? payload.contractId
        : String(currentRow[10] ?? "").trim(),
      payload.drNumber !== undefined
        ? linkedDrNumber?.toString() || ""
        : String(currentRow[11] ?? "").trim(),
      technicianIdForRow, // M: AssignedTechnicianUserId
      technicianNameForRow, // N: AssignedTechnicianName
      String(currentRow[14] ?? "").trim(), // O: ServiceReportId (owned by the report link)
      String(currentRow[15] ?? "").trim(), // P: ServiceReportStatus
      references.poNo, // Q: PONumber
      references.trNo, // R: TRNumber
      references.salesOrderId || "", // S: direct SalesOrderId
      JSON.stringify({ ...currentMetadata, discountData, paymentStatus: paymentStatusFor(oldStatus, currentMetadata), ...(payload.manualCategories !== undefined ? { manualCategories: validateManualCategories(payload.manualCategories) } : {}), ...(newStatus === "void" ? { statusReason, statusHistory: [...(Array.isArray(currentMetadata.statusHistory) ? currentMetadata.statusHistory : []), { status: "void", reason: statusReason!, changedBy: userId, changedAt: updatedAt }] } : {}) }), // T: metadata
      payload.referenceMode ?? (currentRow[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER"), // U: ReferenceMode
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    // If a draft was promoted but items were not included in this update,
    // re-key the existing item rows so they point at the new invoice number
    // instead of the DRAFT-* placeholder.
    if (effectiveInvoiceNo !== invoiceNo && !payload.items) {
      const orphanItemRows = await findInvoiceItemRows(
        sheets,
        spreadsheetId,
        invoiceNo,
      );
      if (orphanItemRows.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: orphanItemRows.map((r) => ({
              range: `${SERVICE_INVOICE_ITEMS_SHEET}!A${r.rowNumber}`,
              values: [[effectiveInvoiceNo]],
            })),
          },
        });
      }
    }

    if (payload.items) {
      const existingItemRows = await findInvoiceItemRows(
        sheets,
        spreadsheetId,
        invoiceNo,
      );
      const itemRows = payload.items.map((item, index) => [
        effectiveInvoiceNo,
        normalizeDescription(item.description),
        item.quantity,
        item.unitPrice,
        (item.quantity || 0) * (item.unitPrice || 0),
        catalogReferences![index].productId,
        catalogReferences![index].categoryId,
      ]);
      await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: SERVICE_INVOICE_ITEMS_SHEET, columnCount: 7, existingRows: existingItemRows, values: itemRows });
    }
    const replacesInvoiceNo = parseManualCompletionData(currentRow[19]).replacesInvoiceNo;
    if (effectiveInvoiceNo !== invoiceNo && replacesInvoiceNo) {
      const originalRowNumber = await findInvoiceRow(sheets, spreadsheetId, replacesInvoiceNo);
      if (originalRowNumber > 1) {
        const original = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!T${originalRowNumber}` });
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!T${originalRowNumber}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[JSON.stringify({ ...parseManualCompletionData(original.data.values?.[0]?.[0]), replacementInvoiceNo: effectiveInvoiceNo })]] } });
      }
    }

    const companies = await getCompanies().catch(() => []);
    const company = companies.find(
      (c) => c.companyId === updatedRow[2] || c.id === updatedRow[2],
    );
    let trackerAssignmentOutcome: ServiceInvoiceSummary["trackerAssignmentOutcome"];
    let trackerAssignmentWarning: string | undefined;
    const existingTracker = isFinal
      ? (await getDocumentHandovers()).some((handover) =>
          handover.documentType.toLowerCase() === "service_invoice" &&
          handover.documentNumber.trim().toLowerCase() === effectiveInvoiceNo.trim().toLowerCase(),
        )
      : false;
    if (existingTracker && technicianIdForRow && technicianNameForRow) {
      try {
        const assignment = await ensureAutomaticDocumentHandover({
          documentType: "service_invoice",
          documentNumber: effectiveInvoiceNo,
          customerName: company?.companyName || updatedRow[2],
          assignedToId: technicianIdForRow,
          assignedToName: technicianNameForRow,
          assignedBy: userId,
          assignedByName: updatedRow[3] || userId,
          notes: "Automatically assigned from Service Invoice",
        });
        trackerAssignmentOutcome = assignment.outcome;
      } catch (error) {
        console.error("Service Invoice was updated but Document Tracker assignment failed:", error);
        trackerAssignmentWarning = `Service Invoice was updated, but Document Tracker assignment failed: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    }
    let finalDiscount = discountData;
    if (references.salesOrderId && ["draft", "created"].includes(newStatus)) {
      const allocations = await syncSalesOrderInvoiceDiscounts(await getOrderDetail(references.salesOrderId));
      finalDiscount = allocations[effectiveInvoiceNo] ?? discountData;
      hydrateInvoiceDiscount(discountItems, finalDiscount);
    }

    return {
      invoiceNo: effectiveInvoiceNo,
      date: updatedRow[1],
      customerId: updatedRow[2],
      companyName: company?.companyName || updatedRow[2],
      preparedBy: updatedRow[3],
      createdBy: String(updatedRow[4] ?? "").trim() || undefined,
      createdAt: updatedRow[5],
      updatedBy: String(updatedRow[6] ?? "").trim() || undefined,
      updatedAt: updatedRow[7] || undefined,
      status: updatedRow[8],
      paymentStatus: paymentStatusFor(String(updatedRow[8]), parseManualCompletionData(updatedRow[19])),
      scannedFileLink: parseManualCompletionData(updatedRow[19]).scannedFileLink,
      scannedStatus: parseManualCompletionData(updatedRow[19]).scannedFileLink ? "scanned" : "not_scanned",
      statusReason: parseManualCompletionData(updatedRow[19]).statusReason,
      driveFileLink: String(updatedRow[9] ?? "").trim() || undefined,
      contractId: String(updatedRow[10] ?? "").trim() || undefined,
      drNumber: updatedRow[11]
        ? parseInt(String(updatedRow[11]), 10) || undefined
        : undefined,
      poNo: references.poNo || undefined,
      trNo: references.trNo || undefined,
      salesOrderId: references.salesOrderId || undefined,
      referenceMode: updatedRow[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER",
      manualCompletionStatus: parseManualCompletionData(updatedRow[19]).status,
      manualCompletionDate: parseManualCompletionData(updatedRow[19]).completionDate,
      manualCompletionTechnicianId: parseManualCompletionData(updatedRow[19]).technicianId,
      manualCompletionTechnicianName: parseManualCompletionData(updatedRow[19]).technicianName,
      manualCompletionNotes: parseManualCompletionData(updatedRow[19]).notes,
      manualCompletionFulfillmentIds: parseManualCompletionData(updatedRow[19]).fulfillmentIds,
      replacesInvoiceNo: parseManualCompletionData(updatedRow[19]).replacesInvoiceNo,
      replacementInvoiceNo: parseManualCompletionData(updatedRow[19]).replacementInvoiceNo,
      assignedTechnicianUserId: technicianIdForRow || undefined,
      assignedTechnicianName: technicianNameForRow || undefined,
      trackerAssignmentOutcome,
      trackerAssignmentWarning,
      items: discountItems,
      discountSettings: finalDiscount?.discountSettings,
      discountAmount: finalDiscount?.discountAmount,
    };
  } catch (error) {
    console.error("Failed to update service invoice:", error);
    throw error;
  }
}

/** Ensures the tracker entry after a finalized Service Invoice PDF is saved. */
export async function ensureServiceInvoiceDocumentTrackerAssignment(
  invoiceNo: string,
  assignedBy: string,
  assignedByName: string,
): Promise<NonNullable<ServiceInvoiceResponse["trackerAssignmentOutcome"]>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:P${rowNumber}`,
  });
  const row = response.data.values?.[0] || [];
  const status = String(row[8] ?? "").trim();
  const technicianId = String(row[12] ?? "").trim();
  const technicianName = String(row[13] ?? "").trim();
  if (status === "draft" || !technicianId || !technicianName) return "unassigned";
  const companyId = String(row[2] ?? "").trim();
  const companies = await getCompanies().catch(() => []);
  const companyName = companies.find((company) => company.companyId === companyId || company.id === companyId)?.companyName || companyId;
  const outcome = await ensureAutomaticDocumentHandover({
    documentType: "service_invoice",
    documentNumber: String(row[0] ?? invoiceNo).trim(),
    customerName: companyName,
    assignedToId: technicianId,
    assignedToName: technicianName,
    assignedBy,
    assignedByName,
    notes: "Automatically assigned from Service Invoice",
  });
  return outcome.outcome;
}

/** Soft-deletes a service invoice by setting its status to "deleted". */
export async function deleteServiceInvoice(invoiceNo: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
    if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    if (String(currentRow[8] ?? "") === "cancelled" || parseManualCompletionData(currentRow[19]).replacesInvoiceNo) throw new Error("Invoice history cannot be deleted.");
    assertUnpaid(String(currentRow[8]), parseManualCompletionData(currentRow[19]));
    const updatedRow = currentRow.slice(0, 12);
    while (updatedRow.length < 12) updatedRow.push("");
    updatedRow[8] = "deleted";

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:L${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });
  } catch (error) {
    console.error("Failed to delete service invoice:", error);
    throw error;
  }
}

/** Populates template and exports PDF. */
export async function populateAndExportServiceInvoiceFormPdf(
  invoiceNo: string,
): Promise<{ pdfBase64: string; printUrl: string }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();

  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);

  const invResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}`,
  });
  const invRow = invResponse.data.values?.[0] || [];
  const date = String(invRow[1] ?? "").trim();
  const customerId = String(invRow[2] ?? "").trim();
  const preparedByHeader = String(invRow[3] ?? "").trim();
  const createdBy = String(invRow[4] ?? "").trim();
  const linkedDrNumber = parseInt(String(invRow[11] ?? ""), 10);
  const references = await resolveInvoiceReferences({
    drNumber: Number.isFinite(linkedDrNumber) ? linkedDrNumber : undefined,
    salesOrderId: String(invRow[18] ?? "").trim(),
    referenceMode: invRow[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER",
    poNo: String(invRow[16] ?? "").trim(),
    trNo: String(invRow[17] ?? "").trim(),
  });

  const itemRowsData = await findInvoiceItemRows(
    sheets,
    spreadsheetId,
    invoiceNo,
  );
  const items: ServiceInvoiceItem[] = itemRowsData.map(({ rowData }) => ({
    description: String(rowData[1] ?? "").trim(),
    quantity: parseFloat(String(rowData[2] ?? "0")) || 0,
    unitPrice: parseFloat(String(rowData[3] ?? "0")) || 0,
    amount: parseFloat(String(rowData[4] ?? "0")) || 0,
  }));
  let discountData = invoiceDiscountSnapshot(parseInvoiceMetadata(invRow[19]).discountData);
  hydrateInvoiceDiscount(items, discountData);
  if (["draft", "created"].includes(String(invRow[8])) && references.salesOrderId) {
    const source = await getOrderDetail(references.salesOrderId);
    if (discountData?.sourceVersion !== source.order.version) discountData = resolveInvoiceDiscount(items, undefined, source);
    hydrateInvoiceDiscount(items, discountData);
  }


  const customers = await getCustomers();
  const company = customers.find(
    (c) => c.companyId === customerId || c.id === customerId,
  );
  const companyName = company?.companyName || customerId;
  const address = company?.address || "";
  const tin = company?.tin || "";

  const preparedBy = await resolvePreparedByTitle(createdBy, preparedByHeader);

  await populateServiceInvoiceTemplate(sheets, spreadsheetId, {
    companyName,
    address,
    tin,
    date,
    preparedBy,
    poNo: references.poNo,
    trNo: references.trNo,
    items,
    discountSettings: discountData?.discountSettings,
    discountAmount: discountData?.discountAmount,
  });

  const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
  const printUrl = buildExportUrl(spreadsheetId, gid);
  const pdfBase64 = await fetchExportPdfBase64(printUrl);

  return { pdfBase64, printUrl };
}

export async function exportServiceInvoiceFormPdf(): Promise<{
  pdfBase64: string;
  printUrl: string;
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
  const printUrl = buildExportUrl(spreadsheetId, gid);
  const pdfBase64 = await fetchExportPdfBase64(printUrl);
  return { pdfBase64, printUrl };
}

/** Overwrites saved invoice PDFs that inherit their references from one DR. */
export async function regenerateStoredServiceInvoicePdfsForDr(_drNumber: number): Promise<void> {
  void _drNumber;
  // Physical paper scans are evidence and must never be regenerated.
}

export interface ManualServiceCompletionInput {
  completionDate: string;
  technicianUserId: string;
  notes: string;
}

type ManualCompletionRecord = {
  rowNumber: number;
  invoiceNo: string;
  salesOrderId: string;
  status: string;
  fulfillmentIds: string[];
};

async function readManualCompletionRecord(invoiceNo: string): Promise<ManualCompletionRecord> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:U${rowNumber}` });
  const row = response.data.values?.[0] || [];
  const salesOrderId = String(row[18] ?? "").trim();
  if (!salesOrderId) throw new Error("A Service Invoice must be linked to a Sales Order before completing service.");
  const completion = parseManualCompletionData(row[19]);
  return { rowNumber, invoiceNo: String(row[0] ?? invoiceNo).trim(), salesOrderId, status: completion.status || "", fulfillmentIds: completion.fulfillmentIds || [] };
}

export async function getServiceInvoiceManualCompletionRecord(invoiceNo: string): Promise<Pick<ManualCompletionRecord, "salesOrderId" | "status">> {
  const record = await readManualCompletionRecord(invoiceNo);
  return { salesOrderId: record.salesOrderId, status: record.status };
}

async function writeManualCompletion(record: ManualCompletionRecord, values: { status: "COMPLETED" | "REVERSED"; completionDate: string; technicianId: string; technicianName: string; notes: string; fulfillmentIds: string[] }): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const current = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!T${record.rowNumber}` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!T${record.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[JSON.stringify({ ...parseManualCompletionData(current.data.values?.[0]?.[0]), ...values })]] },
  });
}

/** Completes every active, unfulfilled service line for a Service Invoice. */
export async function completeServiceInvoiceManually(invoiceNo: string, input: ManualServiceCompletionInput, actor: Actor, allowReplace: boolean): Promise<void> {
  const record = await readManualCompletionRecord(invoiceNo);
  const technician = await getUserById(input.technicianUserId);
  if (!technician?.fullName.trim()) throw new Error("Technician / responsible person must be an active application user.");
  if (!input.completionDate.trim()) throw new Error("Completion date is required.");
  if (!input.notes.trim()) throw new Error("Completion notes are required.");
  let detail = await getOrderDetail(record.salesOrderId);
  if (record.status === "COMPLETED") {
    if (!allowReplace) throw new Error("This Service Invoice is already manually completed.");
    const prior = detail.fulfillments.filter((entry) => entry.status === "POSTED" && entry.sourceDocumentType === "SERVICE_INVOICE" && entry.sourceDocumentId === record.invoiceNo);
    if (prior.length) {
      detail = await postFulfillments(actor, record.salesOrderId, {
        commandId: crypto.randomUUID(), expectedVersion: detail.order.version,
        entries: prior.map((entry) => ({ salesOrderItemId: entry.salesOrderItemId, type: "REVERSAL", quantity: entry.quantity, effectiveDate: input.completionDate, sourceDocumentType: "SERVICE_INVOICE", sourceDocumentId: record.invoiceNo, sourceLineId: entry.sourceLineId, evidenceDriveFileId: "", reversesFulfillmentId: entry.fulfillmentId })),
      });
    }
  }
  const serviceLines = detail.items.filter((item) => item.lineStatus === "ACTIVE" && item.lineType === "SERVICE");
  if (!serviceLines.length) throw new Error("The linked Sales Order has no active service lines to complete.");
  if (serviceLines.some((item) => item.fulfilledQty > 0)) throw new Error("One or more service lines are already fulfilled. Reverse the existing completion before using manual completion.");
  const commandId = crypto.randomUUID();
  const completed = await postFulfillments(actor, record.salesOrderId, {
    commandId, expectedVersion: detail.order.version,
    entries: serviceLines.map((item) => ({ salesOrderItemId: item.salesOrderItemId, type: "SERVICE_COMPLETION", quantity: Math.max(0, (item.quantity ?? 0) - item.cancelledQty), effectiveDate: input.completionDate, sourceDocumentType: "SERVICE_INVOICE", sourceDocumentId: record.invoiceNo, sourceLineId: item.salesOrderItemId, evidenceDriveFileId: "", reversesFulfillmentId: "" })),
  });
  const fulfillmentIds = completed.fulfillments.filter((entry) => entry.commandId === commandId).map((entry) => entry.fulfillmentId);
  await writeManualCompletion(record, { status: "COMPLETED", completionDate: input.completionDate, technicianId: technician.userId, technicianName: technician.fullName, notes: input.notes.trim(), fulfillmentIds });
}

/** Admin-only correction that reverses the manual completion posted from an invoice. */
export async function reverseManualServiceInvoiceCompletion(invoiceNo: string, reversalDate: string, notes: string, actor: Actor): Promise<void> {
  const record = await readManualCompletionRecord(invoiceNo);
  if (record.status !== "COMPLETED") throw new Error("This Service Invoice has no active manual completion to reverse.");
  const detail = await getOrderDetail(record.salesOrderId);
  const prior = detail.fulfillments.filter((entry) => entry.status === "POSTED" && entry.sourceDocumentType === "SERVICE_INVOICE" && entry.sourceDocumentId === record.invoiceNo);
  if (!prior.length) throw new Error("The manual completion fulfillment entries were not found.");
  await postFulfillments(actor, record.salesOrderId, {
    commandId: crypto.randomUUID(), expectedVersion: detail.order.version,
    entries: prior.map((entry) => ({ salesOrderItemId: entry.salesOrderItemId, type: "REVERSAL", quantity: entry.quantity, effectiveDate: reversalDate, sourceDocumentType: "SERVICE_INVOICE", sourceDocumentId: record.invoiceNo, sourceLineId: entry.sourceLineId, evidenceDriveFileId: "", reversesFulfillmentId: entry.fulfillmentId })),
  });
  await writeManualCompletion(record, { status: "REVERSED", completionDate: reversalDate, technicianId: "", technicianName: actor.displayName, notes: notes.trim(), fulfillmentIds: record.fulfillmentIds });
}

/** Syncs direct service-only Sales Order invoices and overwrites their saved PDFs. */
export async function syncSalesOrderServiceInvoiceReferences(salesOrderId: string): Promise<void> {
  const order = await getOrderDetail(salesOrderId);
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A2:U` });
  const matches = (response.data.values ?? []).map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row[20] !== "TR_NUMBER" && !String(row[11] ?? "").trim() && String(row[18] ?? "").trim() === salesOrderId);
  if (!matches.length) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: matches.flatMap(({ rowNumber }) => [
      { range: `${SERVICE_INVOICES_SHEET}!Q${rowNumber}`, values: [[order.order.customerPONo || ""]] },
      { range: `${SERVICE_INVOICES_SHEET}!R${rowNumber}`, values: [[order.order.salesOrderNo || ""]] },
    ]) },
  });

}

export async function testPopulateServiceInvoiceTemplateWithDuplicatedItems(
  invoiceNo: string,
): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();

  const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
  if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);

  const invResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:L${rowNumber}`,
  });
  const invRow = invResponse.data.values?.[0] || [];
  const date = String(invRow[1] ?? "").trim();
  const customerId = String(invRow[2] ?? "").trim();
  const preparedByHeader = String(invRow[3] ?? "").trim();
  const createdBy = String(invRow[4] ?? "").trim();

  const itemRowsData = await findInvoiceItemRows(
    sheets,
    spreadsheetId,
    invoiceNo,
  );
  const originalItems: ServiceInvoiceItem[] = itemRowsData.map(
    ({ rowData }) => ({
      description: String(rowData[1] ?? "").trim(),
      quantity: parseFloat(String(rowData[2] ?? "0")) || 0,
      unitPrice: parseFloat(String(rowData[3] ?? "0")) || 0,
      amount: parseFloat(String(rowData[4] ?? "0")) || 0,
    }),
  );

  if (originalItems.length === 0) {
    throw new Error(
      `No items found for invoice "${invoiceNo}". Cannot duplicate.`,
    );
  }

  const maxItems = TEMPLATE_ITEM_END_ROW - TEMPLATE_ITEM_START_ROW + 1;
  const duplicatedItems: ServiceInvoiceItem[] = [];
  let cycleCount = 1;

  while (duplicatedItems.length < maxItems) {
    for (const item of originalItems) {
      if (duplicatedItems.length >= maxItems) break;
      duplicatedItems.push({
        description: `${item.description} (${cycleCount})`,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      });
    }
    cycleCount++;
  }

  const customers = await getCustomers();
  const company = customers.find(
    (c) => c.companyId === customerId || c.id === customerId,
  );
  const companyName = company?.companyName || customerId;
  const address = company?.address || "";
  const tin = company?.tin || "";

  const preparedBy = await resolvePreparedByTitle(createdBy, preparedByHeader);

  await populateServiceInvoiceTemplate(sheets, spreadsheetId, {
    companyName,
    address,
    tin,
    date,
    preparedBy,
    items: duplicatedItems,
  });
}


/**
 * Best-effort ServiceInvoices O:P link used by the Service Report module after
 * create/acknowledge/void transitions. Writes ONLY columns O and P - existing
 * columns (including the M/N assigned technician) are never shifted.
 */
export async function syncServiceInvoiceReportLink(
  invoiceNo: string,
  reportId: string,
  reportStatus: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
    if (rowNumber <= 1) return;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!O${rowNumber}:P${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[reportId, reportStatus]] },
    });
  } catch (error) {
    console.error("syncServiceInvoiceReportLink failed (non-fatal):", error);
  }
}

/** Update only editable invoice snapshots when a Sales Order changes. */
export async function syncSalesOrderInvoiceDiscounts(source: { order: import("@/types/salesOrder").SalesOrder; items: import("@/types/salesOrder").SalesOrderItem[] }): Promise<Record<string, InvoiceDiscountData>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const headers = await sheets.spreadsheets.values.get({ spreadsheetId, range: SERVICE_INVOICES_RANGE });
  const rows = headers.data.values || [];
  const linked = rows.map((row, index) => ({ row, index })).filter(({ row }) => String(row[18]) === source.order.salesOrderId && ["draft", "created", "paid"].includes(String(row[8])));
  if (!linked.some(({ row }) => ["draft", "created"].includes(String(row[8])))) return {};
  const allItems = await readServiceInvoiceItemValues(sheets, spreadsheetId);
  const invoices = linked.map(({ row, index }) => {
    const metadata = parseInvoiceMetadata(row[19]);
    const items = allItems.filter(item => String(item[0]) === String(row[0])).map(item => ({ description: String(item[1]), quantity: Number(item[2]) || 0, unitPrice: Number(item[3]) || 0, productId: String(item[5] || "") || undefined }));
    hydrateInvoiceDiscount(items, invoiceDiscountSnapshot(metadata.discountData));
    return { row, index, metadata, items, status: String(row[8]), discountData: invoiceDiscountSnapshot(metadata.discountData) };
  });
  const allocations = allocateInvoiceDiscounts(source, invoices);
  const result: Record<string, InvoiceDiscountData> = {};
  const data = invoices.flatMap(({ row, index, metadata }, i) => {
    if (!["draft", "created"].includes(String(row[8]))) return [];
    const discountData = allocations[i]; result[String(row[0])] = discountData;
    return [{ range: `${SERVICE_INVOICES_SHEET}!T${index + 2}`, values: [[JSON.stringify({ ...metadata, discountData })]] }];
  });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
  return result;
}
