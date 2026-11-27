import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
  getDriveUploadClient,
} from "@/lib/googleSheets";
import { Readable } from "stream";
import { getCompanies } from "@/lib/companySheets";
import { validateForCompany } from "@/lib/deliveryPrintForm";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
  DeliveryReceiptSummary,
  DRStatusEntry,
  DeliveryPersonOption,
} from "@/types/deliveryReceipt";
import { getDeliveryItems, renameDeliveryItemReferences, replaceDeliveryItems } from "@/lib/transactionItemSheets";
import { deliveryPrintRows } from "@/lib/deliverySerials";
import { getUserById, getUsers } from "@/lib/userSheets";
import { commitDocumentWithHandover } from "@/lib/documentHandoverCommit";
import {
  deliveryReferenceFromRow,
  deliveryReferenceRowValues,
  noChargeReasonDisplay,
  noChargeSwitchError,
  type NoChargeSwitchBlockers,
} from "@/lib/deliveryReference";
import { getOrderDetail, type Actor } from "@/lib/salesOrders/service";
import { can } from "@/lib/salesOrders/permissions";
import { drCompletesOnScan } from "@/lib/documentScanReturn";
import { forbidden } from "@/lib/salesOrders/errors";

const DELIVERED_BY_NAMES_SHEET = "DeliveredByNames";
const DELIVERED_BY_NAMES_RANGE = `${DELIVERED_BY_NAMES_SHEET}!A2:E`;

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";
const DELIVERY_RECEIPTS_RANGE = `${DELIVERY_RECEIPTS_SHEET}!A2:AA`;
/** Read range including the scanned copy columns AB:AD (ScannedFileLink, ScannedAt, ScannedBy). */
const DELIVERY_RECEIPTS_READ_RANGE = `${DELIVERY_RECEIPTS_SHEET}!A2:AD`;
// A:DRNumber B:DeliveryDate C:CompanyId D:PONumber E:SalesOrderNo (legacy TRNumber)
// F:SRNumber G:Comments H:PreparedBy I:DeliveredBy J:CreatedAt K:Status L:DriveFileLink
// M:CreatedBy N:UpdatedBy O:UpdatedDate P:DeliveredById Q:DeliveredByType
// R:DeliveredByOptionId S:SalesOrderId T:WarehouseId U:ApprovedBy V:ApprovedAt W:ApprovalNote X:RequestedStatus
// Y:ForCompanyId Z:NoChargeReason AA:NoChargeNote AB:ScannedFileLink AC:ScannedAt AD:ScannedBy
// Writers of A:S leave T:W untouched; writeInventoryColumns() owns T:W.

/** Statuses that keep a DR unnumbered, unprinted and out of stock and fulfillment. */
const HELD_DR_STATUSES = new Set(["draft", "pending_approval", "rejected"]);
function isHeldDrStatus(status: string | undefined): boolean {
  return HELD_DR_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

async function writeInventoryColumns(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  rowNumber: number,
  values: { warehouseId: string; approvedBy: string; approvedAt: string; approvalNote: string; requestedStatus: string },
): Promise<void> {
  if (rowNumber <= 1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!T${rowNumber}:X${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[values.warehouseId, values.approvedBy, values.approvedAt, values.approvalNote, values.requestedStatus]] },
  });
}

/** Writes the DR's FOR client (column Y). The column and its ForCompanyId header are
 * provisioned by scripts/setup-inventory-sheets.mjs. */
async function writeForCompanyColumn(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  rowNumber: number,
  forCompanyId: string,
): Promise<void> {
  if (rowNumber <= 1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!Y${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[forCompanyId]] },
  });
}

/** Writes the no-charge reason and note (columns Z:AA); "" clears them. Headers are
 * provisioned by scripts/setup-inventory-sheets.mjs. */
async function writeNoChargeColumns(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  rowNumber: number,
  reason: string,
  note: string,
): Promise<void> {
  if (rowNumber <= 1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!Z${rowNumber}:AA${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[reason, note]] },
  });
}

/** What an existing DR already counts toward, read before it may become No charge. */
async function noChargeSwitchBlockers(drNumber: number, salesOrderId: string): Promise<NoChargeSwitchBlockers> {
  const [{ getContractReleases }, { readDrLinkedInvoiceNumbers }] = await Promise.all([
    import("@/lib/contractReleaseSheets"),
    import("@/lib/invoiceRepository"),
  ]);
  const [releases, linkedInvoices, order] = await Promise.all([
    getContractReleases(),
    readDrLinkedInvoiceNumbers(drNumber),
    salesOrderId ? getOrderDetail(salesOrderId) : Promise.resolve(undefined),
  ]);
  // Net of reversals, as reverseDeletedDeliveryReleaseFulfillment computes it.
  const fulfillments = order?.fulfillments ?? [];
  const salesOrderFulfillment = fulfillments.some((source) => {
    if (source.status !== "POSTED" || source.fulfillmentType !== "DELIVERY" ||
        source.sourceDocumentType !== "DELIVERY_RECEIPT" || source.sourceDocumentId !== String(drNumber)) return false;
    const reversed = fulfillments
      .filter((entry) => entry.status === "POSTED" && entry.fulfillmentType === "REVERSAL" && entry.reversesFulfillmentId === source.fulfillmentId)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    return Number((source.quantity - reversed).toFixed(2)) > 0;
  });
  return {
    contractReleases: releases.some((release) => release.drNumber === drNumber),
    salesOrderFulfillment,
    linkedInvoices,
  };
}

const DR_STATUS_HISTORY_SHEET = "DeliveryReceiptStatusHistory";
const DR_STATUS_HISTORY_RANGE = `${DR_STATUS_HISTORY_SHEET}!A2:E`;
// A:DRNumber B:OldStatus C:NewStatus D:ChangedBy E:ChangedAt

