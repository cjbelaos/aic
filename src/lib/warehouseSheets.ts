import { getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { isPostgresBackend } from "@/lib/db/postgres";
import { sheetRowsForRange } from "@/lib/db/sheetRows";
import { nextWarehouseId, validateWarehouse } from "@/lib/warehouseRules";
import type { Warehouse, WarehouseInput } from "@/types/warehouse";

// Warehouses tab, header row 1, data from row 2:
// A:WarehouseId B:CompanyId C:Code D:Name E:AddressLines F:CityProvincePostal G:ContactPersonPhone
// H:Active I:SortOrder J:CreatedBy K:CreatedAt L:UpdatedBy M:UpdatedAt
// Rows are never removed: Warehouse IDs key stock and DRs, and `id` (warehouse_<row>)
// keys Purchase Order ship-to options. Deactivate instead of delete.

const SHEET = "Warehouses";
const RANGE = `${SHEET}!A2:M`;
/** Warehouses belong to the operating company; Purchase Order ship-to options filter on it. */
const OWN_COMPANY_ID = "COMP-7";

export class WarehouseValidationError extends Error {
  status = 422 as const;
}

const rowNumber = (id: string) => Number(id.replace("warehouse_", ""));
const toBool = (value: unknown) => ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
const text = (value: unknown) => String(value ?? "").trim();
const mapRow = (row: string[], index: number): Warehouse => ({
  id: `warehouse_${index + 2}`,
  warehouseId: text(row[0]),
  companyId: text(row[1]),
  code: text(row[2]),
  name: text(row[3]),
  addressLines: text(row[4]),
  cityProvincePostal: text(row[5]),
  contactPersonPhone: text(row[6]),
  active: toBool(row[7]),
  sortOrder: Number(row[8]) || 0,
  createdBy: text(row[9]) || undefined,
  createdAt: text(row[10]) || undefined,
  updatedBy: text(row[11]) || undefined,
  updatedAt: text(row[12]) || undefined,
});

async function readRows() {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  return { sheets, spreadsheetId, values: (response.data.values ?? []) as string[][] };
}

export async function getWarehouses(): Promise<Warehouse[]> {
  const values = isPostgresBackend() ? await sheetRowsForRange(RANGE) : (await readRows()).values;
  return values
    .map(mapRow)
    .filter((row) => row.name)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function currentRow(values: string[][], id: string): { index: number; old: string[] } {
  const index = rowNumber(id);
  const old = Number.isInteger(index) && index >= 2 ? values[index - 2] : undefined;
  if (!old || !text(old[0])) throw new WarehouseValidationError("Warehouse not found.");
  return { index, old };
}

/** Creates a warehouse with the next automatic `WH-<n>` ID. New warehouses start active. */
export async function addWarehouse(input: WarehouseInput, actor: string): Promise<Warehouse> {
  const current = await readRows();
  const existing = current.values.map(mapRow).filter((w) => w.warehouseId);
  const error = validateWarehouse(input, existing, undefined);
  if (error) throw new WarehouseValidationError(error);
  const now = new Date().toISOString();
  const values = [[
    nextWarehouseId(existing.map((w) => w.warehouseId)),
    OWN_COMPANY_ID,
    input.code.trim(),
    input.name.trim(),
    input.addressLines.trim(),
    input.cityProvincePostal.trim(),
    (input.contactPersonPhone ?? "").trim(),
    "TRUE",
    String(Number(input.sortOrder) || 0),
    actor,
    now,
    actor,
    now,
  ]];
  await current.sheets.spreadsheets.values.append({ spreadsheetId: current.spreadsheetId, range: `${SHEET}!A:M`, valueInputOption: "RAW", requestBody: { values } });
  return mapRow(values[0], current.values.length);
}

/** Updates the editable fields. The Warehouse ID, company, active flag and creation stamp never change here. */
export async function updateWarehouse(id: string, input: WarehouseInput, actor: string): Promise<Warehouse> {
  const current = await readRows();
  const { index, old } = currentRow(current.values, id);
  const existing = current.values.map(mapRow).filter((w) => w.warehouseId);
  const error = validateWarehouse(input, existing, text(old[0]));
  if (error) throw new WarehouseValidationError(error);
  const now = new Date().toISOString();
  const values = [[
    text(old[0]),
    text(old[1]) || OWN_COMPANY_ID,
    input.code.trim(),
    input.name.trim(),
    input.addressLines.trim(),
    input.cityProvincePostal.trim(),
    (input.contactPersonPhone ?? "").trim(),
    toBool(old[7]) ? "TRUE" : "FALSE",
    String(Number(input.sortOrder) || 0),
    text(old[9]),
    text(old[10]) || now,
    actor,
    now,
  ]];
  await current.sheets.spreadsheets.values.update({ spreadsheetId: current.spreadsheetId, range: `${SHEET}!A${index}:M${index}`, valueInputOption: "RAW", requestBody: { values } });
  return mapRow(values[0], index - 2);
}

/** Deactivates or reactivates a warehouse. The row is kept so its history stays intact. */
export async function setWarehouseActive(id: string, active: boolean, actor: string): Promise<Warehouse> {
  const current = await readRows();
  const { index, old } = currentRow(current.values, id);
  const now = new Date().toISOString();
  await current.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: current.spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${SHEET}!H${index}`, values: [[active ? "TRUE" : "FALSE"]] },
        { range: `${SHEET}!L${index}:M${index}`, values: [[actor, now]] },
      ],
    },
  });
  const updated = [...old];
  updated[7] = active ? "TRUE" : "FALSE";
  updated[11] = actor;
  updated[12] = now;
  return mapRow(updated, index - 2);
}
