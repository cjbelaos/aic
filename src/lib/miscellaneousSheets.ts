import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  Miscellaneous,
  CreateMiscellaneousInput,
  UpdateMiscellaneousInput,
} from "@/types/miscellaneous";

const SHEET_NAME = "Miscellaneous";
const RANGE = `${SHEET_NAME}!A2:B`; // A=Code, B=Description

async function getSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

export async function getAllMiscellaneous(): Promise<Miscellaneous[]> {
  const spreadsheetId = await getSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });
  const rows = res.data.values || [];
  return rows
    .map((row) => ({
      code: (row[0] || "").toString().trim(),
      description: (row[1] || "").toString().trim(),
    }))
    .filter((m) => m.code && m.description);
}

export async function addMiscellaneous(
  input: CreateMiscellaneousInput,
): Promise<Miscellaneous> {
  const spreadsheetId = await getSpreadsheetId();
  const sheets = await getSheetsClient();
  const item: Miscellaneous = {
    code: input.code.trim().toUpperCase(),
    description: input.description.trim(),
  };
  if (!item.code) throw new Error("Code is required.");
  if (!item.description) throw new Error("Description is required.");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:B`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[item.code, item.description]] },
  });
  return item;
}

export async function updateMiscellaneous(
  input: UpdateMiscellaneousInput,
): Promise<Miscellaneous> {
  const spreadsheetId = await getSpreadsheetId();
  const all = await getAllMiscellaneous();
  const index = all.findIndex((m) => m.code === input.code);
  if (index === -1)
    throw new Error(`Miscellaneous code "${input.code}" not found.`);
  const rowNumber = index + 2;

  const current = all[index];
  const updated: Miscellaneous = {
    code: current.code,
    description:
      input.description !== undefined
        ? input.description.trim()
        : current.description,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:B${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[updated.code, updated.description]] },
  });
  return updated;
}

export async function deleteMiscellaneous(code: string): Promise<void> {
  const spreadsheetId = await getSpreadsheetId();
  const all = await getAllMiscellaneous();
  const index = all.findIndex((m) => m.code === code);
  if (index === -1) throw new Error(`Miscellaneous code "${code}" not found.`);
  const rowNumber = index + 2;

  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_NAME,
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined)
    throw new Error(`Sheet "${SHEET_NAME}" not found.`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
