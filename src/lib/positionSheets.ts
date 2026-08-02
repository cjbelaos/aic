import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  Position,
  CreatePositionInput,
  UpdatePositionInput,
} from "@/types/position";

const SHEET_NAME = "Positions";
const RANGE = `${SHEET_NAME}!A2:B`; // positionId (number), positionTitle

async function getSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

function rowToPosition(row: string[]): Position | null {
  const title = (row[1] || "").trim();
  if (!title) return null;
  return {
    positionId: parseInt(row[0] || "0", 10),
    positionTitle: title,
  };
}

export async function getPositions(): Promise<Position[]> {
  const spreadsheetId = await getSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });
  return (res.data.values || [])
    .map(rowToPosition)
    .filter((p): p is Position => p !== null && p.positionId > 0);
}

export async function getPositionById(id: number): Promise<Position | null> {
  const positions = await getPositions();
  return positions.find((p) => p.positionId === id) ?? null;
}

export async function addPosition(
  input: CreatePositionInput,
): Promise<Position> {
  const spreadsheetId = await getSpreadsheetId();
  const title = input.positionTitle.trim();
  if (!title) throw new Error("Position title is required.");

  const existing = await getPositions();
  const maxId = existing.reduce((max, p) => Math.max(max, p.positionId), 0);
  const pos: Position = {
    positionId: maxId + 1,
    positionTitle: title,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:B`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[String(pos.positionId), pos.positionTitle]],
    },
  });

  return pos;
}

export async function updatePosition(
  id: number,
  input: UpdatePositionInput,
): Promise<Position> {
  const spreadsheetId = await getSpreadsheetId();
  const positions = await getPositions();
  const rowIndex = positions.findIndex((p) => p.positionId === id);
  if (rowIndex === -1) throw new Error("Position not found.");

  const rowNumber = rowIndex + 2;
  const current = positions[rowIndex];

  const updated: Position = {
    positionId: current.positionId,
    positionTitle:
      input.positionTitle !== undefined
        ? input.positionTitle.trim()
        : current.positionTitle,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:B${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[String(updated.positionId), updated.positionTitle]],
    },
  });

  return updated;
}

export async function deletePosition(id: number): Promise<void> {
  const spreadsheetId = await getSpreadsheetId();
  const positions = await getPositions();
  const rowIndex = positions.findIndex((p) => p.positionId === id);
  if (rowIndex === -1) throw new Error("Position not found.");

  const rowNumber = rowIndex + 2;

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
