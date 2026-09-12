import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
} from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import {
  CreatePurchaseOrderPayload,
  PurchaseOrderResponse,
  PurchaseOrderSummary,
  PurchaseOrderItem,
  POStatusEntry,
} from "@/types/purchaseOrder";
import { getPurchaseOrderItemsV2, renamePurchaseOrderItemReferencesV2, replacePurchaseOrderItemsV2 } from "@/lib/transactionItemV2Sheets";
import { getSupplierProductsV2 } from "@/lib/supplierProductV2Sheets";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";

async function validateCatalogItemsForSupplier(items: PurchaseOrderItem[], supplierId: string): Promise<void> {
  const catalogItems = items.filter((item) => item.supplierProductId);
  if (!catalogItems.length) return;
  const offerings = await getSupplierProductsV2({ supplierId, status: "active" });
  for (const item of catalogItems) {
    const offering = offerings.find((entry) => entry.supplierProductId === item.supplierProductId);
    if (!offering) throw new Error(`Supplier product "${item.supplierProductId}" is not active for supplier "${supplierId}".`);
    if (item.productId && item.productId !== offering.productId) throw new Error(`Supplier product "${item.supplierProductId}" does not match product "${item.productId}".`);
  }
}

const PURCHASE_ORDERS_SHEET = "PurchaseOrders";
const PURCHASE_ORDERS_RANGE = `${PURCHASE_ORDERS_SHEET}!A2:Q`;
// A:PONumber(B:string) B:Date C:SupplierId D:PRNumber E:DeliveryDate
// F:PaymentTerms G:Comments H:PreparedBy I:ApprovedBy J:NotedBy K:TotalAmount
// L:Status M:DriveFileLink N:CreatedAt O:CreatedBy P:UpdatedBy Q:UpdatedAt

const PURCHASE_ORDER_ITEMS_SHEET = "PurchaseOrderItems";
const PURCHASE_ORDER_ITEMS_RANGE = `${PURCHASE_ORDER_ITEMS_SHEET}!A2:G`;
// A:PurchaseOrderId(B:string) B:ItemNo C:Description D:Quantity E:Unit F:PricePerUnit G:TotalAmount

const PO_STATUS_HISTORY_SHEET = "PurchaseOrderStatusHistory";
const PO_STATUS_HISTORY_RANGE = `${PO_STATUS_HISTORY_SHEET}!A2:E`;
// A:PONumber B:OldStatus C:NewStatus D:ChangedBy E:ChangedAt

const PRINT_TEMPLATE_SHEET = "PurchaseOrderForm";
const PO_NUMBER_PATTERN = /^AIC-PO-(\d{4})-(\d{4})$/;
export class PurchaseOrderNumberConflictError extends Error {}

function businessDateYear(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A valid PO business date is required to finalize a purchase order.");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("A valid PO business date is required to finalize a purchase order.");
  return date.slice(0, 4);
}

function normalizeManualPONumber(value: string, date: string): string {
  const normalized = value.trim().toUpperCase(); const match = normalized.match(PO_NUMBER_PATTERN);
  if (!match || Number(match[2]) < 1) throw new Error("PO number must use the format AIC-PO-YYYY-NNNN (0001 through 9999).");
  if (match[1] !== businessDateYear(date)) throw new Error("The PO number year must match the PO business-date year.");
  return normalized;
}

function formatDateMMMMDDYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

async function generateNextPONumber(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  date: string,
): Promise<string> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PURCHASE_ORDERS_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  const year = businessDateYear(date); let max = 0;
  rows.forEach((row) => {
    const raw = String(row[0] ?? "").trim();
    const match = raw.match(PO_NUMBER_PATTERN);
    if (match?.[1] === year) max = Math.max(max, Number(match[2]));
  });
  if (max >= 9999) throw new Error(`PO number sequence for ${year} is exhausted.`);
  return `AIC-PO-${year}-${String(max + 1).padStart(4, "0")}`;
}

