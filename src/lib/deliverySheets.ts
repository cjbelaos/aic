import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
} from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import {
  CreateDeliveryPayload,
  DeliveryReceiptResponse,
  DeliveryReceiptSummary,
  DeliveryItem,
} from "@/types/deliveryReceipt";

const DELIVERED_BY_NAMES_SHEET = "DeliveredByNames";
const DELIVERED_BY_NAMES_RANGE = `${DELIVERED_BY_NAMES_SHEET}!A2:A`;

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";
const DELIVERY_RECEIPTS_RANGE = `${DELIVERY_RECEIPTS_SHEET}!A2:K`;
// A:DRNumber B:DeliveryDate C:CompanyId D:PONumber E:TRNumber F:Comments G:PreparedBy H:DeliveredBy I:CreatedAt J:Status K:DriveFileLink

const DELIVERY_RECEIPT_ITEMS_SHEET = "DeliveryReceiptItems";
const DELIVERY_RECEIPT_ITEMS_RANGE = `${DELIVERY_RECEIPT_ITEMS_SHEET}!A2:E`;
// A:DeliveryReceiptId B:ProductCode C:Quantity D:Unit E:Status

const PRINT_TEMPLATE_SHEET = "DeliveryReceiptForm";
const DR_SEQUENCE_BASE = 3638; // last DR number in old system, so next DR starts at 3639

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

