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

const QUOTATIONS_SHEET = "Quotations";
const QUOTATION_DETAILS_SHEET = "QuotationDetails";
const QUOTATION_NOTATIONS_SHEET = "QuotationNotations";

// Updated ranges to match actual sheet structure
// Quotations: A=QuotationNo, B=Customer, C=Description, D=Amount, E=Discount, F=File, G=Date, H=PreparedBy, I=ApprovedBy, J=SentBy
const RANGE_QUOTATIONS = `${QUOTATIONS_SHEET}!A2:K`;
const RANGE_DETAILS = `${QUOTATION_DETAILS_SHEET}!A2:E`;
const RANGE_NOTATIONS = `${QUOTATION_NOTATIONS_SHEET}!A2:B`;

const QUOTATIONS_COL_COUNT = 11; // A-J: 10 columns
const DETAILS_COL_COUNT = 5; // A-E: 5 columns
const NOTATIONS_COL_COUNT = 2; // A-B: 2 columns

/**
 * Parse a quotation row from the sheet into a Quotation object.
 * Columns: A=QuotationNo, B=Customer, C=Description, D=Amount, E=Discount, F=File, G=Date, H=PreparedBy, I=ApprovedBy, J=SentBy, K=Status
 */
function parseQuotationRow(
  row: string[],
  index: number,
  detailsMap: Map<string, QuotationDetail[]>,
  notationsMap: Map<string, QuotationNotation[]>,
): Quotation {
  const quotationNo = String(row[0] || "").trim();
  const status = (String(row[10] || "").trim() as QuotationStatus) || "DRAFT";
  return {
    id: `quot_${index + 2}`,
    quotationNo: quotationNo,
    customer: String(row[1] || ""),
    description: String(row[2] || ""),
    amount: parseFloat(String(row[3])) || 0,
    discount: parseFloat(String(row[4])) || 0,
    file: String(row[5] || ""),
    date: String(row[6] || ""),
    preparedBy: String(row[7] || ""),
    approvedBy: String(row[8] || ""),
    sentBy: String(row[9] || ""),
    status: status,
    items: detailsMap.get(quotationNo) || [],
    notation: notationsMap.get(quotationNo) || [],
    terms: "",
    delivery: "",
    warranty: "",
  };
}

/**
 * Build detail items map and notations map from sheet rows.
 */
function buildDetailAndNotationMaps(
  detailRows: string[][],
  notationRows: string[][],
): {
  detailsMap: Map<string, QuotationDetail[]>;
  notationsMap: Map<string, QuotationNotation[]>;
} {
  const detailsMap = new Map<string, QuotationDetail[]>();
  detailRows.forEach((row) => {
    const quotationNo = String(row[0] || "").trim();
    if (!quotationNo) return;
    if (!detailsMap.has(quotationNo)) detailsMap.set(quotationNo, []);
    detailsMap.get(quotationNo)!.push({
      quotationNo: quotationNo,
      description: String(row[1] || ""),
      quantity: parseInt(String(row[2]), 10) || 0,
      unit: String(row[3] || ""),
      unitPrice: parseFloat(String(row[4])) || 0,
    });
  });

  const notationsMap = new Map<string, QuotationNotation[]>();
  notationRows.forEach((row) => {
    const quotationNo = String(row[0] || "").trim();
    const text = String(row[1] || "").trim();
    if (!quotationNo || !text) return;
    if (!notationsMap.has(quotationNo)) notationsMap.set(quotationNo, []);
    notationsMap.get(quotationNo)!.push({
      quotationNo: quotationNo,
      notation: text,
    });
  });

  return { detailsMap, notationsMap };
}

export async function getQuotations(): Promise<Quotation[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
    });

    const valueRanges = response.data.valueRanges || [];
    const quotRows = valueRanges[0]?.values || [];
    const detailRows = valueRanges[1]?.values || [];
    const notationRows = valueRanges[2]?.values || [];

    if (quotRows.length === 0) return [];

    const { detailsMap, notationsMap } = buildDetailAndNotationMaps(
      detailRows,
      notationRows,
    );

    return quotRows.map(
      (row, index): Quotation =>
        parseQuotationRow(row, index, detailsMap, notationsMap),
    );
  } catch (error) {
    console.error("Failed to fetch quotations from Google Sheets:", error);
    throw error;
  }
}