async function assertPONumberAvailable(sheets: Awaited<ReturnType<typeof getSheetsClient>>, spreadsheetId: string, poNumber: string): Promise<void> {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PURCHASE_ORDERS_SHEET}!A2:A` });
  if ((response.data.values || []).some((row) => String(row[0] ?? "").trim() === poNumber)) throw new PurchaseOrderNumberConflictError(`PO #${poNumber} already exists.`);
}

async function findPORow(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  poNumber: string,
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PURCHASE_ORDERS_SHEET}!A2:A`,
  });
  const rows = response.data.values || [];
  return (
    rows.findIndex((row) => {
      const val = String(row[0] ?? "").trim();
      return val === poNumber;
    }) + 2
  );
}

async function findPOItemRows(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  poNumber: string,
): Promise<Array<{ rowNumber: number; rowData: string[] }>> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PURCHASE_ORDER_ITEMS_RANGE,
  });
  const rows = response.data.values || [];
  const result: Array<{ rowNumber: number; rowData: string[] }> = [];
  rows.forEach((row, idx) => {
    const poId = String(row[0] ?? "").trim();
    if (poId === poNumber) {
      result.push({ rowNumber: idx + 2, rowData: row });
    }
  });
  return result;
}

export async function getPurchaseOrders(): Promise<PurchaseOrderSummary[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const [poResponse, itemsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: PURCHASE_ORDERS_RANGE,
      }),
      sheets.spreadsheets.values
        .get({
          spreadsheetId,
          range: PURCHASE_ORDER_ITEMS_RANGE,
        })
        .catch(() => ({ data: { values: [] as any[][] } })),
    ]);

    const poRows = poResponse.data.values;
    if (!poRows || poRows.length === 0) return [];

    const itemRows = itemsResponse.data.values || [];

    // Group items by PO number
    const itemsByPO = new Map<string, PurchaseOrderItem[]>();
    for (const itemRow of itemRows) {
      const poId = String(itemRow[0] ?? "").trim();
      if (!poId) continue;
      const item: PurchaseOrderItem = {
        purchaseOrderId: poId,
        itemNo: parseInt(String(itemRow[1] ?? "0"), 10) || 0,
        description: String(itemRow[2] ?? "").trim(),
        quantity: parseInt(String(itemRow[3] ?? "0"), 10) || 0,
        unit: String(itemRow[4] ?? "").trim(),
        pricePerUnit: parseFloat(String(itemRow[5] ?? "0")) || 0,
        totalAmount: parseFloat(String(itemRow[6] ?? "0")) || 0,
      };
      if (!itemsByPO.has(poId)) itemsByPO.set(poId, []);
      itemsByPO.get(poId)!.push(item);
    }
    const v2Items = await getPurchaseOrderItemsV2();
    for (const [poNumber, items] of v2Items) itemsByPO.set(poNumber, items);

    const suppliers = await getCompanies().catch(() => []);

    return poRows
      .map((row) => {
        const poNumber = String(row[0] ?? "").trim();
        if (!poNumber) return null;

        const totalAmount = parseFloat(String(row[10] ?? "0")) || 0;

        return {
          poNumber,
          date: String(row[1] ?? "").trim(),
          supplierId: String(row[2] ?? "").trim(),
          prNumber: String(row[3] ?? "").trim() || undefined,
          deliveryDate: String(row[4] ?? "").trim() || undefined,
          paymentTerms: String(row[5] ?? "").trim() || undefined,
          comments: String(row[6] ?? "").trim() || undefined,
          preparedBy: String(row[7] ?? "").trim(),
          approvedBy: String(row[8] ?? "").trim() || undefined,
          notedBy: String(row[9] ?? "").trim() || undefined,
          totalAmount,
          status: String(row[11] ?? "created").trim() || "created",
          driveFileLink: String(row[12] ?? "").trim() || undefined,
          shipToType: String(row[13] ?? "").trim() as "company" | "warehouse" || undefined,
          shipToId: String(row[14] ?? "").trim() || undefined,
          shipToName: String(row[15] ?? "").trim() || undefined,
          shipToAddress: String(row[16] ?? "").trim() || undefined,
          shipToContact: String(row[17] ?? "").trim() || undefined,
          createdAt: String(row[18] ?? "").trim(),
          createdBy: String(row[19] ?? "").trim() || undefined,
          updatedBy: String(row[20] ?? "").trim() || undefined,
          updatedDate: String(row[21] ?? "").trim() || undefined,
          items: itemsByPO.get(poNumber) || [],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map((data) => {
        const supplier = suppliers.find(
          (s) => s.companyId === data.supplierId || s.id === data.supplierId,
        );
        return {
          ...data,
          supplierName: supplier?.companyName || data.supplierId,
        } as PurchaseOrderSummary;
      })
      .sort((a, b) => {
        return b.poNumber.localeCompare(a.poNumber, undefined, { numeric: true });
      });
  } catch (error) {
    console.error("Failed to fetch purchase orders:", error);
    throw error;
  }
}

export async function processPurchaseOrder(
  payload: CreatePurchaseOrderPayload,
  userId = "",
  options: { allowManualNumber?: boolean } = {},
): Promise<PurchaseOrderResponse> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    let poNumber: string;
    const isDraft = payload.status === "draft";

    if (isDraft) {
      poNumber = `DRAFT-${Math.floor(Date.now() / 1000)}`;
    } else {
      if (payload.poNumberMode === "manual") {
        if (!options.allowManualNumber) throw new Error("Forbidden. Admin access is required to enter a PO number manually.");
        if (!payload.poNumber?.trim()) throw new Error("A manual PO number is required.");
        poNumber = normalizeManualPONumber(payload.poNumber, payload.date);
      } else {
        poNumber = await generateNextPONumber(sheets, spreadsheetId, payload.date);
      }
      // Sheets appends are not transactional; recheck immediately before writing.
      await assertPONumberAvailable(sheets, spreadsheetId, poNumber);
    }

    const suppliers = await getCompanies();
    const supplier = suppliers.find((s) => s.companyId === payload.supplierId);
    if (!supplier)
      throw new Error(`Supplier "${payload.supplierId}" not found.`);
    await validateCatalogItemsForSupplier(payload.items, payload.supplierId);
    const supplierName = supplier.companyName;
    const address = supplier.address || "";
    const tin = supplier.tin || "";

    // Calculate total amount
    const totalAmount = payload.items.reduce((sum, item) => {
      const total = item.quantity * (item.pricePerUnit || 0);
      return sum + total;
    }, 0);

    const createdAt = new Date().toISOString();
    const headerRow = [
      poNumber, // A: PONumber
      payload.date, // B: Date
      payload.supplierId, // C: SupplierId
      payload.prNumber || "", // D: PRNumber
      payload.deliveryDate || "", // E: DeliveryDate
      payload.paymentTerms || "", // F: PaymentTerms
      payload.comments || "", // G: Comments
      payload.preparedBy || "", // H: PreparedBy
      payload.approvedBy || "", // I: ApprovedBy
      payload.notedBy || "", // J: NotedBy
      String(totalAmount), // K: TotalAmount
      payload.status || "created", // L: Status
      "", // M: DriveFileLink
      payload.shipToType || "", payload.shipToId || "", payload.shipToName || "", payload.shipToAddress || "", payload.shipToContact || "",
      createdAt, userId, userId, createdAt,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: PURCHASE_ORDERS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headerRow] },
    });

    await replacePurchaseOrderItemsV2(poNumber, payload.items);


    return {
      success: true,
      poNumber,
      supplierName,
      address,
      tin,
      date: payload.date,
      prNumber: payload.prNumber,
      preparedBy: payload.preparedBy,
      approvedBy: payload.approvedBy,
      notedBy: payload.notedBy,
      comments: payload.comments,
      items: payload.items,
      status: payload.status || "created",
      totalAmount,
    };
  } catch (error) {
    console.error("Failed to process purchase order:", error);
    throw error;
  }
}

export async function updatePurchaseOrder(
  poNumber: string,
  payload: Partial<CreatePurchaseOrderPayload> & { status?: string },
  userId = "",
  options: { allowManualNumber?: boolean } = {},
): Promise<PurchaseOrderSummary> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const poRowNumber = await findPORow(sheets, spreadsheetId, poNumber);
    if (poRowNumber <= 1) throw new Error(`PO #${poNumber} not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:V${poRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const oldStatus = String(currentRow[11] ?? "created").trim();
    const newStatus = payload.status ?? oldStatus;
    if (!poNumber.startsWith("DRAFT-") && (payload.poNumberMode === "manual" || payload.poNumber)) {
      throw new Error("Finalized purchase orders cannot be renumbered.");
    }
    const updatedAt = new Date().toISOString();

    let effectivePONumber = poNumber;
    const isFinalizingDraft = poNumber.startsWith("DRAFT-") && newStatus !== "draft";
    if (isFinalizingDraft) {
      const effectiveDate = payload.date ?? String(currentRow[1] ?? "").trim();
      if (payload.poNumberMode === "manual") {
        if (!options.allowManualNumber) throw new Error("Forbidden. Admin access is required to enter a PO number manually.");
        if (!payload.poNumber?.trim()) throw new Error("A manual PO number is required.");
        effectivePONumber = normalizeManualPONumber(payload.poNumber, effectiveDate);
      } else effectivePONumber = await generateNextPONumber(sheets, spreadsheetId, effectiveDate);
      await assertPONumberAvailable(sheets, spreadsheetId, effectivePONumber);
    }

    const totalAmount = payload.items
      ? payload.items.reduce(
          (sum, item) => sum + item.quantity * (item.pricePerUnit || 0),
          0,
        )
      : parseFloat(String(currentRow[10] ?? "0")) || 0;

    const updatedRow = [
      String(effectivePONumber), // A
      payload.date ?? String(currentRow[1] ?? "").trim(), // B
      payload.supplierId ?? String(currentRow[2] ?? "").trim(), // C
      payload.prNumber !== undefined
        ? payload.prNumber
        : String(currentRow[3] ?? "").trim(), // D
      payload.deliveryDate !== undefined
        ? payload.deliveryDate
        : String(currentRow[4] ?? "").trim(), // E
      payload.paymentTerms !== undefined
        ? payload.paymentTerms
        : String(currentRow[5] ?? "").trim(), // F
      payload.comments !== undefined
        ? payload.comments
        : String(currentRow[6] ?? "").trim(), // G
      payload.preparedBy ?? String(currentRow[7] ?? "").trim(), // H
      payload.approvedBy !== undefined
        ? payload.approvedBy
        : String(currentRow[8] ?? "").trim(), // I
      payload.notedBy !== undefined
        ? payload.notedBy
        : String(currentRow[9] ?? "").trim(), // J
      String(totalAmount), // K
      newStatus, // L
      String(currentRow[12] ?? "").trim(), // M: DriveFileLink
      payload.shipToType ?? String(currentRow[13] ?? "").trim(),
      payload.shipToId ?? String(currentRow[14] ?? "").trim(),
      payload.shipToName ?? String(currentRow[15] ?? "").trim(),
      payload.shipToAddress ?? String(currentRow[16] ?? "").trim(),
      payload.shipToContact ?? String(currentRow[17] ?? "").trim(),
      String(currentRow[18] ?? "").trim(), String(currentRow[19] ?? "").trim(),
      userId || String(currentRow[20] ?? "").trim(), updatedAt,
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:Q${poRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    if (isFinalizingDraft) {
      try {
        const [legacyItems, history] = await Promise.all([
          findPOItemRows(sheets, spreadsheetId, poNumber),
          sheets.spreadsheets.values.get({ spreadsheetId, range: PO_STATUS_HISTORY_RANGE }).catch(() => ({ data: { values: [] } })),
        ]);
        const historyUpdates = (history.data.values || []).map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[0] ?? "").trim() === poNumber);
        const data = [
          ...legacyItems.map(({ rowNumber }) => ({ range: `${PURCHASE_ORDER_ITEMS_SHEET}!A${rowNumber}`, values: [[effectivePONumber]] })),
          ...historyUpdates.map(({ rowNumber }) => ({ range: `${PO_STATUS_HISTORY_SHEET}!A${rowNumber}`, values: [[effectivePONumber]] })),
        ];
        if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
        await renamePurchaseOrderItemReferencesV2(poNumber, effectivePONumber);
      } catch (error) {
        throw new Error(`PO was finalized as ${effectivePONumber}, but not all child references were updated: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    if (newStatus !== oldStatus) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: PO_STATUS_HISTORY_RANGE,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                String(effectivePONumber),
                oldStatus,
                newStatus,
                userId || "System",
                updatedAt,
              ],
            ],
          },
        });
      } catch (e) {
        console.warn("Failed to log PO status change:", e);
      }
    }

    if (effectivePONumber !== poNumber && !payload.items && !isFinalizingDraft) {
      const orphanItemRows = await findPOItemRows(
        sheets,
        spreadsheetId,
        poNumber,
      );
      if (orphanItemRows.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: orphanItemRows.map((r) => ({
              range: `${PURCHASE_ORDER_ITEMS_SHEET}!A${r.rowNumber}`,
              values: [[String(effectivePONumber)]],
            })),
          },
        });
      }
    }

    if (payload.items) {
      const existingItemRows = await findPOItemRows(
        sheets,
        spreadsheetId,
        poNumber,
      );
      if (existingItemRows.length > 0) await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: PURCHASE_ORDER_ITEMS_SHEET, columnCount: 7, existingRows: existingItemRows, values: [] });

      await replacePurchaseOrderItemsV2(String(effectivePONumber), payload.items);
    }

    const suppliers = await getCompanies().catch(() => []);
    const supplier = suppliers.find(
      (s) => s.companyId === updatedRow[2] || s.id === updatedRow[2],
    );

    return {
      poNumber: effectivePONumber,
      date: updatedRow[1],
      supplierId: updatedRow[2],
      supplierName: supplier?.companyName || updatedRow[2],
      prNumber: updatedRow[3] || undefined,
      deliveryDate: updatedRow[4] || undefined,
      paymentTerms: updatedRow[5] || undefined,
      comments: updatedRow[6] || undefined,
      preparedBy: updatedRow[7],
      approvedBy: updatedRow[8] || undefined,
      notedBy: updatedRow[9] || undefined,
      totalAmount: parseFloat(updatedRow[10]) || 0,
      status: updatedRow[11],
      driveFileLink: updatedRow[12] || undefined,
      shipToType: updatedRow[13] as "company" | "warehouse" || undefined,
      shipToId: updatedRow[14] || undefined, shipToName: updatedRow[15] || undefined,
      shipToAddress: updatedRow[16] || undefined, shipToContact: updatedRow[17] || undefined,
      createdAt: updatedRow[18], createdBy: updatedRow[19] || undefined,
      updatedBy: updatedRow[20] || undefined, updatedDate: updatedRow[21] || undefined,
      items: payload.items || [],
    };
  } catch (error) {
    console.error("Failed to update purchase order:", error);
    throw error;
  }
}

export async function deletePurchaseOrder(poNumber: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const poRowNumber = await findPORow(sheets, spreadsheetId, poNumber);
    if (poRowNumber <= 1) throw new Error(`PO #${poNumber} not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:Q${poRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const updatedRow = [...currentRow];
    while (updatedRow.length < 17) updatedRow.push("");
    updatedRow[11] = "deleted"; // Column L: Status

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:Q${poRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });
  } catch (error) {
    console.error("Failed to delete purchase order:", error);
    throw error;
  }
}