const PRINT_TEMPLATE_SHEET = "DeliveryReceiptForm";
const DR_SEQUENCE_BASE = 3642; // last DR number in old system, so next DR starts at 3639

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
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&portrait=true&size=letter&gridlines=false&gid=${gid}`;
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

/** Combines application users with active external delivery options. */
export async function getDriversFromSheets(): Promise<DeliveryPersonOption[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DELIVERED_BY_NAMES_RANGE,
    });
    const users = await getUsers();
    const internal: DeliveryPersonOption[] = users
      .filter((user) => user.userId && user.fullName)
      .map((user) => ({ value: `user:${user.userId}`, label: user.fullName, type: "internal", userId: user.userId }));
    const sheetOptions: DeliveryPersonOption[] = (response.data.values ?? []).flatMap((row, index) => {
      // Backward compatibility: a one-column row is treated as an active external option.
      const legacy = !String(row[1] ?? "").trim();
      const deliveryOptionId = legacy ? `EXT-${String(index + 1).padStart(4, "0")}` : String(row[0] ?? "").trim();
      const label = legacy ? String(row[0] ?? "").trim() : String(row[1] ?? "").trim();
      const type = legacy ? "external" : String(row[2] ?? "external").trim().toLowerCase();
      const active = legacy || !["false", "no", "0", "inactive"].includes(String(row[3] ?? "true").trim().toLowerCase());
      if (!deliveryOptionId || !label || !active || !["internal", "external"].includes(type)) return [];
      // Once an account with the same name exists, the real user option wins.
      if (type === "internal" && internal.some((entry) => entry.label.trim().toLowerCase() === label.toLowerCase())) return [];
      const optionType = type as "internal" | "external";
      return [{ value: `${optionType}:${deliveryOptionId}`, label, type: optionType, deliveryOptionId }];
    });
    return [...internal, ...sheetOptions];
  } catch (error) {
    console.error("Failed to fetch drivers:", error);
    throw error;
  }
}

/** Fetches and groups delivery receipt rows into summary objects by DR number. */
/** Lightweight batch lookup for invoice reporting; no item or company reads. */
export async function getDeliverySalesOrderLinks(): Promise<Map<number, string>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: DELIVERY_RECEIPTS_RANGE });
  const links = new Map<number, string>();
  for (const row of response.data.values ?? []) {
    const reference = deliveryReferenceFromRow(row);
    if (reference.salesOrderId) links.set(Number(row[0]), reference.salesOrderId);
  }
  return links;
}

export async function getDeliveryReceipts(): Promise<DeliveryReceiptSummary[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const drResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DELIVERY_RECEIPTS_READ_RANGE,
    });

    const drRows = drResponse.data.values;
    if (!drRows || drRows.length === 0) return [];

    // Items live in the canonical DeliveryReceiptItems tab, grouped by DR number.
    const itemsByDr = await getDeliveryItems();

    // Resolve companies once
    const companies = await getCompanies().catch(() => []);

    return drRows
      .map((row) => {
        const drNumber = parseInt(String(row[0] ?? "").trim(), 10);
        if (isNaN(drNumber)) return null;

        const reference = deliveryReferenceFromRow(row);

        return {
          drNumber,
          date: String(row[1] ?? "").trim(),
          companyId: String(row[2] ?? "").trim(),
          poNo: String(row[3] ?? "").trim(),
          trNo: reference.displayReference,
          noChargeReason: reference.noChargeReason || undefined,
          noChargeNote: reference.noChargeNote || undefined,
          salesOrderNo: reference.salesOrderNo || undefined,
          salesOrderId: reference.salesOrderId || undefined,
          srNo: String(row[5] ?? "").trim(),
          comments: String(row[6] ?? "").trim(),
          preparedBy: String(row[7] ?? "").trim(),
          deliveredBy: String(row[8] ?? "").trim(),
          deliveredById: String(row[15] ?? "").trim() || undefined,
          deliveredByType: String(row[16] ?? "").trim() === "external" ? "external" : "internal",
          deliveredByOptionId: String(row[17] ?? "").trim() || undefined,
          createdAt: String(row[9] ?? "").trim(),
          status: String(row[10] ?? "created").trim() || "created",
          driveFileLink: String(row[11] ?? "").trim() || undefined,
          createdBy: String(row[12] ?? "").trim() || undefined,
          updatedBy: String(row[13] ?? "").trim() || undefined,
          updatedAt: String(row[14] ?? "").trim() || undefined,
          warehouseId: String(row[19] ?? "").trim() || undefined,
          approvedBy: String(row[20] ?? "").trim() || undefined,
          approvedAt: String(row[21] ?? "").trim() || undefined,
          approvalNote: String(row[22] ?? "").trim() || undefined,
          requestedStatus: String(row[23] ?? "").trim() || undefined,
          forCompanyId: String(row[24] ?? "").trim() || undefined,
          scannedFileLink: String(row[27] ?? "").trim() || undefined,
          scannedAt: String(row[28] ?? "").trim() || undefined,
          scannedBy: String(row[29] ?? "").trim() || undefined,
          items: itemsByDr.get(drNumber) || [],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map((data) => {
        const company = companies.find(
          (c) => c.companyId === data.companyId || c.id === data.companyId,
        );
        return {
          ...data,
          companyName: company?.companyName || data.companyId,
        } as DeliveryReceiptSummary;
      })
      .sort((a, b) => {
          // Sort drafts (negative numbers) after real DRs
          if (a.drNumber <= 0 && b.drNumber > 0) return 1;
          if (a.drNumber > 0 && b.drNumber <= 0) return -1;
          return b.drNumber - a.drNumber;
        });
  } catch (error) {
    console.error("Failed to fetch delivery receipts:", error);
    throw error;
  }
}

/**
 * Resolves the current document references for a Delivery Receipt. A Sales
 * Order remains the source of truth for its Customer PO Number after creation.
 */
export async function resolveDeliveryReceiptReferences(drNumber: number): Promise<{ poNo: string; trNo: string; salesOrderId?: string; noChargeReason?: string }> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const rowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
  if (rowNumber <= 1) throw new Error(`Delivery Receipt #${drNumber} not found.`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!A${rowNumber}:AA${rowNumber}`,
  });
  const row = response.data.values?.[0] || [];
  const salesOrderId = String(row[18] ?? "").trim();
  const noChargeReason = deliveryReferenceFromRow(row).noChargeReason;
  if (noChargeReason) return { poNo: String(row[3] ?? "").trim(), trNo: "", noChargeReason };
  const storedPoNo = String(row[3] ?? "").trim();
  const storedTrNo = String(row[4] ?? "").trim();
  if (!salesOrderId) return { poNo: storedPoNo, trNo: storedTrNo };

  const order = await getOrderDetail(salesOrderId);
  const poNo = order.order.customerPONo || "";
  const trNo = order.order.salesOrderNo || storedTrNo;
  if (storedPoNo !== poNo || storedTrNo !== trNo) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: `${DELIVERY_RECEIPTS_SHEET}!D${rowNumber}`, values: [[poNo]] },
          { range: `${DELIVERY_RECEIPTS_SHEET}!E${rowNumber}`, values: [[trNo]] },
        ],
      },
    });
  }
  return { poNo, trNo, salesOrderId };
}

