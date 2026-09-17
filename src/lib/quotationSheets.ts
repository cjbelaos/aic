import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getSheetsAndDriveClient,
} from "@/lib/googleSheets";
import {
  Quotation,
  CreateQuotationPayload,
  QuotationStatus,
  QuotationDetail,
  QuotationNotation,
} from "@/types/quotation";
import { Readable } from "stream";
import { replaceChildRowsInPlace } from "@/lib/sheetChildRows";

const QUOTATIONS_SHEET = "Quotations";
const QUOTATION_DETAILS_SHEET = "QuotationDetails";
const QUOTATION_NOTATIONS_SHEET = "QuotationNotations";

const RANGE_QUOTATIONS = `${QUOTATIONS_SHEET}!A2:P`;
const RANGE_DETAILS = `${QUOTATION_DETAILS_SHEET}!A2:L`;
const RANGE_NOTATIONS = `${QUOTATION_NOTATIONS_SHEET}!A2:B`;

const DETAILS_COL_COUNT = 12;
const NOTATIONS_COL_COUNT = 2;

// ──────────────── Shared helpers ────────────────

async function fetchAllSheetData(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
  });
  const valueRanges = response.data.valueRanges || [];
  return {
    quotRows: valueRanges[0]?.values || [],
    detailRows: valueRanges[1]?.values || [],
    notationRows: valueRanges[2]?.values || [],
  };
}

function findQuotationIndex(rows: string[][], quotationNo: string): number {
  return rows.findIndex(
    (r) => String(r[0] || "").trim() === String(quotationNo).trim(),
  );
}

function parseAudit(row: readonly unknown[], offset: number) {
  return { createdBy: String(row[offset] ?? ""), createdAt: String(row[offset + 1] ?? ""), updatedBy: String(row[offset + 2] ?? ""), updatedAt: String(row[offset + 3] ?? "") };
}

function auditValues(actor: string, timestamp: string, existing?: readonly unknown[], offset = 0) {
  return [existing ? String(existing[offset] ?? "") : actor, existing ? String(existing[offset + 1] ?? "") : timestamp, actor, timestamp];
}

function parseDetailRow(row: readonly unknown[]): QuotationDetail {
  return {
    quotationNo: String(row[0] ?? "").trim(),
    productId: String(row[1] ?? "") || undefined,
    productCodeSnapshot: String(row[2] ?? "") || undefined,
    description: String(row[3] ?? ""),
    quantity: Number(row[4]) || 0,
    unit: String(row[5] ?? ""),
    unitPrice: Number(row[6]) || 0,
    customerId: String(row[7] ?? "") || undefined,
    ...parseAudit(row, 8),
  };
}

function detailRow(quotationNo: string, item: QuotationDetail, customerId?: string) {
  return [quotationNo, item.productId || "", item.productCodeSnapshot || "", item.description || "", item.quantity ?? 0, item.unit || "", item.unitPrice ?? 0, customerId || item.customerId || ""];
}

function aggregateDetailRows(detailRows: readonly (readonly unknown[])[], quotationNo: string): QuotationDetail[] {
  return detailRows.filter(row => String(row[0] ?? "").trim() === quotationNo.trim()).map(parseDetailRow);
}

function aggregateNotationRows(
  notationRows: string[][],
  quotationNo: string,
): QuotationNotation[] {
  const notation: QuotationNotation[] = [];
  notationRows.forEach((nRow) => {
    if (String(nRow[0] || "").trim() === String(quotationNo).trim()) {
      const text = String(nRow[1] || "").trim();
      if (text) {
        notation.push({
          quotationNo: String(nRow[0] || "").trim(),
          notation: text,
        });
      }
    }
  });
  return notation;
}