/**
 * Get all quotations for a specific date.
 */
export async function getQuotationsByDate(
  dateStr: string,
): Promise<Quotation[]> {
  try {
    const allQuotations = await getQuotations();
    return allQuotations.filter((q) => q.date === dateStr);
  } catch (error) {
    console.error(`Failed to fetch quotations for date ${dateStr}:`, error);
    throw error;
  }
}

/**
 * Generate the next sequential quotation number:
 * Format: Q-YYYYMMDD-XXX (e.g., Q-20260715-001)
 */
export async function generateQuotationNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
  const prefix = `Q-${dateStr}`;

  const allQuotations = await getQuotations();
  const todayQuotations = allQuotations.filter((q) => {
    return q.quotationNo && q.quotationNo.startsWith(prefix);
  });

  const sequence = String(todayQuotations.length + 1).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

/**
 * Fetch a single quotation by its quotationNo, aggregating data from all three sheets.
 */
export async function getQuotationByRefNo(
  quotationNo: string,
): Promise<Quotation | null> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
    });

    const valueRanges = response.data.valueRanges || [];
    const quotRows = valueRanges[0]?.values || [];
    const detailRows = valueRanges[1]?.values || [];
    const notationRows = valueRanges[2]?.values || [];

    // Find the main quotation row (QuotationNo is in column A, index 0)
    const targetIndex = quotRows.findIndex(
      (row) => String(row[0] || "").trim() === String(quotationNo).trim(),
    );
    if (targetIndex === -1) return null;

    const row = quotRows[targetIndex];

    // Aggregate details
    const items: QuotationDetail[] = [];
    detailRows.forEach((dRow) => {
      if (String(dRow[0] || "").trim() === String(quotationNo).trim()) {
        items.push({
          quotationNo: String(dRow[0] || "").trim(),
          description: String(dRow[1] || ""),
          quantity: parseInt(String(dRow[2]), 10) || 0,
          unit: String(dRow[3] || ""),
          unitPrice: parseFloat(String(dRow[4])) || 0,
        });
      }
    });

    // Aggregate notations
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

    return {
      id: `quot_${targetIndex + 2}`,
      quotationNo: String(row[0] || ""),
      customer: String(row[1] || ""),
      description: String(row[2] || ""),
      amount: parseFloat(String(row[3])) || 0,
      discount: parseFloat(String(row[4])) || 0,
      file: String(row[5] || ""),
      date: String(row[6] || ""),
      preparedBy: String(row[7] || ""),
      approvedBy: String(row[8] || ""),
      sentBy: String(row[9] || ""),
      status: (String(row[10] || "").trim() as QuotationStatus) || "DRAFT", // Add status parsing
      items,
      notation,
      terms: "",
      delivery: "",
      warranty: "",
    };
  } catch (error) {
    console.error(
      `Failed to fetch quotation quotationNo=${quotationNo}:`,
      error,
    );
    throw error;
  }
}