/** Updates all linked DR references and overwrites their saved PDFs after a Customer PO change. */
export async function syncSalesOrderDeliveryReferences(salesOrderId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const order = await getOrderDetail(salesOrderId);
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: DELIVERY_RECEIPTS_RANGE });
  const rows = response.data.values ?? [];
  const matches = rows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[18] ?? "").trim() === salesOrderId);
  if (!matches.length) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: matches.flatMap(({ rowNumber }) => [
        { range: `${DELIVERY_RECEIPTS_SHEET}!D${rowNumber}`, values: [[order.order.customerPONo || ""]] },
        { range: `${DELIVERY_RECEIPTS_SHEET}!E${rowNumber}`, values: [[order.order.salesOrderNo || ""]] },
      ]),
    },
  });
  const drive = await getDriveUploadClient();
  for (const { row } of matches) {
    const drNumber = Number(row[0]);
    const link = String(row[11] ?? "").trim();
    const fileId = link.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? link.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    if (!Number.isFinite(drNumber) || !fileId) continue;
    const { pdfBase64 } = await populateAndExportDeliveryReceiptFormPdf(drNumber);
    await drive.files.update({ fileId, media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(pdfBase64, "base64")) } });
  }
  const { regenerateStoredServiceInvoicePdfsForDr } = await import("@/lib/serviceInvoiceSheets");
  for (const { row } of matches) await regenerateStoredServiceInvoicePdfsForDr(Number(row[0]));
}

/**
 * Resolves the internal Delivered By identity stored on a Delivery Receipt.
 * A linked Service Invoice must use this result rather than client-submitted
 * assignee values. Older DR rows may only have a name, so resolve that name
 * only when it identifies exactly one application user.
 */