/** Fetches and groups delivery receipt rows into summary objects by DR number. */
export async function getDeliveryReceipts(): Promise<DeliveryReceiptSummary[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Fetch DR headers + DR items in parallel
    const [drResponse, itemsResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: DELIVERY_RECEIPTS_RANGE,
      }),
      sheets.spreadsheets.values
        .get({
          spreadsheetId,
          range: DELIVERY_RECEIPT_ITEMS_RANGE,
        })
        .catch(() => ({ data: { values: [] as any[][] } })), // items sheet may not exist yet
    ]);

    const drRows = drResponse.data.values;
    if (!drRows || drRows.length === 0) return [];

    const itemRows = itemsResponse.data.values || [];

    // Group items by DR number (DeliveryReceiptId column A)
    const itemsByDr = new Map<number, DeliveryItem[]>();
    for (const itemRow of itemRows) {
      const drId = parseInt(String(itemRow[0] ?? "").trim(), 10);
      const itemStatus = String(itemRow[4] ?? "active").trim();
      if (isNaN(drId) || itemStatus === "deleted") continue;
      const item: DeliveryItem = {
        productCode: String(itemRow[1] ?? "").trim(),
        quantity: parseInt(String(itemRow[2] ?? "0"), 10) || 0,
        unit: String(itemRow[3] ?? "").trim(),
        description: "", // description resolved from product lookup if needed
      };
      if (!itemsByDr.has(drId)) itemsByDr.set(drId, []);
      itemsByDr.get(drId)!.push(item);
    }

    // Resolve companies once
    const companies = await getCompanies().catch(() => []);

    return drRows
      .map((row) => {
        const drNumber = parseInt(String(row[0] ?? "").trim(), 10);
        if (isNaN(drNumber)) return null;

        return {
          drNumber,
          date: String(row[1] ?? "").trim(),
          companyId: String(row[2] ?? "").trim(),
          poNo: String(row[3] ?? "").trim(),
          trNo: String(row[4] ?? "").trim(),
          comments: String(row[5] ?? "").trim(),
          preparedBy: String(row[6] ?? "").trim(),
          deliveredBy: String(row[7] ?? "").trim(),
          createdAt: String(row[8] ?? "").trim(),
          status: String(row[9] ?? "created").trim() || "created",
          driveFileLink: String(row[10] ?? "").trim() || undefined,
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
      .sort((a, b) => b.drNumber - a.drNumber);
  } catch (error) {
    console.error("Failed to fetch delivery receipts:", error);
    throw error;
  }
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

    // 3. Log ONE header row to DeliveryReceipts sheet
    const createdAt = new Date().toISOString();
    const headerRow = [
      String(drNumber),
      payload.date,
      payload.companyId,
      payload.poNo || "",
      payload.trNo || "",
      payload.comments || "",
      payload.preparedBy || "",
      payload.deliveredBy || "",
      createdAt,
      "created",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: DELIVERY_RECEIPTS_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headerRow] },
    });

    // 3b. Log item rows to DeliveryReceiptItems sheet
    const itemRows = payload.items.map((item) => [
      String(drNumber),
      item.productCode,
      item.quantity,
      item.unit,
      "active",
    ]);

    if (itemRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: DELIVERY_RECEIPT_ITEMS_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: itemRows },
      });
    }

    // 4. Clear then populate DeliveryReceiptForm template
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${PRINT_TEMPLATE_SHEET}!A13:C35`,
    });

    const templateRows = payload.items.map((item) => [
      item.quantity,
      item.unit,
      item.description,
    ]);
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
            values: [[payload.trNo || ""]],
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
    const printUrl = buildExportUrl(spreadsheetId, gid);
    let pdfBase64: string | undefined;
    try {
      pdfBase64 = await fetchExportPdfBase64(printUrl);
    } catch (e) {
      console.warn("PDF export failed (will use print URL fallback):", e);
    }

    return {
      success: true,
      drNumber,
      companyName,
      address,
      tin,
      date: payload.date,
      poNo: payload.poNo,
      trNo: payload.trNo,
      preparedBy: payload.preparedBy,
      deliveredBy: payload.deliveredBy,
      comments: payload.comments,
      items: payload.items,
      status: "created",
      printUrl,
      pdfBase64,
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

/**
 * Finds all item rows in DeliveryReceiptItems for a given DR number.
 */
async function findDrItemRows(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  drNumber: number,
): Promise<Array<{ rowNumber: number; rowData: string[] }>> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: DELIVERY_RECEIPT_ITEMS_RANGE,
  });
  const rows = response.data.values || [];
  const result: Array<{ rowNumber: number; rowData: string[] }> = [];
  rows.forEach((row, idx) => {
    const drId = parseInt(String(row[0] ?? "").trim(), 10);
    if (drId === drNumber) {
      result.push({ rowNumber: idx + 2, rowData: row });
    }
  });
  return result;
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
): Promise<DeliveryReceiptSummary> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const drRowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
    if (drRowNumber <= 1) throw new Error(`DR #${drNumber} not found.`);

    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:K${drRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];

    const updatedRow = [
      String(drNumber),
      payload.date ?? String(currentRow[1] ?? "").trim(),
      payload.companyId ?? String(currentRow[2] ?? "").trim(),
      payload.poNo !== undefined
        ? payload.poNo
        : String(currentRow[3] ?? "").trim(),
      payload.trNo !== undefined
        ? payload.trNo
        : String(currentRow[4] ?? "").trim(),
      payload.comments !== undefined
        ? payload.comments
        : String(currentRow[5] ?? "").trim(),
      payload.preparedBy ?? String(currentRow[6] ?? "").trim(),
      payload.deliveredBy ?? String(currentRow[7] ?? "").trim(),
      String(currentRow[8] ?? "").trim(),
      payload.status ?? String(currentRow[9] ?? "created").trim(),
      String(currentRow[10] ?? "").trim(), // K: DriveFileLink (preserved)
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:K${drRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    // Replace items if provided
    if (payload.items) {
      const existingItemRows = await findDrItemRows(
        sheets,
        spreadsheetId,
        drNumber,
      );
      if (existingItemRows.length > 0) {
        const clearRanges = existingItemRows.map(
          (r) =>
            `${DELIVERY_RECEIPT_ITEMS_SHEET}!A${r.rowNumber}:E${r.rowNumber}`,
        );
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: clearRanges.map((range) => ({
              range,
              values: [["", "", "", "", ""]],
            })),
          },
        });
      }

      const itemRows = payload.items.map((item) => [
        String(drNumber),
        item.productCode,
        item.quantity,
        item.unit,
        "active",
      ]);
      if (itemRows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: DELIVERY_RECEIPT_ITEMS_RANGE,
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
      drNumber,
      date: updatedRow[1],
      companyId: updatedRow[2],
      companyName: company?.companyName || updatedRow[2],
      poNo: updatedRow[3],
      trNo: updatedRow[4],
      comments: updatedRow[5],
      preparedBy: updatedRow[6],
      deliveredBy: updatedRow[7],
      createdAt: updatedRow[8],
      status: updatedRow[9],
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
export async function deleteDeliveryReceipt(drNumber: number): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const drRowNumber = await findDrRow(sheets, spreadsheetId, drNumber);
    if (drRowNumber <= 1) throw new Error(`DR #${drNumber} not found.`);

    // ── 1. Soft-delete DR: set status to "deleted" (preserve all data) ──
    const currentResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:K${drRowNumber}`,
    });
    const currentRow = currentResponse.data.values?.[0] || [];
    const updatedRow = [...currentRow];
    while (updatedRow.length < 11) updatedRow.push("");
    updatedRow[9] = "deleted"; // Column J: Status

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:K${drRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    // ── 1b. Mark all DR items as "deleted" ──
    const itemRowsData = await findDrItemRows(sheets, spreadsheetId, drNumber);
    if (itemRowsData.length > 0) {
      const itemUpdates = itemRowsData.map(({ rowNumber, rowData }) => {
        const updatedItemRow = [...rowData];
        while (updatedItemRow.length < 5) updatedItemRow.push("");
        updatedItemRow[4] = "deleted"; // Column E: Status
        return {
          range: `${DELIVERY_RECEIPT_ITEMS_SHEET}!A${rowNumber}:E${rowNumber}`,
          values: [updatedItemRow],
        };
      });
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: itemUpdates,
        },
      });
    }

    // ── 2. Fetch all ContractReleases linked to this DR ──
    const { getContractReleases } = await import("@/lib/contractReleaseSheets");
    const { upsertPeriodSummary } =
      await import("@/lib/contractPeriodSummarySheets");
    const { getContractItems } = await import("@/lib/contractItemSheets");
    const { getPeriodInfo, getPeriodId, formatDate } =
      await import("@/lib/utils/contractRelease.utils");

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

      // ── 3. Rebuild ALL period summaries (including zero-release periods) ──
      const affectedItems = [
        ...new Set(linkedReleases.map((r) => r.contractItemId)),
      ];
      const items = await getContractItems();

      for (const itemId of affectedItems) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;

        const remaining = allReleases.filter(
          (r) =>
            r.contractItemId === itemId &&
            r.drNumber !== drNumber &&
            r.status !== "Deleted",
        );

        const periodMap = new Map<
          string,
          { releases: typeof remaining; start: Date; end: Date }
        >();

        for (const rel of remaining) {
          const date = new Date(rel.releaseDate);
          const info = getPeriodInfo(date, rel.frequency);
          const pid = getPeriodId(itemId, info);
          if (!periodMap.has(pid)) {
            periodMap.set(pid, {
              releases: [],
              start: info.periodStart,
              end: info.periodEnd,
            });
          }
          periodMap.get(pid)!.releases.push(rel);
        }

        // Also include periods from deleted releases (now with zero releases)
        for (const rel of linkedReleases) {
          const date = new Date(rel.releaseDate);
          const info = getPeriodInfo(date, rel.frequency);
          const pid = getPeriodId(itemId, info);
          if (!periodMap.has(pid)) {
            periodMap.set(pid, {
              releases: [],
              start: info.periodStart,
              end: info.periodEnd,
            });
          }
        }

        for (const [pid, data] of periodMap) {
          const sorted = [...data.releases].sort(
            (a, b) =>
              new Date(a.releaseDate).getTime() -
              new Date(b.releaseDate).getTime(),
          );
          const totalReleased = sorted.reduce((s, r) => s + r.quantity, 0);
          const entitledQty = item.entitledQty;

          let status: "Completed" | "Partial" | "Overdue" | "Pending";
          if (totalReleased >= entitledQty) status = "Completed";
          else if (totalReleased === 0) status = "Pending";
          else status = "Partial";

          const today = new Date();
          if (status !== "Completed" && today > data.end && totalReleased > 0)
            status = "Overdue";

          const daysToComplete =
            status === "Completed" && sorted.length >= 2
              ? Math.ceil(
                  (new Date(sorted[sorted.length - 1].releaseDate).getTime() -
                    new Date(sorted[0].releaseDate).getTime()) /
                    86400000,
                )
              : undefined;

          await upsertPeriodSummary({
            periodId: pid,
            contractItemId: itemId,
            contractId: item.contractId,
            productCode: item.productCode,
            periodYear: getPeriodInfo(new Date(data.start), item.frequency)
              .year,
            periodMonth: getPeriodInfo(new Date(data.start), item.frequency)
              .month,
            periodQuarter: getPeriodInfo(new Date(data.start), item.frequency)
              .quarter,
            frequency: item.frequency,
            entitledQty,
            releasedQty: totalReleased,
            releaseCount: sorted.length,
            firstReleaseDate: sorted[0]?.releaseDate,
            lastReleaseDate: sorted[sorted.length - 1]?.releaseDate,
            status,
            daysToComplete,
            periodStart: formatDate(data.start),
            periodEnd: formatDate(data.end),
          });
        }
      }
    }
  } catch (error) {
    console.error("Failed to delete delivery receipt:", error);
    throw error;
  }
}
/**
 * Exports the current DeliveryReceiptForm tab as a PDF base64 string.
 * Used by save-to-drive endpoint for re-fetching after initial creation.
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