export async function addQuotation(
  payload: CreateQuotationPayload,
): Promise<Quotation> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const currentQuots = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_QUOTATIONS,
    });
    const nextIndex = (currentQuots.data.values || []).length + 2;

    // Correct order: QuotationNo, Customer, Description, Amount, Discount, File, Date, PreparedBy, ApprovedBy, SentBy, Status
    const headerValues = [
      payload.quotationNo || "",
      payload.customer || "",
      payload.description || "",
      payload.amount ?? 0,
      payload.discount ?? 0,
      payload.file || "",
      payload.date || "",
      payload.preparedBy || "",
      payload.approvedBy || "",
      payload.sentBy || "",
      payload.status || "DRAFT",
    ];

    const detailValues = (payload.items || []).map((item) => [
      payload.quotationNo,
      item.description || "",
      item.quantity ?? 0,
      item.unit || "",
      item.unitPrice ?? 0,
    ]);

    const notationValues = (payload.notation || []).map(
      (note: QuotationNotation) => [payload.quotationNo, note.notation || ""],
    );

    const dataToWrite = [
      { range: `${QUOTATIONS_SHEET}!A${nextIndex}`, values: [headerValues] },
    ];

    if (detailValues.length > 0) {
      dataToWrite.push({
        range: `${QUOTATION_DETAILS_SHEET}!A${nextIndex}`,
        values: detailValues,
      });
    }
    if (notationValues.length > 0) {
      dataToWrite.push({
        range: `${QUOTATION_NOTATIONS_SHEET}!A${nextIndex}`,
        values: notationValues,
      });
    }

    await Promise.all(
      dataToWrite.map((item) =>
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: item.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: item.values },
        }),
      ),
    );

    return {
      id: `quot_${nextIndex}`,
      quotationNo: payload.quotationNo,
      customer: payload.customer,
      description: payload.description,
      amount: payload.amount,
      discount: payload.discount,
      file: payload.file,
      date: payload.date,
      preparedBy: payload.preparedBy,
      approvedBy: payload.approvedBy,
      sentBy: payload.sentBy,
      status: payload.status || "DRAFT",
      items: payload.items || [],
      notation: payload.notation || [],
      terms: payload.terms || "",
      delivery: payload.delivery || "",
      warranty: payload.warranty || "",
    };
  } catch (error) {
    console.error(`Failed to create quotation rows in Google Sheets:`, error);
    throw error;
  }
}

/**
 * Update only the status field of a quotation by quotationNo.
 * Note: Since Status column doesn't exist in your sheet, this function may not be needed,
 * but keeping it for compatibility.
 */
export async function updateQuotationStatus(
  quotationNo: string,
  newStatus: QuotationStatus,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE_QUOTATIONS,
    });

    const quotRows = response.data.values || [];
    const quotIndex = quotRows.findIndex(
      (row) => String(row[0] || "").trim() === String(quotationNo).trim(),
    );
    if (quotIndex === -1) {
      throw new Error(
        `Quotation quotationNo=${quotationNo} not found for status update.`,
      );
    }

    const quotRowNum = quotIndex + 2; // +2 for header row + 0-based index

    // Update column K (status) - you need to add this column to your sheet
    // If you don't have a Status column, you'll need to add it
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${QUOTATIONS_SHEET}!K${quotRowNum}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newStatus]],
      },
    });
  } catch (error) {
    console.error(
      `Failed to update status for quotationNo=${quotationNo}:`,
      error,
    );
    throw error;
  }
}

/**
 * Delete a quotation by quotationNo from all three sheets.
 * Removes the main row, all detail rows, and all notation rows matching the quotationNo.
 */