export async function resolveDeliveryReceiptDeliveredBy(drNumber: number): Promise<{
  deliveredById?: string;
  deliveredByName?: string;
  identityError?: string;
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!A2:S`,
  });
  const row = (response.data.values || []).find(
    (entry) => parseInt(String(entry[0] ?? "").trim(), 10) === drNumber,
  );
  if (!row || String(row[10] ?? "").trim() === "deleted") {
    throw new Error(`Linked Delivery Receipt #${drNumber} was not found.`);
  }

  const deliveredByName = String(row[8] ?? "").trim();
  const deliveredById = String(row[15] ?? "").trim();
  if (deliveredById) {
    const user = await getUserById(deliveredById);
    if (!user?.fullName.trim()) {
      return {
        deliveredByName,
        identityError: `Delivery Receipt #${drNumber} has an invalid Delivered By user. Correct the Delivery Receipt's Delivered By user before finalizing this Service Invoice.`,
      };
    }
    return { deliveredById: user.userId, deliveredByName: user.fullName };
  }
  if (!deliveredByName) {
    return {
      identityError: `Delivery Receipt #${drNumber} has no Delivered By user. Correct the Delivery Receipt's Delivered By user before finalizing this Service Invoice.`,
    };
  }

  const normalizedName = deliveredByName.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const matches = (await getUsers()).filter(
    (user) => user.fullName.replace(/\s+/g, " ").trim().toLocaleLowerCase() === normalizedName,
  );
  if (matches.length === 1) {
    return { deliveredById: matches[0].userId, deliveredByName: matches[0].fullName };
  }
  return {
    deliveredByName,
    identityError: matches.length === 0
      ? `Delivery Receipt #${drNumber}'s Delivered By person is not an active application user. Correct the Delivery Receipt's Delivered By user before finalizing this Service Invoice.`
      : `Delivery Receipt #${drNumber}'s Delivered By name matches multiple active application users. Correct the Delivery Receipt's Delivered By user before finalizing this Service Invoice.`,
  };
}
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
  userId = "",
): Promise<DeliveryReceiptResponse> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. DR Number — either manual override, auto-generate, or negative placeholder for drafts
    let drNumber: number;
    const isDraft = payload.status === "draft";
    // Pending/rejected DRs are held like drafts: placeholder number, no handover, no PDF.
    const isHeld = isHeldDrStatus(payload.status);
    if (!isDraft) {
      if (payload.deliveredByOptionId) {
        const option = (await getDriversFromSheets()).find((entry) => entry.deliveryOptionId === payload.deliveredByOptionId);
        if (!option) throw new Error("Delivered By must be an active delivery option.");
        payload.deliveredBy = option.label;
        payload.deliveredById = option.userId;
        payload.deliveredByType = option.type;
      } else if (payload.deliveredById) {
        const user = await getUserById(payload.deliveredById);
        if (!user) throw new Error("Delivered By must be an active application user.");
        payload.deliveredBy = user.fullName;
      } else {
        const matches = (await getUsers()).filter((user) => user.fullName.trim().toLowerCase() === payload.deliveredBy.trim().toLowerCase());
        if (matches.length === 1) payload.deliveredById = matches[0].userId;
        else throw new Error("Delivered By must be selected from an active application user.");
      }
    }

    if (payload.drNumber) {
      // Validate: must be a positive integer
      if (!Number.isInteger(payload.drNumber) || payload.drNumber <= 0) {
        throw new Error(
          `DR Number must be a positive integer, got "${payload.drNumber}".`,
        );
      }
      // Check for duplicates (only positive numbers are checked)
      const allRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${DELIVERY_RECEIPTS_SHEET}!A2:A`,
      });
      const existingNums = (allRows.data.values || [])
        .map((row) => parseInt(String(row[0] ?? "").trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      if (existingNums.includes(payload.drNumber)) {
        throw new Error(
          `DR #${payload.drNumber} already exists. Please choose a different number.`,
        );
      }
      drNumber = payload.drNumber;
    } else if (isHeld) {
      // Draft without manual number: use negative timestamp placeholder
      // so multiple drafts can coexist without consuming real sequence numbers
      drNumber = -Math.floor(Date.now() / 1000);
    } else {
      drNumber = await generateNextDrNumber(sheets, spreadsheetId);
    }

    // 2. Company details
    const companies = await getCompanies();
    const company = companies.find((c) => c.companyId === payload.companyId);
    if (!company) throw new Error(`Company "${payload.companyId}" not found.`);
    const forError = validateForCompany(companies, payload.companyId, payload.forCompanyId);
    if (forError) throw new Error(forError);
    const forCompany = payload.forCompanyId ? companies.find((c) => c.companyId === payload.forCompanyId) : undefined;
    const companyName = company.companyName;
    const address = company.address || "";
    const tin = company.tin || "";

    // 3. Log ONE header row to DeliveryReceipts sheet (columns A–O)
    const createdAt = new Date().toISOString();
    // Reference: a selected Sales Order, or a manual legacy TR number. The modes
    // are mutually exclusive, so the manual TR number clears the Sales Order link
    // and a selected Sales Order supplies the number written to column E.
    let referenceRow = deliveryReferenceRowValues({
      referenceMode: payload.referenceMode,
      salesOrderId: payload.salesOrderId,
      salesOrderNo: payload.salesOrderNo,
      trNo: payload.trNo,
      noChargeReason: payload.noChargeReason,
      noChargeNote: payload.noChargeNote,
    });
    if (referenceRow.error) throw new Error(referenceRow.error);
    if (payload.referenceMode === "SALES_ORDER" && referenceRow.salesOrderId && !referenceRow.reference) {
      // Safety net for callers that omit the Sales Order number: column E must
      // never stay blank while a Sales Order link is stored.
      const order = await getOrderDetail(referenceRow.salesOrderId);
      referenceRow = { ...referenceRow, reference: order.order.salesOrderNo };
    }
    const headerRow = [
      String(drNumber), // A: DRNumber
      payload.date, // B: DeliveryDate
      payload.companyId, // C: CompanyId
      payload.poNo || "", // D: PONumber
      referenceRow.reference, // E: SalesOrderNo (legacy TRNumber)
      payload.srNo || "", // F: SRNumber
      payload.comments || "", // G: Comments
      payload.preparedBy || "", // H: PreparedBy
      payload.deliveredBy || "", // I: DeliveredBy
      createdAt, // J: CreatedAt
      payload.status || "created", // K: Status
      "", // L: DriveFileLink (populated after PDF save)
      userId, // M: CreatedBy
      userId, // N: UpdatedBy
      createdAt, // O: UpdatedDate
      payload.deliveredById || "", // P: DeliveredById
      payload.deliveredByType || "internal", // Q: DeliveredByType
      payload.deliveredByOptionId || "", // R: DeliveredByOptionId
      referenceRow.salesOrderId, // S: immutable SalesOrderId
    ];

    if (!isHeld) {
      await commitDocumentWithHandover(
        { sheet: "DeliveryReceipts", row: headerRow },
        { documentType: "delivery_receipt", documentNumber: String(drNumber), customerName: companyName,
          assignedToId: payload.deliveredById, assignedToName: payload.deliveredBy,
          assigneeType: payload.deliveredByType || "internal", assignedBy: userId, assignedByName: payload.preparedBy || userId },
      );
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: DELIVERY_RECEIPTS_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headerRow] },
      });
    }

    // 3b. Log item rows to DeliveryReceiptItems sheet
    await replaceDeliveryItems(drNumber, payload.items);

    // 3c. Warehouse and approval stamp (columns T:W)
    await writeInventoryColumns(sheets, spreadsheetId, await findDrRow(sheets, spreadsheetId, drNumber), {
      warehouseId: payload.warehouseId || "",
      approvedBy: payload.approvedBy || "",
      approvedAt: payload.approvedAt || "",
      approvalNote: payload.approvalNote || "",
      requestedStatus: payload.requestedStatus || "",
    });
    if (payload.forCompanyId) {
      await writeForCompanyColumn(sheets, spreadsheetId, await findDrRow(sheets, spreadsheetId, drNumber), payload.forCompanyId);
    }
    if (referenceRow.noChargeReason) {
      await writeNoChargeColumns(sheets, spreadsheetId, await findDrRow(sheets, spreadsheetId, drNumber),
        referenceRow.noChargeReason, referenceRow.noChargeNote ?? "");
    }
    const printedReference = referenceRow.reference || noChargeReasonDisplay(referenceRow.noChargeReason);

    // 4. Populate template and export PDF (skip for drafts and held DRs)
    let pdfBase64: string | undefined;
    let printUrl: string | undefined;

    if (!isHeld) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${PRINT_TEMPLATE_SHEET}!A13:C35`,
      });

      const templateRows = deliveryPrintRows(payload.items);
      const formattedDate = formatDateMMDDYYYY(payload.date);

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [
            { range: `${PRINT_TEMPLATE_SHEET}!F6`, values: [[drNumber]] },
            { range: `${PRINT_TEMPLATE_SHEET}!B9`, values: [[companyName]] },
            { range: `${PRINT_TEMPLATE_SHEET}!B10`, values: [[address]] },
            { range: `${PRINT_TEMPLATE_SHEET}!B11`, values: [[tin]] },
            { range: `${PRINT_TEMPLATE_SHEET}!F9`, values: [[formattedDate]] },
            {
              range: `${PRINT_TEMPLATE_SHEET}!F10`,
              values: [[payload.poNo || ""]],
            },
            {
              range: `${PRINT_TEMPLATE_SHEET}!F11`,
              values: [[payload.salesOrderNo || payload.trNo || printedReference]],
            },
            {
              range: `${PRINT_TEMPLATE_SHEET}!A13:C${12 + templateRows.length}`,
              values: templateRows,
            },
            {
              range: `${PRINT_TEMPLATE_SHEET}!A37`,
              values: [[payload.comments || ""]],
            },
            {
              range: `${PRINT_TEMPLATE_SHEET}!A42`,
              values: [[payload.preparedBy || ""]],
            },
            {
              range: `${PRINT_TEMPLATE_SHEET}!A47`,
              values: [[payload.deliveredBy || ""]],
            },
          ],
        },
      });

      // 5. Export PDF (non-fatal if it fails)
      const gid = await getSheetTabGid(
        sheets,
        spreadsheetId,
        PRINT_TEMPLATE_SHEET,
      );
      printUrl = buildExportUrl(spreadsheetId, gid);
      try {
        pdfBase64 = await fetchExportPdfBase64(printUrl);
      } catch (e) {
        console.warn("PDF export failed (will use print URL fallback):", e);
      }
    }

    return {
      success: true,
      drNumber,
      companyId: payload.companyId,
      forCompanyId: payload.forCompanyId || undefined,
      forCompanyName: forCompany?.companyName,
      forCompanyAddress: forCompany?.address || undefined,
      forCompanyTin: forCompany?.tin || undefined,
      companyName,
      address,
      tin,
      date: payload.date,
      poNo: payload.poNo,
      trNo: referenceRow.reference,
      noChargeReason: referenceRow.noChargeReason || undefined,
      noChargeNote: referenceRow.noChargeNote || undefined,
      salesOrderNo: referenceRow.salesOrderId ? referenceRow.reference : undefined,
      salesOrderId: payload.salesOrderId,
      preparedBy: payload.preparedBy,
      deliveredBy: payload.deliveredBy,
      comments: payload.comments,
      items: payload.items,
      status: payload.status || "created",
      printUrl,
      pdfBase64,
      warehouseId: payload.warehouseId || undefined,
    };
  } catch (error) {
    console.error("Failed to process delivery receipt:", error);
    throw error;
  }
}

/**
 * Finds the exact row number (1-based) in DeliveryReceipts for a given DR number.
 * Returns 0 if not found.
 */
async function findDrRow(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  drNumber: number,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  return (
    rows.findIndex((row) => {
      const val = parseInt(String(row[0] ?? "").trim(), 10);
      return val === drNumber;
    }) + 2
  ); // +2: 0-based findIndex + header row
}


export interface UpdateDeliveryPayload extends Partial<CreateDeliveryPayload> {
  status?: string;
}

/**
 * Updates an existing delivery receipt header and its items.
 */
export async function updateDeliveryReceipt(
  drNumber: number,
  payload: UpdateDeliveryPayload,
  userId = "",
): Promise<DeliveryReceiptSummary> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const drRowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
    if (drRowNumber <= 1) throw new Error(`DR #${drNumber} not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:AA${drRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    // FOR client (column Y): changing the company clears it unless a new one is sent.
    // Only a changed value is validated, so a client later re-pointed elsewhere
    // doesn't block unrelated edits.
    const storedForCompanyId = String(currentRow[24] ?? "").trim();
    const storedCompanyId = String(currentRow[2] ?? "").trim();
    const targetCompanyId = payload.companyId ?? storedCompanyId;
    const companyChanged = targetCompanyId !== storedCompanyId;
    const nextForCompanyId = typeof payload.forCompanyId === "string"
      ? payload.forCompanyId.trim()
      : companyChanged ? "" : storedForCompanyId;
    // A DR's contract releases were matched to its FOR client, so that client is fixed once any exist.
    if (nextForCompanyId !== storedForCompanyId) {
      const { getContractReleases } = await import("@/lib/contractReleaseSheets");
      if ((await getContractReleases()).some((release) => release.drNumber === drNumber)) {
        throw new Error("This DR released contract items, so its FOR client can't change.");
      }
    }
    if (nextForCompanyId && (nextForCompanyId !== storedForCompanyId || companyChanged)) {
      const forError = validateForCompany(await getCompanies(), targetCompanyId, nextForCompanyId);
      if (forError) throw new Error(forError);
    }
    if (payload.deliveredByOptionId) {
      const option = (await getDriversFromSheets()).find((entry) => entry.deliveryOptionId === payload.deliveredByOptionId);
      if (!option) throw new Error("Delivered By must be an active delivery option.");
      payload.deliveredBy = option.label;
      payload.deliveredById = option.userId || "";
      payload.deliveredByType = option.type;
    } else if (payload.deliveredById) {
      const user = await getUserById(payload.deliveredById);
      if (!user) throw new Error("Delivered By must be an active application user.");
      payload.deliveredBy = user.fullName;
      payload.deliveredByType = "internal";
      payload.deliveredByOptionId = "";
    }
    const oldStatus = String(currentRow[10] ?? "created").trim();
    const newStatus = payload.status ?? oldStatus;
    const updatedAt = new Date().toISOString();

    // A draft uses a negative placeholder as its DR number. When it is
    // promoted to a real status (draft -> created/printed/completed), assign
    // a real sequential DR number now so the finalized receipt has one.
    let effectiveDrNumber = drNumber;
    if (drNumber <= 0 && !isHeldDrStatus(newStatus)) {
      effectiveDrNumber = await generateNextDrNumber(sheets, spreadsheetId);
    }

    // Reference: an explicit mode decides columns E and S, so switching modes
    // clears the other value. Without a mode the previous rule is kept (the
    // supplied TR number, else the stored one).
    let referenceRow = deliveryReferenceRowValues(
      {
        referenceMode: payload.referenceMode,
        salesOrderId: payload.salesOrderId,
        salesOrderNo: payload.salesOrderNo,
        trNo: payload.trNo,
        noChargeReason: payload.noChargeReason,
        noChargeNote: payload.noChargeNote,
      },
      {
        trNo: String(currentRow[4] ?? "").trim(),
        salesOrderId: String(currentRow[18] ?? "").trim(),
      },
    );
    if (referenceRow.error) throw new Error(referenceRow.error);
    const storedReference = deliveryReferenceFromRow(currentRow);
    // A DR that already counted against a contract, a Sales Order or an invoice
    // can't become free afterwards; those links must be undone first.
    if (referenceRow.noChargeReason && !storedReference.noChargeReason) {
      const switchError = noChargeSwitchError(await noChargeSwitchBlockers(drNumber, storedReference.salesOrderId));
      if (switchError) throw new Error(switchError);
    }
    if (payload.referenceMode === "SALES_ORDER" && referenceRow.salesOrderId) {
      // Server-resolved number (a browser cannot invent one) plus the same
      // cross-customer guard the create path applies.
      const order = await getOrderDetail(referenceRow.salesOrderId);
      const targetCompanyId = payload.companyId ?? String(currentRow[2] ?? "").trim();
      if (order.order.customerId !== targetCompanyId) {
        throw new Error("The selected Sales Order belongs to a different customer.");
      }
      referenceRow = { ...referenceRow, reference: order.order.salesOrderNo };
    }

    const effectivePoNo = payload.referenceMode === "SALES_ORDER" && referenceRow.salesOrderId
      ? (await getOrderDetail(referenceRow.salesOrderId)).order.customerPONo || ""
      : payload.poNo !== undefined ? payload.poNo : String(currentRow[3] ?? "").trim();


    const updatedRow = [
      String(effectiveDrNumber), // A: DRNumber (assigned when a draft is promoted)
      payload.date ?? String(currentRow[1] ?? "").trim(), // B
      payload.companyId ?? String(currentRow[2] ?? "").trim(), // C
      effectivePoNo, // D: Customer PO from SO, or manual value for a legacy TR
      referenceRow.reference, // E: SalesOrderNo (legacy TRNumber)
      // A legacy payload without a mode keeps the stored reference, which
      // deliveryReferenceRowValues() already resolved into referenceRow above.
      // (column E value is decided by the reference mode, never by a formula)
      String(currentRow[5] ?? "").trim(), // F: SRNumber (preserved)
      payload.comments !== undefined
        ? payload.comments
        : String(currentRow[6] ?? "").trim(), // G
      payload.preparedBy ?? String(currentRow[7] ?? "").trim(), // H
      payload.deliveredBy ?? String(currentRow[8] ?? "").trim(), // I
      String(currentRow[9] ?? "").trim(), // J: CreatedAt (preserved)
      newStatus, // K: Status
      String(currentRow[11] ?? "").trim(), // L: DriveFileLink (preserved)
      String(currentRow[12] ?? "").trim(), // M: CreatedBy (preserved)
      userId || String(currentRow[13] ?? "").trim(), // N: UpdatedBy
      updatedAt, // O: UpdatedDate
      payload.deliveredById ?? String(currentRow[15] ?? "").trim(), // P
      payload.deliveredByType ?? String(currentRow[16] ?? "internal").trim(), // Q
      payload.deliveredByOptionId ?? String(currentRow[17] ?? "").trim(), // R
      referenceRow.salesOrderId, // S: immutable SalesOrderId (cleared for a legacy TR Number)
    ];

    const companies = await getCompanies().catch(() => []);
    const company = companies.find(c => c.companyId === updatedRow[2] || c.id === updatedRow[2]);
    if (!["draft", "pending_approval", "rejected", "deleted", "cancelled", "void"].includes(newStatus)) {
      await commitDocumentWithHandover(
        { sheet: "DeliveryReceipts", row: updatedRow, rowNumber: drRowNumber },
        { documentType: "delivery_receipt", documentNumber: String(effectiveDrNumber), customerName: company?.companyName || updatedRow[2],
          assignedToId: String(updatedRow[15] || ""), assignedToName: String(updatedRow[8] || ""),
          assigneeType: updatedRow[16] === "external" ? "external" : "internal",
          assignedBy: userId, assignedByName: String(updatedRow[7] || userId) },
      );
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:S${drRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [updatedRow] },
      });
    }

    const inventoryColumns = {
      warehouseId: payload.warehouseId ?? String(currentRow[19] ?? "").trim(),
      approvedBy: payload.approvedBy ?? String(currentRow[20] ?? "").trim(),
      approvedAt: payload.approvedAt ?? String(currentRow[21] ?? "").trim(),
      approvalNote: payload.approvalNote ?? String(currentRow[22] ?? "").trim(),
      requestedStatus: payload.requestedStatus ?? String(currentRow[23] ?? "").trim(),
    };
    await writeInventoryColumns(sheets, spreadsheetId, drRowNumber, inventoryColumns);
    if (nextForCompanyId !== storedForCompanyId) {
      await writeForCompanyColumn(sheets, spreadsheetId, drRowNumber, nextForCompanyId);
    }
    if (referenceRow.noChargeReason !== undefined) {
      await writeNoChargeColumns(sheets, spreadsheetId, drRowNumber, referenceRow.noChargeReason, referenceRow.noChargeNote ?? "");
    }
    const nextNoChargeReason = referenceRow.noChargeReason ?? storedReference.noChargeReason;
    const nextNoChargeNote = referenceRow.noChargeNote ?? storedReference.noChargeNote;

    // ── Log status change to DRStatusHistory if status actually changed ──
    if (newStatus !== oldStatus) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: DR_STATUS_HISTORY_RANGE,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[String(effectiveDrNumber), oldStatus, newStatus, userId || "System", updatedAt]],
          },
        });
      } catch (e) {
        console.warn("Failed to log DR status change:", e);
      }
    }

    // If a draft was promoted but items were not included in this update,
    // re-key the existing item rows so they point at the new DR number
    // instead of the negative draft placeholder.
    if (effectiveDrNumber !== drNumber && !payload.items) {
      await renameDeliveryItemReferences(drNumber, effectiveDrNumber);
    }

    // Replace items if provided (the canonical helper clears the DR's rows first)
    if (payload.items) {
      await replaceDeliveryItems(effectiveDrNumber, payload.items);
    }

    return {
      drNumber: effectiveDrNumber,
      date: updatedRow[1],
      companyId: updatedRow[2],
      forCompanyId: nextForCompanyId || undefined,
      noChargeReason: nextNoChargeReason || undefined,
      noChargeNote: nextNoChargeNote || undefined,
      companyName: company?.companyName || updatedRow[2],
      poNo: updatedRow[3],
      trNo: updatedRow[4],
      salesOrderNo: updatedRow[4] || undefined,
      salesOrderId: updatedRow[18] || undefined,
      srNo: updatedRow[5] || undefined,
      comments: updatedRow[6],
      preparedBy: updatedRow[7],
      deliveredBy: updatedRow[8],
      deliveredById: updatedRow[15] || undefined,
      deliveredByType: updatedRow[16] === "external" ? "external" : "internal",
      deliveredByOptionId: updatedRow[17] || undefined,
      createdAt: updatedRow[9],
      status: updatedRow[10],
      driveFileLink: updatedRow[11] || undefined,
      createdBy: updatedRow[12] || undefined,
      updatedBy: updatedRow[13] || undefined,
      updatedAt: updatedRow[14] || undefined,
      warehouseId: inventoryColumns.warehouseId || undefined,
      approvedBy: inventoryColumns.approvedBy || undefined,
      approvedAt: inventoryColumns.approvedAt || undefined,
      approvalNote: inventoryColumns.approvalNote || undefined,
      requestedStatus: inventoryColumns.requestedStatus || undefined,
      items: payload.items || [],
    };
  } catch (error) {
    console.error("Failed to update delivery receipt:", error);
    throw error;
  }
}
/**
 * Soft-deletes a delivery receipt by setting its status to "deleted".
 * Also cancels linked ContractRelease rows and recalculates ContractPeriodSummary.
 * DR number is preserved (no gaps) for BIR compliance.
 */
