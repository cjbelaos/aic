import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { getAllFTIRequests } from "@/lib/ftiSheets";
import { getLiquidationByIdFresh, invalidateLiquidationCache } from "@/lib/liquidationSheets";
import { assertCanRecordReturn, validateReturnDate } from "@/lib/liquidation-returns";
import type { Liquidation } from "@/types/liquidation";

export const RETURN_HEADERS = ["ReturnDate", "ReturnEvidenceFileId", "ReturnEvidenceName", "ReturnUpdatedBy", "ReturnUpdatedAt"];
export interface ReturnEvidence { fileId: string; name: string }

export async function enrichLiquidationAdvances<T extends Liquidation>(liquidations: T[]): Promise<T[]> {
  if (!liquidations.some(l => l.controlNo && !l.totalAmountRequested)) return liquidations;
  const requests = await getAllFTIRequests().catch(() => []);
  return liquidations.map(l => {
    if (!l.controlNo || l.totalAmountRequested) return l;
    const amount = requests.find(r => r.controlNo === l.controlNo)?.totalAmount;
    if (amount == null || !Number.isFinite(amount)) return { ...l, returnAmountUnavailable: true };
    return { ...l, totalAmountRequested: amount };
  });
}

export async function getReturnLiquidation(liquidationId: string): Promise<Liquidation | null> {
  const liquidation = await getLiquidationByIdFresh(liquidationId);
  return liquidation ? (await enrichLiquidationAdvances([liquidation]))[0] : null;
}

export async function saveLiquidationReturn(
  liquidationId: string, userId: string, returnDate: string, evidence?: ReturnEvidence,
): Promise<Liquidation> {
  validateReturnDate(returnDate);
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Liquidations" });
  const rows = (response.data.values || []).slice(1);
  const index = rows.findIndex(r => String(r[0] || "").trim() === liquidationId);
  if (index < 0) throw new Error("Liquidation not found.");
  const row = rows[index];
  const [liquidation] = await enrichLiquidationAdvances([{
    liquidationId, controlNo: String(row[1] || ""), userId: String(row[2] || ""),
    totalAmount: Number(row[3] || 0), status: String(row[4] || ""),
    totalAmountRequested: row[10] === "" || row[10] == null ? undefined : Number(row[10]),
    returnDate: String(row[15] || ""), returnEvidenceFileId: String(row[16] || ""),
    returnEvidenceName: String(row[17] || ""),
  }]);
  assertCanRecordReturn(liquidation, userId);
  const fileId = evidence?.fileId || liquidation.returnEvidenceFileId;
  const name = evidence?.name || liquidation.returnEvidenceName;
  if (!fileId) throw new Error("A screenshot or photo is required as return evidence.");

  // Never overwrite unrelated columns if the live schema has been extended differently.
  const headers = (response.data.values?.[0] || []).slice(15, 20);
  if (RETURN_HEADERS.some((header, i) => headers[i] && headers[i] !== header)) {
    throw new Error("Liquidation return columns conflict with the sheet schema. Contact an administrator.");
  }
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheet = metadata.data.sheets?.find(s => s.properties?.title === "Liquidations")?.properties;
  if (!sheet || sheet.sheetId == null) throw new Error("Liquidations sheet not found.");
  const columnCount = sheet.gridProperties?.columnCount || 0;
  if (columnCount < 20) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{
      appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: 20 - columnCount },
    }] } });
  }
  const rowNumber = index + 2;
  const updatedAt = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: "Liquidations!P1:T1", values: [RETURN_HEADERS] },
        // Pin legacy FTI fallback amounts so later FTI edits cannot change a recorded return.
        { range: `Liquidations!K${rowNumber}`, values: [[liquidation.totalAmountRequested]] },
        { range: `Liquidations!N${rowNumber}:T${rowNumber}`,
          values: [[userId, updatedAt, returnDate, fileId, name, userId, updatedAt]] },
      ],
    },
  });
  invalidateLiquidationCache();
  return { ...liquidation, returnDate, returnEvidenceFileId: fileId, returnEvidenceName: name,
    returnUpdatedBy: userId, returnUpdatedAt: updatedAt, updatedBy: userId, updatedAt };
}
