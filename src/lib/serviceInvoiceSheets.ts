import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
} from "@/lib/googleSheets";
import { getCustomers, getCompanies } from "@/lib/companySheets";
import {
  CreateServiceInvoicePayload,
  ServiceInvoiceResponse,
  ServiceInvoiceSummary,
  ServiceInvoiceItem,
} from "@/types/serviceInvoice";

const SERVICE_INVOICES_SHEET = "ServiceInvoices";
const SERVICE_INVOICES_RANGE = `${SERVICE_INVOICES_SHEET}!A2:L`;
// A:InvoiceNo B:Date C:CustomerId D:PreparedBy E:CreatedBy F:CreatedAt G:UpdatedBy H:UpdatedAt I:Status J:DriveFileLink K:ContractId L:DRNo

const SERVICE_INVOICE_ITEMS_SHEET = "ServiceInvoiceItems";
const SERVICE_INVOICE_ITEMS_RANGE = `${SERVICE_INVOICE_ITEMS_SHEET}!A2:E`;
// A:InvoiceNo B:Description C:Qty D:UnitPrice E:Amount

const PRINT_TEMPLATE_SHEET = "ServiceInvoiceForm";
// Template cells (ServiceInvoiceForm):
//   CustomerName -> B5:E5 (write to anchor cell B5)
//   TIN          -> B6
//   Address      -> B7
//   Date         -> B2:F2 (write to anchor cell B2)
//   Items        -> rows 10-28 (B=Description, C=Qty, D=UnitPrice, E=Amount [formula/calculated])
//   PreparedBy   -> A35 (write to anchor cell A35)
const TEMPLATE_ITEM_START_ROW = 10;
const TEMPLATE_ITEM_END_ROW = 28;

// Invoice numbers typed from the physical paper are numeric. When a draft
// (DRAFT-*) is promoted to a real status, the next sequential number is
// generated from the highest existing numeric invoice number.
const SI_SEQUENCE_BASE = 1000;

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
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: SERVICE_INVOICE_ITEMS_RANGE,
  });
  const rows = response.data.values || [];
  const result: Array<{ rowNumber: number; rowData: string[] }> = [];
  rows.forEach((row, idx) => {
    if (String(row[0] ?? "").trim() === String(invoiceNo).trim()) {
      result.push({ rowNumber: idx + 2, rowData: row });
    }
  });
  return result;
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
      sheets.spreadsheets.values
        .get({
          spreadsheetId,
          range: SERVICE_INVOICE_ITEMS_RANGE,
        })
        .catch(() => ({ data: { values: [] as any[][] } })),
    ]);

    const invRows = invResponse.data.values;
    if (!invRows || invRows.length === 0) return [];

    const itemRows = itemsResponse.data.values || [];
    const itemsByInvoice = new Map<string, ServiceInvoiceItem[]>();
    for (const itemRow of itemRows) {
      const invoiceNo = String(itemRow[0] ?? "").trim();
      if (!invoiceNo) continue;
      const item: ServiceInvoiceItem = {
        description: String(itemRow[1] ?? "").trim(),
        quantity: parseFloat(String(itemRow[2] ?? "0")) || 0,
        unitPrice: parseFloat(String(itemRow[3] ?? "0")) || 0,
        amount: parseFloat(String(itemRow[4] ?? "0")) || 0,
      };
      if (!itemsByInvoice.has(invoiceNo)) itemsByInvoice.set(invoiceNo, []);
      itemsByInvoice.get(invoiceNo)!.push(item);
    }

    const companies = await getCompanies().catch(() => []);

    return invRows
      .map((row) => {
        const invoiceNo = String(row[0] ?? "").trim();
        if (!invoiceNo) return null;
        const status = String(row[8] ?? "created").trim() || "created";
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
          status,
          driveFileLink: String(row[9] ?? "").trim() || undefined,
          contractId: String(row[10] ?? "").trim() || undefined,
          drNumber: row[11]
            ? parseInt(String(row[11]), 10) || undefined
            : undefined,
          items: itemsByInvoice.get(invoiceNo) || [],
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
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    items: ServiceInvoiceItem[];
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
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: SERVICE_INVOICES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headerRow] },
    });

    const itemRows = payload.items.map((item) => [
      invoiceNo,
      normalizeDescription(item.description),
      item.quantity,
      item.unitPrice,
      (item.quantity || 0) * (item.unitPrice || 0),
    ]);
    if (itemRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: SERVICE_INVOICE_ITEMS_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: itemRows },
      });
    }

    let pdfBase64: string | undefined;
    let printUrl: string | undefined;

    if (payload.status !== "draft") {
      const preparedByDisplay = await resolvePreparedByTitle(
        userId,
        payload.preparedBy || "",
      );
      await populateServiceInvoiceTemplate(sheets, spreadsheetId, {
        companyName,
        address,
        tin,
        date: payload.date,
        preparedBy: preparedByDisplay,
        items: payload.items,
      });

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
      invoiceNo,
      companyName,
      address,
      tin,
      date: payload.date,
      preparedBy: payload.preparedBy || "",
      items: payload.items,
      status: payload.status || "created",
      printUrl,
      pdfBase64,
      contractId: payload.contractId,
      drNumber: payload.drNumber,
    };
  } catch (error) {
    console.error("Failed to process service invoice:", error);
    throw error;
  }
}