export async function deleteDeliveryReceipt(drNumber: number, actor: Actor, roleId: number): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const drRowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
    if (drRowNumber <= 1) throw new Error(`DR #${drNumber} not found.`);

    // ── 1. Soft-delete DR: set status to "deleted" (preserve all data) ──
    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:S${drRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const salesOrderId = String(currentRow[18] ?? "").trim();
    if (salesOrderId) {
      const permission = can("so.fulfill", { roleId, actorUserId: actor.userId });
      if (!permission.allowed) throw forbidden(permission.reason || "Sales Order fulfillment permission is required to delete a linked receipt.");
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!K${drRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["deleted"]] },
    });

    // ── 1b. Remove the DR's item rows (canonical DeliveryReceiptItems tab) ──
    if (salesOrderId) {
      // A failed reversal stays retryable from the deleted source before its items are removed.
      const { reverseDeletedDeliveryReleaseFulfillment } = await import("@/lib/deliverySalesOrderIntegration");
      await reverseDeletedDeliveryReleaseFulfillment(drNumber, actor);
    }
    await replaceDeliveryItems(drNumber, []);

    // ── 2. Fetch all ContractReleases linked to this DR ──
    const { getContractReleases } = await import("@/lib/contractReleaseSheets");

    const allReleases = await getContractReleases();
    const linkedReleases = allReleases.filter((r) => r.drNumber === drNumber);

    if (linkedReleases.length > 0) {
      const releasesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "ContractReleases!A2:M",
      });
      const releaseRows = releasesResponse.data.values || [];

      // Soft-delete each linked release: set status to "Cancelled"
      for (const linked of linkedReleases) {
        const rowIdx = releaseRows.findIndex((r) => r[0] === linked.id);
        if (rowIdx >= 0) {
          const row = releaseRows[rowIdx];
          const updated = [...row];
          while (updated.length < 13) updated.push("");
          updated[11] = "Deleted"; // Column L: Status
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `ContractReleases!A${rowIdx + 2}:M${rowIdx + 2}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [updated] },
          });
        }
      }
      // Period status is computed from the release log, so marking the rows
      // Deleted is enough to reopen their periods.
    }
  } catch (error) {
    console.error("Failed to delete delivery receipt:", error);
    throw error;
  }
}
/**
 * Fetches DR data from the database sheets, re-populates the DeliveryReceiptForm
 * template, and exports it as a PDF base64 string.
 * Used by save-pdf endpoint to ensure the template always reflects current DB data.
 */
export async function populateAndExportDeliveryReceiptFormPdf(
  drNumber: number,
): Promise<{
  pdfBase64: string;
  printUrl: string;
}> {
  const { getProducts } = await import("@/lib/productSheets");
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();

  // 1. Find DR header row
  const drRowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
  if (drRowNumber <= 1) throw new Error(`DR #${drNumber} not found.`);

  const drResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:AA${drRowNumber}`,
  });
  const drRow = drResponse.data.values?.[0] || [];
  // A:DRNumber B:DeliveryDate C:CompanyId D:PONumber E:TRNumber F:SRNumber G:Comments H:PreparedBy I:DeliveredBy J:CreatedAt K:Status L:DriveFileLink
  const deliveryDate = String(drRow[1] ?? "").trim();
  const companyId = String(drRow[2] ?? "").trim();
  const poNo = String(drRow[3] ?? "").trim();
  // A no-charge DR prints its reason (e.g. WARRANTY) in the SO / TR cell.
  const trNo = deliveryReferenceFromRow(drRow).displayReference;
  const comments = String(drRow[6] ?? "").trim();
  const preparedBy = String(drRow[7] ?? "").trim();
  const deliveredBy = String(drRow[8] ?? "").trim();

  // 2. Fetch DR items (active only)
  const itemsByDr = await getDeliveryItems();

  // 3. Fetch company details
  const companies = await getCompanies();
  const company = companies.find(
    (c) => c.companyId === companyId || c.id === companyId,
  );
  const companyName = company?.companyName || companyId;
  const address = company?.address || "";
  const tin = company?.tin || "";

  // 4. Fetch products for descriptions
  let products: Array<{ code: string; name: string; description?: string }> =
    [];
  try {
    products = await getProducts().then((rows) =>
      rows.map((p) => ({ code: p.productCode, name: p.productName }))
    );
  } catch {
    // non-fatal
  }
  const productMap = new Map(products.map((p) => [p.code, p]));

  // 5. Clear and populate the DeliveryReceiptForm template
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${PRINT_TEMPLATE_SHEET}!A13:C35`,
  });

  const templateRows = deliveryPrintRows(
    (itemsByDr.get(drNumber) ?? []).map((item) => ({
      ...item,
      description: item.description || productMap.get(item.productCode)?.name || item.productCode,
    })),
  );

  const formattedDate = formatDateMMDDYYYY(deliveryDate);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${PRINT_TEMPLATE_SHEET}!F6`, values: [[drNumber]] },
        { range: `${PRINT_TEMPLATE_SHEET}!B9`, values: [[companyName]] },
        { range: `${PRINT_TEMPLATE_SHEET}!B10`, values: [[address]] },
        { range: `${PRINT_TEMPLATE_SHEET}!B11`, values: [[tin]] },
        { range: `${PRINT_TEMPLATE_SHEET}!F9`, values: [[formattedDate]] },
        { range: `${PRINT_TEMPLATE_SHEET}!F10`, values: [[poNo]] },
        { range: `${PRINT_TEMPLATE_SHEET}!F11`, values: [[trNo]] },
        {
          range: `${PRINT_TEMPLATE_SHEET}!A13:C${12 + templateRows.length}`,
          values: templateRows,
        },
        { range: `${PRINT_TEMPLATE_SHEET}!A37`, values: [[comments]] },
        { range: `${PRINT_TEMPLATE_SHEET}!A42`, values: [[preparedBy]] },
        { range: `${PRINT_TEMPLATE_SHEET}!A47`, values: [[deliveredBy]] },
      ],
    },
  });

  // 6. Export PDF
  const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
  const printUrl = buildExportUrl(spreadsheetId, gid);
  const pdfBase64 = await fetchExportPdfBase64(printUrl);

  return { pdfBase64, printUrl };
}
/**
 * Thin wrapper: exports whatever is currently in the DeliveryReceiptForm tab.
 * Used by the create flow where the template was just populated by processDeliveryReceipt().
 */
export async function exportDeliveryReceiptFormPdf(): Promise<{
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

/** Retrieves status change history for a specific DR or all DRs. */
export async function getDRStatusHistory(
  drNumber?: number,
): Promise<DRStatusEntry[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: DR_STATUS_HISTORY_RANGE,
    });
    const rows = response.data.values || [];
    let entries: DRStatusEntry[] = rows
      .map((row) => ({
        drNumber: parseInt(String(row[0] ?? "").trim(), 10) || 0,
        oldStatus: String(row[1] ?? "").trim(),
        newStatus: String(row[2] ?? "").trim(),
        changedBy: String(row[3] ?? "").trim(),
        changedAt: String(row[4] ?? "").trim(),
      }))
      .filter((e) => e.drNumber > 0);
    if (drNumber) {
      entries = entries.filter((e) => e.drNumber === drNumber);
    }
    return entries;
  } catch {
    // Sheet may not exist yet
    return [];
  }
}

/** Reads one DR's status from the header sheet; null when the DR does not exist. */
export async function getDeliveryReceiptStatus(drNumber: number): Promise<string | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: DELIVERY_RECEIPTS_RANGE });
  const row = (response.data.values ?? []).find((r) => parseInt(String(r[0] ?? "").trim(), 10) === drNumber);
  return row ? String(row[10] ?? "created").trim() || "created" : null;
}

/** The DR's row number, delivery date, company and status, or null when it doesn't exist. */
export async function findDeliveryReceiptForScan(drNumber: number): Promise<{ rowNumber: number; date: string; companyId: string; status: string } | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DELIVERY_RECEIPTS_SHEET}!A2:K` });
  const index = (response.data.values ?? []).findIndex((r) => parseInt(String(r[0] ?? "").trim(), 10) === drNumber);
  if (index < 0) return null;
  const row = response.data.values![index];
  return { rowNumber: index + 2, date: String(row[1] ?? "").trim(), companyId: String(row[2] ?? "").trim(), status: String(row[10] ?? "created").trim() || "created" };
}