export async function populateAndExportPurchaseOrderFormPdf(
  poNumber: string,
): Promise<{
  pdfBase64: string;
  printUrl: string;
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();

  const poRowNumber = await findPORow(sheets, spreadsheetId, poNumber);
  if (poRowNumber <= 1) throw new Error(`PO #${poNumber} not found.`);

  const poResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:Q${poRowNumber}`,
  });
  const poRow = poResponse.data.values?.[0] || [];

  const date = String(poRow[1] ?? "").trim();
  const supplierId = String(poRow[2] ?? "").trim();
  const comments = String(poRow[6] ?? "").trim();
  const preparedBy = String(poRow[7] ?? "").trim();
  const approvedBy = String(poRow[8] ?? "").trim();
  const notedBy = String(poRow[9] ?? "").trim();
  const totalAmount = parseFloat(String(poRow[10] ?? "0")) || 0;

  const itemRowsData = await findPOItemRows(sheets, spreadsheetId, poNumber);

  const suppliers = await getCompanies();
  const supplier = suppliers.find(
    (s) => s.companyId === supplierId || s.id === supplierId,
  );
  const supplierName = supplier?.companyName || supplierId;
  const address = supplier?.address || "";
  const tin = supplier?.tin || "";

  // Clear existing items rows
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${PRINT_TEMPLATE_SHEET}!A15:H52`,
  });

  const templateRows = itemRowsData.map(({ rowData }) => [
    parseInt(String(rowData[1] ?? "0"), 10) || 0,
    String(rowData[2] ?? "").trim(),
    parseInt(String(rowData[3] ?? "0"), 10) || 0,
    String(rowData[4] ?? "").trim(),
    parseFloat(String(rowData[5] ?? "0")) || 0,
    parseFloat(String(rowData[6] ?? "0")) || 0,
  ]);

  const formattedDate = formatDateMMMMDDYYYY(date);

  const batchData: Array<{ range: string; values: any[][] }> = [
    { range: `${PRINT_TEMPLATE_SHEET}!H6`, values: [[formattedDate]] },
    { range: `${PRINT_TEMPLATE_SHEET}!H7`, values: [[poNumber]] },
    { range: `${PRINT_TEMPLATE_SHEET}!A9`, values: [[supplierName]] },
    { range: `${PRINT_TEMPLATE_SHEET}!A10`, values: [[address]] },
    { range: `${PRINT_TEMPLATE_SHEET}!A11`, values: [[tin]] },
  ];

  const itemStartRow = 15;
  templateRows.forEach((row, idx) => {
    const rowNum = itemStartRow + idx;
    if (rowNum <= 52) {
      batchData.push(
        { range: `${PRINT_TEMPLATE_SHEET}!A${rowNum}`, values: [[row[0]]] },
        {
          range: `${PRINT_TEMPLATE_SHEET}!B${rowNum}:D${rowNum}`,
          values: [[row[1]]],
        },
        { range: `${PRINT_TEMPLATE_SHEET}!E${rowNum}`, values: [[row[2]]] },
        { range: `${PRINT_TEMPLATE_SHEET}!F${rowNum}`, values: [[row[3]]] },
        { range: `${PRINT_TEMPLATE_SHEET}!G${rowNum}`, values: [[row[4]]] },
        { range: `${PRINT_TEMPLATE_SHEET}!H${rowNum}`, values: [[row[5]]] },
      );
    }
  });

  batchData.push(
    { range: `${PRINT_TEMPLATE_SHEET}!H53`, values: [[totalAmount]] },
    { range: `${PRINT_TEMPLATE_SHEET}!B55:D57`, values: [[comments]] },
    { range: `${PRINT_TEMPLATE_SHEET}!C60`, values: [[preparedBy]] },
    { range: `${PRINT_TEMPLATE_SHEET}!G60`, values: [[approvedBy]] },
    { range: `${PRINT_TEMPLATE_SHEET}!C63`, values: [[notedBy]] },
  );

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: batchData,
    },
  });

  const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
  const printUrl = buildExportUrl(spreadsheetId, gid);
  const pdfBase64 = await fetchExportPdfBase64(printUrl);

  return { pdfBase64, printUrl };
}

export async function exportPurchaseOrderFormPdf(): Promise<{
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

export async function getPOStatusHistory(
  poNumber?: string,
): Promise<POStatusEntry[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: PO_STATUS_HISTORY_RANGE,
    });
    const rows = response.data.values || [];
    let entries: POStatusEntry[] = rows
      .map((row) => ({
        poNumber: String(row[0] ?? "").trim(),
        oldStatus: String(row[1] ?? "").trim(),
        newStatus: String(row[2] ?? "").trim(),
        changedBy: String(row[3] ?? "").trim(),
        changedAt: String(row[4] ?? "").trim(),
      }))
      .filter((e) => e.poNumber);
    if (poNumber) {
      entries = entries.filter((e) => e.poNumber === poNumber);
    }
    return entries;
  } catch {
    return [];
  }
}