export async function deleteQuotationByRefNo(
  quotationNo: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Fetch data and spreadsheet metadata (to map sheet names to sheetIds)
    const [response, spreadsheetMeta] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
      }),
      sheets.spreadsheets.get({ spreadsheetId }),
    ]);

    // Map sheet titles to their respective numerical sheetIds
    const sheetMap = new Map<string, number>();
    spreadsheetMeta.data.sheets?.forEach((sheet) => {
      if (
        sheet.properties?.title &&
        sheet.properties.sheetId !== undefined &&
        sheet.properties.sheetId !== null
      ) {
        sheetMap.set(sheet.properties.title, sheet.properties.sheetId);
      }
    });

    const valueRanges = response.data.valueRanges || [];
    const quotRows = valueRanges[0]?.values || [];
    const detailRows = valueRanges[1]?.values || [];
    const notationRows = valueRanges[2]?.values || [];

    // Find main quotation row index (QuotationNo is in column A, index 0)
    const quotIndex = quotRows.findIndex(
      (row) => String(row[0] || "").trim() === String(quotationNo).trim(),
    );
    if (quotIndex === -1) return; // Nothing to delete

    const quotRowNum = quotIndex + 2; // +2 for header row + 0-based index

    // Find detail row numbers to delete
    const detailRowNums: number[] = [];
    detailRows.forEach((row, idx) => {
      if (String(row[0] || "").trim() === String(quotationNo).trim()) {
        detailRowNums.push(idx + 2);
      }
    });

    // Find notation row numbers to delete
    const notationRowNums: number[] = [];
    notationRows.forEach((row, idx) => {
      if (String(row[0] || "").trim() === String(quotationNo).trim()) {
        notationRowNums.push(idx + 2);
      }
    });

    // 2. Prepare the structural row-deletion requests
    const requests: any[] = [];

    const prepareDeleteRequests = (sheetName: string, rowNums: number[]) => {
      const sheetId = sheetMap.get(sheetName);
      if (sheetId === undefined || rowNums.length === 0) return;

      // Sort descending so we delete from bottom-up within the same sheet
      const sorted = [...rowNums].sort((a, b) => b - a);

      for (const rowNum of sorted) {
        requests.push({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNum - 1, // 0-based index inclusive
              endIndex: rowNum, // 0-based index exclusive (deletes 1 row)
            },
          },
        });
      }
    };

    prepareDeleteRequests(QUOTATIONS_SHEET, [quotRowNum]);
    prepareDeleteRequests(QUOTATION_DETAILS_SHEET, detailRowNums);
    prepareDeleteRequests(QUOTATION_NOTATIONS_SHEET, notationRowNums);

    // 3. Execute all structural deletions in a single atomic batch operation
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }
  } catch (error) {
    console.error(
      `Failed to delete quotation quotationNo=${quotationNo}:`,
      error,
    );
    throw error;
  }
}

/**
 * Update an existing quotation's metadata row in the Quotations sheet.
 */
export async function updateQuotation(
  quotationNo: string,
  payload: CreateQuotationPayload,
): Promise<Quotation> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [RANGE_QUOTATIONS, RANGE_DETAILS, RANGE_NOTATIONS],
    });

    const valueRanges = response.data.valueRanges || [];
    const quotRows = valueRanges[0]?.values || [];
    const detailRows = valueRanges[1]?.values || [];
    const notationRows = valueRanges[2]?.values || [];

    // Find main quotation row index (QuotationNo is in column A, index 0)
    const quotIndex = quotRows.findIndex(
      (row) => String(row[0] || "").trim() === String(quotationNo).trim(),
    );
    if (quotIndex === -1) {
      throw new Error(
        `Quotation quotationNo=${quotationNo} not found for update.`,
      );
    }
    const quotRowNum = quotIndex + 2;

    // 1. Update main row - Correct order: QuotationNo, Customer, Description, Amount, Discount, File, Date, PreparedBy, ApprovedBy, SentBy
    const updatedHeaderValues = [
      payload.quotationNo || quotationNo,
      payload.customer || "",
      payload.description || "",
      payload.amount ?? 0,
      payload.discount ?? 0,
      payload.file || "",
      payload.date || "",
      payload.preparedBy || "",
      payload.approvedBy || "",
      payload.sentBy || "",
      payload.status || "DRAFT",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${QUOTATIONS_SHEET}!A${quotRowNum}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [updatedHeaderValues],
      },
    });

    // 2. Clear existing detail rows for this quotationNo
    const detailRowNums: number[] = [];
    detailRows.forEach((row, idx) => {
      if (String(row[0] || "").trim() === String(quotationNo).trim()) {
        detailRowNums.push(idx + 2);
      }
    });
    for (const rn of detailRowNums.sort((a, b) => b - a)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${QUOTATION_DETAILS_SHEET}!A${rn}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [new Array(DETAILS_COL_COUNT).fill("")],
        },
      });
    }

    // 3. Clear existing notation rows for this quotationNo
    const notationRowNums: number[] = [];
    notationRows.forEach((row, idx) => {
      if (String(row[0] || "").trim() === String(quotationNo).trim()) {
        notationRowNums.push(idx + 2);
      }
    });
    for (const rn of notationRowNums.sort((a, b) => b - a)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${QUOTATION_NOTATIONS_SHEET}!A${rn}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [new Array(NOTATIONS_COL_COUNT).fill("")],
        },
      });
    }

    // 4. Append new detail rows
    const newDetailValues = (payload.items || []).map((item) => [
      payload.quotationNo || quotationNo,
      item.description || "",
      item.quantity ?? 0,
      item.unit || "",
      item.unitPrice ?? 0,
    ]);
    if (newDetailValues.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${QUOTATION_DETAILS_SHEET}!A2:E`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: newDetailValues },
      });
    }

    // 5. Append new notation rows
    const newNotationValues = (payload.notation || []).map(
      (note: QuotationNotation) => [
        payload.quotationNo || quotationNo,
        note.notation || "",
      ],
    );
    if (newNotationValues.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${QUOTATION_NOTATIONS_SHEET}!A2:B`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: newNotationValues },
      });
    }

    return {
      id: `quot_${quotRowNum}`,
      quotationNo: payload.quotationNo || quotationNo,
      customer: payload.customer,
      description: payload.description,
      amount: payload.amount,
      discount: payload.discount,
      file: payload.file,
      date: payload.date,
      preparedBy: payload.preparedBy,
      approvedBy: payload.approvedBy,
      sentBy: payload.sentBy,
      status: payload.status || "DRAFT",
      items: payload.items || [],
      notation: payload.notation || [],
      terms: payload.terms || "",
      delivery: payload.delivery || "",
      warranty: payload.warranty || "",
    };
  } catch (error) {
    console.error(
      `Failed to update quotation quotationNo=${quotationNo}:`,
      error,
    );
    throw error;
  }
}

