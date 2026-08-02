import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  Department,
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/types/department";

const SHEET_NAME = "Departments";
const RANGE = `${SHEET_NAME}!A2:B`; // departmentId (number), departmentName

async function getSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

function rowToDepartment(row: string[]): Department | null {
  const name = (row[1] || "").trim();
  if (!name) return null;
  return {
    departmentId: parseInt(row[0] || "0", 10),
    departmentName: name,
  };
}

export async function getDepartments(): Promise<Department[]> {
  const spreadsheetId = await getSpreadsheetId();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: RANGE,
  });
  return (res.data.values || [])
    .map(rowToDepartment)
    .filter((d): d is Department => d !== null && d.departmentId > 0);
}

export async function getDepartmentById(
  id: number,
): Promise<Department | null> {
  const departments = await getDepartments();
  return departments.find((d) => d.departmentId === id) ?? null;
}

export async function addDepartment(
  input: CreateDepartmentInput,
): Promise<Department> {
  const spreadsheetId = await getSpreadsheetId();
  const name = input.departmentName.trim();
  if (!name) throw new Error("Department name is required.");

  const existing = await getDepartments();
  const maxId = existing.reduce((max, d) => Math.max(max, d.departmentId), 0);
  const dept: Department = {
    departmentId: maxId + 1,
    departmentName: name,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:B`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[String(dept.departmentId), dept.departmentName]],
    },
  });

  return dept;
}

export async function updateDepartment(
  id: number,
  input: UpdateDepartmentInput,
): Promise<Department> {
  const spreadsheetId = await getSpreadsheetId();
  const departments = await getDepartments();
  const rowIndex = departments.findIndex((d) => d.departmentId === id);
  if (rowIndex === -1) throw new Error("Department not found.");

  const rowNumber = rowIndex + 2; // +2 for header offset
  const current = departments[rowIndex];

  const updated: Department = {
    departmentId: current.departmentId,
    departmentName:
      input.departmentName !== undefined
        ? input.departmentName.trim()
        : current.departmentName,
  };

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${rowNumber}:B${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[String(updated.departmentId), updated.departmentName]],
    },
  });

  return updated;
}

export async function deleteDepartment(id: number): Promise<void> {
  const spreadsheetId = await getSpreadsheetId();
  const departments = await getDepartments();
  const rowIndex = departments.findIndex((d) => d.departmentId === id);
  if (rowIndex === -1) throw new Error("Department not found.");

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