function parseQuotationRow(
  row: string[],
  index: number,
  detailsMap: Map<string, QuotationDetail[]>,
  notationsMap: Map<string, QuotationNotation[]>,
): Quotation {
  const quotationNo = String(row[0] || "").trim();
  return {
    id: `quot_${index + 2}`,
    quotationNo,
    customer: String(row[1] || ""),
    customerId: detailsMap.get(quotationNo)?.[0]?.customerId,
    description: String(row[2] || ""),
    amount: parseFloat(String(row[3])) || 0,
    discount: parseFloat(String(row[4])) || 0,
    shippingFee: Number(row[5]) || 0,
    ...parseAudit(row, 12),
    file: String(row[6] || ""),
    date: String(row[7] || ""),
    preparedBy: String(row[8] || ""),
    approvedBy: String(row[9] || ""),
    sentBy: String(row[10] || ""),
    status: (String(row[11] || "").trim() as QuotationStatus) || "DRAFT",
    items: detailsMap.get(quotationNo) || [],
    notation: notationsMap.get(quotationNo) || [],
    terms: "",
    delivery: "",
    warranty: "",
  };
}

function buildDetailAndNotationMaps(
  detailRows: string[][],
  notationRows: string[][],
) {
  const detailsMap = new Map<string, QuotationDetail[]>();
  detailRows.forEach((row) => {
    const quotationNo = String(row[0] || "").trim();
    if (!quotationNo) return;
    if (!detailsMap.has(quotationNo)) detailsMap.set(quotationNo, []);
    detailsMap.get(quotationNo)!.push(parseDetailRow(row));
  });

  const notationsMap = new Map<string, QuotationNotation[]>();
  notationRows.forEach((row) => {
    const quotationNo = String(row[0] || "").trim();
    const text = String(row[1] || "").trim();
    if (!quotationNo || !text) return;
    if (!notationsMap.has(quotationNo)) notationsMap.set(quotationNo, []);
    notationsMap.get(quotationNo)!.push({ quotationNo, notation: text });
  });

  return { detailsMap, notationsMap };
}

function buildQuotationRow(
  row: string[],
  quotationNo: string,
  targetIndex: number,
  items: QuotationDetail[],
  notation: QuotationNotation[],
): Quotation {
  return {
    id: `quot_${targetIndex + 2}`,
    quotationNo,
    customer: String(row[1] || ""),
    customerId: items[0]?.customerId,
    description: String(row[2] || ""),
    amount: parseFloat(String(row[3])) || 0,
    discount: parseFloat(String(row[4])) || 0,
    shippingFee: Number(row[5]) || 0,
    ...parseAudit(row, 12),
    file: String(row[6] || ""),
    date: String(row[7] || ""),
    preparedBy: String(row[8] || ""),
    approvedBy: String(row[9] || ""),
    sentBy: String(row[10] || ""),
    status: (String(row[11] || "").trim() as QuotationStatus) || "DRAFT",
    items,
    notation,
    terms: "",
    delivery: "",
    warranty: "",
  };
}

// ──────────────── Public API ────────────────

export async function getQuotations(): Promise<Quotation[]> {
  try {
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const { quotRows, detailRows, notationRows } =
      await fetchAllSheetData(spreadsheetId);
    if (quotRows.length === 0) return [];

    const { detailsMap, notationsMap } = buildDetailAndNotationMaps(
      detailRows,
      notationRows,
    );

    return quotRows.map((row, index) => parseQuotationRow(row, index, detailsMap, notationsMap));
  } catch (error) {
    console.error("Failed to fetch quotations:", error);
    throw error;
  }
}

export async function getQuotationsByDate(
  dateStr: string,
): Promise<Quotation[]> {
  try {
    const all = await getQuotations();
    return all.filter((q) => q.date === dateStr);
  } catch (error) {
    console.error(`Failed to fetch quotations for date ${dateStr}:`, error);
    throw error;
  }
}