/**
 * Upload a PDF buffer to Google Drive and return the file metadata.
 */
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

/**
 * NEW: Save quotation data to sheets (no Drive upload, no email)
 * This replaces logQuotationWorkflow
 */
export async function saveQuotationData(params: {
  clientName: string;
  quotationDescription: string;
  grandTotal: number;
  discount: number;
  quotationNo: string;
  preparedByName: string;
  approvedBy?: string;
  sentByName?: string;
  fileUrl?: string;
  status: "DRAFT" | "SENT";
  items: Array<{
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
}): Promise<{ refNumber: string; date: string }> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const date = params.dateIssued || new Date().toISOString().split("T")[0];
    const refNumber =
      params.quotationNo || `Q-${Date.now().toString().slice(-8)}`;

    // Prepare main row: QuotationNo, Customer, Description, Amount, Discount, File, Date, PreparedBy, ApprovedBy, SentBy, Status
    const logRow = [
      refNumber, // A: QuotationNo
      params.clientName, // B: Customer
      params.quotationDescription, // C: Description
      params.grandTotal || 0, // D: Amount
      params.discount || 0, // E: Discount
      params.fileUrl || "", // F: File (Drive link or empty)
      date, // G: Date
      params.preparedByName, // H: PreparedBy
      params.approvedBy ||
        (params.status === "SENT" ? "Von Jeric Carmona" : ""), // I: ApprovedBy
      params.sentByName ||
        (params.status === "SENT" ? params.preparedByName : ""), // J: SentBy
      params.status, // K: Status
    ];

    const dataToWrite = [
      { range: `${QUOTATIONS_SHEET}!A2:K`, values: [logRow] },
    ];

    // Prepare detail rows
    const detailValues = (params.items || []).map((item) => [
      refNumber,
      item.description || "",
      item.qty ?? 0,
      item.unit || "",
      item.priceUnit ?? 0,
    ]);

    if (detailValues.length > 0) {
      dataToWrite.push({
        range: `${QUOTATION_DETAILS_SHEET}!A2:E`,
        values: detailValues,
      });
    }

    // Prepare notation rows
    const notationValues = (params.notations || []).map((note) => [
      refNumber,
      note || "",
    ]);

    if (notationValues.length > 0) {
      dataToWrite.push({
        range: `${QUOTATION_NOTATIONS_SHEET}!A2:B`,
        values: notationValues,
      });
    }

    // Execute all writes
    await Promise.all(
      dataToWrite.map((item) =>
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: item.range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: item.values },
        }),
      ),
    );

    return { refNumber, date };
  } catch (error) {
    console.error("Failed to save quotation data to sheets:", error);
    throw error;
  }
}
