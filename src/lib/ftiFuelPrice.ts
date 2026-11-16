import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";

const SHEET_NAME = "FTISettings";
const KEY = "globalFuelPrice";

export async function getGlobalFuelPrice(): Promise<number | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:B`,
    });
    const row = (response.data.values ?? []).find((item) => item[0] === KEY);
    const price = Number(row?.[1]);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export { recalculateFTIFuel as setGlobalFuelPrice } from "@/lib/ftiRecalculation";