export async function getQuotationByRefNo(
  quotationNo: string,
): Promise<Quotation | null> {
  try {
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const { quotRows, detailRows, notationRows } =
      await fetchAllSheetData(spreadsheetId);

    const idx = findQuotationIndex(quotRows, quotationNo);
    if (idx === -1) return null;

    const row = quotRows[idx];
    const items = aggregateDetailRows(detailRows, quotationNo);
    const notation = aggregateNotationRows(notationRows, quotationNo);

    return buildQuotationRow(row, quotationNo, idx, items, notation);
  } catch (error) {
    console.error(`Failed to fetch quotation ${quotationNo}:`, error);
    throw error;
  }
}

export async function addQuotation(
  payload: CreateQuotationPayload,
  actor: string,
): Promise<Quotation> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const { quotRows } = await fetchAllSheetData(spreadsheetId);
    const nextIndex = quotRows.length + 2;
    const timestamp = new Date().toISOString();
    const audit = auditValues(actor, timestamp);

    const headerValues = [
      payload.quotationNo || "",
      payload.customer || "",
      payload.description || "",
      payload.amount ?? 0,
      payload.discount ?? 0,
      payload.shippingFee || 0,
      payload.file || "",
      payload.date || "",
      payload.preparedBy || "",
      payload.approvedBy || "",
      payload.sentBy || "",
      payload.status || "DRAFT",
      ...audit,
    ];

    const detailValues = (payload.items || []).map(item => [...detailRow(payload.quotationNo, item, payload.customerId), ...audit]);

    const notationValues = (payload.notation || []).map(
      (note: QuotationNotation) => [payload.quotationNo, note.notation || ""],
    );

    const writes = [
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${QUOTATIONS_SHEET}!A${nextIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headerValues] },
      }),
    ];

    if (detailValues.length > 0) {
      writes.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: RANGE_DETAILS,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: detailValues },
        }),
      );
    }

    if (notationValues.length > 0) {
      writes.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${QUOTATION_NOTATIONS_SHEET}!A${nextIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: notationValues },
        }),
      );
    }

    await Promise.all(writes);

    return {
      id: `quot_${nextIndex}`,
      quotationNo: payload.quotationNo,
      customer: payload.customer,
      customerId: payload.customerId,
      description: payload.description,
      amount: payload.amount,
      discount: payload.discount,
      shippingFee: payload.shippingFee || 0,
      file: payload.file,
      date: payload.date,
      preparedBy: payload.preparedBy,
      approvedBy: payload.approvedBy,
      sentBy: payload.sentBy,
      status: payload.status || "DRAFT",
      items: aggregateDetailRows(detailValues, payload.quotationNo),
      ...parseAudit(headerValues, 12),
      notation: payload.notation || [],
      terms: payload.terms || "",
      delivery: payload.delivery || "",
      warranty: payload.warranty || "",
    };
  } catch (error) {
    console.error("Failed to add quotation:", error);
    throw error;
  }
}

export async function updateQuotationStatus(
  quotationNo: string,
  newStatus: QuotationStatus,
  actor: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_QUOTATIONS,
    });

    const quotRows = response.data.values || [];
    const idx = findQuotationIndex(quotRows, quotationNo);
    if (idx === -1) {
      throw new Error(`Quotation ${quotationNo} not found.`);
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: [
        { range: `${QUOTATIONS_SHEET}!L${idx + 2}`, values: [[newStatus]] },
        { range: `${QUOTATIONS_SHEET}!O${idx + 2}:P${idx + 2}`, values: [[actor, new Date().toISOString()]] },
      ] },
    });
  } catch (error) {
    console.error(`Failed to update status for ${quotationNo}:`, error);
    throw error;
  }
}

