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

export async function setGlobalFuelPrice(price: number): Promise<void> {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Fuel price must be greater than zero.");
  }
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A1:B1` });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:B1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["key", "value"]] },
    });
  }
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A2:B` });
  const rows = response.data.values ?? [];
  const index = rows.findIndex((item) => item[0] === KEY);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${index >= 0 ? index + 2 : rows.length + 2}:B${index >= 0 ? index + 2 : rows.length + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[KEY, price]] },
  });
}