export interface UpdateServiceInvoicePayload extends Partial<CreateServiceInvoicePayload> {
  status?: string;
}

/** Updates an existing service invoice header and its items. */
export async function updateServiceInvoice(
  invoiceNo: string,
  payload: UpdateServiceInvoicePayload,
  userId = "",
): Promise<ServiceInvoiceSummary> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = await findInvoiceRow(sheets, spreadsheetId, invoiceNo);
    if (rowNumber <= 1) throw new Error(`Invoice "${invoiceNo}" not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:L${rowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const oldStatus = String(currentRow[8] ?? "created").trim();
    const newStatus = payload.status ?? oldStatus;
    const updatedAt = new Date().toISOString();

    // A draft uses a DRAFT-* placeholder as its invoice number. When it is
    // promoted to a real status (draft -> created/paid/etc.), assign a new
    // sequential invoice number now so the finalized invoice has one.
    let effectiveInvoiceNo = invoiceNo;
    if (invoiceNo.startsWith("DRAFT-") && newStatus !== "draft") {
      effectiveInvoiceNo = await generateNextInvoiceNo(sheets, spreadsheetId);
    }

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
        ? String(payload.drNumber)
        : String(currentRow[11] ?? "").trim(),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:L${rowNumber}`,
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
      if (existingItemRows.length > 0) {
        await sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          requestBody: {
            ranges: existingItemRows.map(
              (r) =>
                `${SERVICE_INVOICE_ITEMS_SHEET}!A${r.rowNumber}:E${r.rowNumber}`,
            ),
          },
        });
      }

      const itemRows = payload.items.map((item) => [
        effectiveInvoiceNo,
        normalizeDescription(item.description),
        item.quantity,
        item.unitPrice,
        (item.quantity || 0) * (item.unitPrice || 0),
      ]);
      if (itemRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: SERVICE_INVOICE_ITEMS_RANGE,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: itemRows },
        });
      }
    }

    const companies = await getCompanies().catch(() => []);
    const company = companies.find(
      (c) => c.companyId === updatedRow[2] || c.id === updatedRow[2],
    );
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
      driveFileLink: String(updatedRow[9] ?? "").trim() || undefined,
      contractId: String(updatedRow[10] ?? "").trim() || undefined,
      drNumber: updatedRow[11]
        ? parseInt(String(updatedRow[11]), 10) || undefined
        : undefined,
      items: payload.items || [],
    };
  } catch (error) {
    console.error("Failed to update service invoice:", error);
    throw error;
  }
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
      range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:J${rowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const updatedRow = [...currentRow];
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
  const items: ServiceInvoiceItem[] = itemRowsData.map(({ rowData }) => ({
    description: String(rowData[1] ?? "").trim(),
    quantity: parseFloat(String(rowData[2] ?? "0")) || 0,
    unitPrice: parseFloat(String(rowData[3] ?? "0")) || 0,
    amount: parseFloat(String(rowData[4] ?? "0")) || 0,
  }));

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
    items,
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