export async function deleteQuotationByRefNo(
  quotationNo: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const [valueResp, metaResp] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
      }),
      sheets.spreadsheets.get({ spreadsheetId }),
    ]);

    const sheetMap = new Map<string, number>();
    metaResp.data.sheets?.forEach((sheet) => {
      if (sheet.properties?.title && sheet.properties.sheetId != null) {
        sheetMap.set(sheet.properties.title, sheet.properties.sheetId);
      }
    });

    const vr = valueResp.data.valueRanges || [];
    const quotRows = vr[0]?.values || [];
    const detailRows = vr[1]?.values || [];
    const notationRows = vr[2]?.values || [];

    const quotIdx = findQuotationIndex(quotRows, quotationNo);
    if (quotIdx === -1) return;

    const collectRowNums = (rows: string[][]) => {
      const nums: number[] = [];
      rows.forEach((r, i) => {
        if (String(r[0] || "").trim() === quotationNo.trim()) nums.push(i + 2);
      });
      return nums;
    };

    const requests: any[] = [];
    const addDeleteReq = (sheetName: string, rowNums: number[]) => {
      const sheetId = sheetMap.get(sheetName);
      if (sheetId === undefined || rowNums.length === 0) return;
      rowNums
        .sort((a, b) => b - a)
        .forEach((rn) => {
          requests.push({
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rn - 1,
                endIndex: rn,
              },
            },
          });
        });
    };

    addDeleteReq(QUOTATIONS_SHEET, [quotIdx + 2]);
    addDeleteReq(QUOTATION_DETAILS_SHEET, collectRowNums(detailRows));
    addDeleteReq(QUOTATION_NOTATIONS_SHEET, collectRowNums(notationRows));

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }
  } catch (error) {
    console.error(`Failed to delete quotation ${quotationNo}:`, error);
    throw error;
  }
}

export async function updateQuotation(
  quotationNo: string,
  payload: CreateQuotationPayload,
  actor: string,
): Promise<Quotation> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const { quotRows, detailRows, notationRows } =
      await fetchAllSheetData(spreadsheetId);

    const quotIdx = findQuotationIndex(quotRows, quotationNo);
    if (quotIdx === -1) {
      throw new Error(`Quotation ${quotationNo} not found.`);
    }
    const quotRowNum = quotIdx + 2;
    const timestamp = new Date().toISOString();
    const audit = auditValues(actor, timestamp, quotRows[quotIdx], 12);

    // 1. Update main row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${QUOTATIONS_SHEET}!A${quotRowNum}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            payload.quotationNo || quotationNo,
            payload.customer || "",
            payload.description || "",
            payload.amount ?? 0,
            payload.discount ?? 0,
            payload.shippingFee || 0,
            payload.file || "",
            payload.date || "",
            payload.preparedBy || "",
            payload.approvedBy || "",
            payload.sentBy || "",
            payload.status || "DRAFT",
            ...audit,
          ],
        ],
      },
    });

    // 2. Update matched child rows in place, append extras, then delete only surplus rows.
    const matchingDetails = detailRows.filter(row => String(row[0] ?? "").trim() === quotationNo.trim());
    const newDetailValues = (payload.items || []).map((item, index) => [
      ...detailRow(payload.quotationNo || quotationNo, item, payload.customerId),
      ...auditValues(actor, timestamp, matchingDetails[index], 8),
    ]);

    const newNotationValues = (payload.notation || []).map(
      (note: QuotationNotation) => [
        payload.quotationNo || quotationNo,
        note.notation || "",
      ],
    );
    const details = detailRows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[0] || "").trim() === quotationNo.trim());
    const notations = notationRows.map((row, index) => ({ row, rowNumber: index + 2 })).filter(({ row }) => String(row[0] || "").trim() === quotationNo.trim());
    await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: QUOTATION_DETAILS_SHEET, columnCount: DETAILS_COL_COUNT, existingRows: details, values: newDetailValues });
    await replaceChildRowsInPlace({ sheets, spreadsheetId, sheetName: QUOTATION_NOTATIONS_SHEET, columnCount: NOTATIONS_COL_COUNT, existingRows: notations, values: newNotationValues });
    const items = aggregateDetailRows(newDetailValues, payload.quotationNo || quotationNo);
    const notation = aggregateNotationRows(
      newNotationValues as any,
      quotationNo,
    );

    return {
      id: `quot_${quotRowNum}`,
      quotationNo: payload.quotationNo || quotationNo,
      customer: payload.customer,
      customerId: payload.customerId || items[0]?.customerId,
      description: payload.description,
      amount: payload.amount,
      discount: payload.discount,
      shippingFee: payload.shippingFee || 0,
      file: payload.file,
      date: payload.date,
      preparedBy: payload.preparedBy,
      approvedBy: payload.approvedBy,
      sentBy: payload.sentBy,
      status: payload.status || "DRAFT",
      items,
      ...parseAudit(audit, 0),
      notation,
      terms: payload.terms || "",
      delivery: payload.delivery || "",
      warranty: payload.warranty || "",
    };
  } catch (error) {
    console.error(`Failed to update quotation ${quotationNo}:`, error);
    throw error;
  }
}