const DR_SCAN_HEADERS = ["ScannedFileLink", "ScannedAt", "ScannedBy"];
const DR_SCAN_COLUMN_COUNT = 30; // through AD
/** Set once the columns are confirmed, so a batch checks the sheet only once per server instance. */
let drScanColumnsReady = false;

/**
 * Makes sure DeliveryReceipts is wide enough for the scanned copy columns AB:AD
 * and that they carry their headers. Runs before a scan is uploaded so a sheet
 * problem can't leave an orphaned Drive file. Idempotent.
 */
export async function ensureDeliveryReceiptScanColumns(): Promise<void> {
  if (drScanColumnsReady) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, ranges: [DELIVERY_RECEIPTS_SHEET], fields: "sheets.properties(sheetId,title,gridProperties.columnCount)" });
  const tab = metadata.data.sheets?.find((entry) => entry.properties?.title === DELIVERY_RECEIPTS_SHEET)?.properties;
  if (tab?.sheetId == null) throw new Error("DeliveryReceipts tab was not found.");
  if ((tab.gridProperties?.columnCount ?? 0) < DR_SCAN_COLUMN_COUNT) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: tab.sheetId, gridProperties: { columnCount: DR_SCAN_COLUMN_COUNT } }, fields: "gridProperties.columnCount" } }] } });
  }
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${DELIVERY_RECEIPTS_SHEET}!AB1:AD1` });
  const headers = (response.data.values?.[0] || []).map((value) => String(value ?? "").trim());
  if (!DR_SCAN_HEADERS.every((header, i) => headers[i] === header)) {
    if (headers.some(Boolean)) throw new Error("DeliveryReceipts columns AB:AD are already in use; scanned copies cannot be saved.");
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${DELIVERY_RECEIPTS_SHEET}!AB1:AD1`, valueInputOption: "RAW", requestBody: { values: [DR_SCAN_HEADERS] } });
  }
  drScanColumnsReady = true;
}

/** Stores the scanned copy link and who scanned it (columns AB:AD). */
export async function recordDeliveryReceiptScan(rowNumber: number, fileLink: string, userId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DELIVERY_RECEIPTS_SHEET}!AB${rowNumber}:AD${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[fileLink, new Date().toISOString(), userId]] },
  });
}

/**
 * A signed scan completes an issued DR: created/printed → completed, logged in the
 * status history. Stock is unaffected (all three are counted statuses).
 */
export async function completeDeliveryReceiptFromScan(drNumber: number, rowNumber: number, oldStatus: string, userId: string): Promise<boolean> {
  if (!drCompletesOnScan(oldStatus)) return false;
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const updatedAt = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${DELIVERY_RECEIPTS_SHEET}!K${rowNumber}`, values: [["completed"]] },
        { range: `${DELIVERY_RECEIPTS_SHEET}!N${rowNumber}:O${rowNumber}`, values: [[userId, updatedAt]] },
      ],
    },
  });
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: DR_STATUS_HISTORY_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(drNumber), oldStatus, "completed", userId, updatedAt]] },
    });
  } catch (e) {
    console.warn("Failed to log DR status change:", e);
  }
  return true;
}
