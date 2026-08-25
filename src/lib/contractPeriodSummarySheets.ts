import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { ContractPeriodSummary } from "@/types/contract-release";

const SUMMARY_SHEET = "ContractPeriodSummary";
const SUMMARY_RANGE = `${SUMMARY_SHEET}!A2:Q`;
// Columns: A: PeriodId, B: ContractItemId, C: ContractId, D: ProductCode,
//           E: PeriodYear, F: PeriodMonth, G: PeriodQuarter, H: Frequency,
//           I: EntitledQty, J: ReleasedQty, K: ReleaseCount, L: FirstReleaseDate,
//           M: LastReleaseDate, N: Status, O: DaysToComplete, P: PeriodStart, Q: PeriodEnd

/**
 * GET: Fetches all period summaries, optionally filtered.
 */
export async function getPeriodSummaries(
  contractItemId?: string,
  periodYear?: number,
  periodMonth?: number,
  contractId?: string,
): Promise<ContractPeriodSummary[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUMMARY_RANGE,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    let summaries: ContractPeriodSummary[] = rows
      .filter((row) => row[0] && row[0].startsWith("PER-"))
      .map((row) => ({
        periodId: row[0] || "",
        contractItemId: row[1] || "",
        contractId: row[2] || "",
        productCode: row[3] || "",
        periodYear: parseInt(row[4] || "0", 10) || 0,
        periodMonth: parseInt(row[5] || "0", 10) || 0,
        periodQuarter: parseInt(row[6] || "0", 10) || 0,
        frequency: row[7] as ContractPeriodSummary["frequency"],
        entitledQty: parseInt(row[8] || "0", 10) || 0,
        releasedQty: parseInt(row[9] || "0", 10) || 0,
        releaseCount: parseInt(row[10] || "0", 10) || 0,
        firstReleaseDate: row[11] || undefined,
        lastReleaseDate: row[12] || undefined,
        status: (row[13] as ContractPeriodSummary["status"]) || "Pending",
        daysToComplete: row[14] ? parseInt(row[14], 10) : undefined,
        periodStart: row[15] || "",
        periodEnd: row[16] || "",
      }));

    if (contractItemId) {
      summaries = summaries.filter((s) => s.contractItemId === contractItemId);
    }
    if (periodYear) {
      summaries = summaries.filter((s) => s.periodYear === periodYear);
    }
    if (periodMonth) {
      summaries = summaries.filter((s) => s.periodMonth === periodMonth);
    }
    if (contractId) {
      summaries = summaries.filter((s) => s.contractId === contractId);
    }

    return summaries;
  } catch (error) {
    console.error("Failed to fetch period summaries from Google Sheets:", error);
    throw error;
  }
}

/**
 * GET: Fetches a single period summary by periodId.
 */
export async function getPeriodSummaryById(
  periodId: string,
): Promise<ContractPeriodSummary | null> {
  const summaries = await getPeriodSummaries();
  return summaries.find((s) => s.periodId === periodId) || null;
}

/**
 * PUT: Upserts a period summary (creates or updates).
 */
export async function upsertPeriodSummary(
  summary: ContractPeriodSummary,
): Promise<ContractPeriodSummary> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SUMMARY_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    // Check if this periodId already exists
    const existingRowIndex = existingRows.findIndex(
      (row) => row[0] === summary.periodId,
    );

    const rowValues = [
      summary.periodId,
      summary.contractItemId,
      summary.contractId,
      summary.productCode,
      summary.periodYear.toString(),
      summary.periodMonth.toString(),
      summary.periodQuarter.toString(),
      summary.frequency,
      summary.entitledQty.toString(),
      summary.releasedQty.toString(),
      summary.releaseCount.toString(),
      summary.firstReleaseDate || "",
      summary.lastReleaseDate || "",
      summary.status,
      summary.daysToComplete?.toString() || "",
      summary.periodStart,
      summary.periodEnd,
    ];

    if (existingRowIndex >= 0) {
      // Update existing row
      const rowNumber = existingRowIndex + 2;
      const updateRange = `${SUMMARY_SHEET}!A${rowNumber}:Q${rowNumber}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    } else {
      // Find first empty row or append
      let firstEmptyRowIndex = existingRows.length;
      for (let i = 0; i < existingRows.length; i++) {
        if (
          !existingRows[i] ||
          existingRows[i].every((cell) => !cell || cell.trim() === "")
        ) {
          firstEmptyRowIndex = i;
          break;
        }
      }

      const rowNumber = firstEmptyRowIndex + 2;
      const updateRange = `${SUMMARY_SHEET}!A${rowNumber}:Q${rowNumber}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [rowValues] },
      });
    }

    return summary;
  } catch (error) {
    console.error("Failed to upsert period summary:", error);
    throw error;
  }
}