export async function uploadPdfToDrive(params: {
  pdfBuffer: Buffer;
  clientName: string;
  quotationDescription: string;
  quotationNo: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const { drive } = await getSheetsAndDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID environment variable.");
  }

  const backupTitle = `Quotation - ${params.clientName} - ${params.quotationDescription}.pdf`;

  const uploadedFile = await drive.files.create({
    requestBody: {
      name: backupTitle,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(params.pdfBuffer),
    },
    fields: "id, webViewLink",
  });

  try {
    await drive.permissions.create({
      fileId: uploadedFile.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (permError) {
    console.warn(
      "Could not set public read permission on Drive file:",
      permError,
    );
  }

  return {
    fileId: uploadedFile.data.id || "",
    webViewLink: uploadedFile.data.webViewLink || "",
  };
}

export async function saveQuotationData(params: {
  clientName: string;
  customerId?: string;
  quotationDescription: string;
  grandTotal: number;
  discount: number;
  shippingFee?: number;
  quotationNo: string;
  preparedByName: string;
  approvedBy?: string;
  sentByName?: string;
  fileUrl?: string;
  status: "DRAFT" | "SENT";
  items: Array<{
    productId?: string;
    productCodeSnapshot?: string;
    description: string;
    qty: number;
    unit: string;
    priceUnit: number;
  }>;
  notations: string[];
  dateIssued?: string;
  validUntil?: string;
  terms?: string;
  delivery?: string;
  warranty?: string;
}, actor: string): Promise<{ refNumber: string; date: string }> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const date = params.dateIssued || new Date().toISOString().split("T")[0];
    const refNumber =
      params.quotationNo || `Q-${Date.now().toString().slice(-8)}`;

    const timestamp = new Date().toISOString();
    const audit = auditValues(actor, timestamp);
    const logRow = [
      refNumber,
      params.clientName,
      params.quotationDescription,
      params.grandTotal || 0,
      params.discount || 0,
      params.shippingFee || 0,
      params.fileUrl || "",
      date,
      params.preparedByName,
      params.approvedBy ||
        (params.status === "SENT" ? "Von Jeric Carmona" : ""),
      params.sentByName ||
        (params.status === "SENT" ? params.preparedByName : ""),
      params.status,
      ...audit,
    ];

    const writes = [
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: RANGE_QUOTATIONS,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [logRow] },
      }),
    ];

    const detailValues = (params.items || []).map(item => [...detailRow(refNumber, {
      quotationNo: refNumber, productId: item.productId, productCodeSnapshot: item.productCodeSnapshot,
      description: item.description, quantity: item.qty, unit: item.unit, unitPrice: item.priceUnit,
    }, params.customerId), ...audit]);

    if (detailValues.length > 0) {
      writes.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: RANGE_DETAILS,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: detailValues },
        }),
      );
    }

    const notationValues = (params.notations || []).map((note) => [
      refNumber,
      note || "",
    ]);

    if (notationValues.length > 0) {
      writes.push(
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${QUOTATION_NOTATIONS_SHEET}!A2:B`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: notationValues },
        }),
      );
    }

    await Promise.all(writes);

    return { refNumber, date };
  } catch (error) {
    console.error("Failed to save quotation data:", error);
    throw error;
  }
}
