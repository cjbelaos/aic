import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  Vehicle,
  CreateVehiclePayload,
  UpdateVehiclePayload,
} from "@/types/vehicle";

const VEHICLES_SHEET = "Vehicles";
// A:VehicleId B:Make & Model C:License Plate D:Year E:Current Mileage F:Last PMS Date G:Next PMS Date H:Next PMS Mileage I:Registration Expiry J:Insurance Expiry K:Status L:CreatedBy M:CreatedAt N:UpdatedBy O:UpdatedAt
const VEHICLES_RANGE = `${VEHICLES_SHEET}!A2:O`;

async function getSpreadsheetId(): Promise<string> {
  return await getDatabaseSpreadsheetId();
}

function parseStatus(value: string | undefined): "active" | "inactive" {
  const v = (value || "").trim().toLowerCase();
  return v === "inactive" ? "inactive" : "active";
}

export async function getVehicles(): Promise<Vehicle[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: VEHICLES_RANGE,
    });
    const rows = res.data.values || [];
    return rows
      .map((row) => ({
        vehicleId: String(row[0] ?? "").trim(),
        makeAndModel: String(row[1] ?? "").trim(),
        licensePlate: String(row[2] ?? "").trim(),
        year: String(row[3] ?? "").trim() || undefined,
        currentMileage: String(row[4] ?? "").trim() || undefined,
        lastPmsDate: String(row[5] ?? "").trim() || undefined,
        nextPmsDate: String(row[6] ?? "").trim() || undefined,
        nextPmsMileage: String(row[7] ?? "").trim() || undefined,
        registrationExpiry: String(row[8] ?? "").trim() || undefined,
        insuranceExpiry: String(row[9] ?? "").trim() || undefined,
        status: parseStatus(row[10]),
        createdBy: String(row[11] ?? "").trim() || undefined,
        createdAt: String(row[12] ?? "").trim() || undefined,
        updatedBy: String(row[13] ?? "").trim() || undefined,
        updatedAt: String(row[14] ?? "").trim() || undefined,
      }))
      .filter((v) => v.vehicleId.trim() !== "" && v.makeAndModel.trim() !== "");
  } catch (error) {
    console.error("Failed to fetch vehicles from Google Sheets:", error);
    throw error;
  }
}

async function findVehicleRow(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  vehicleId: string,
): Promise<number> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${VEHICLES_SHEET}!A2:A`,
  });
  const rows = res.data.values || [];
  return (
    rows.findIndex(
      (row) => String(row[0] ?? "").trim() === String(vehicleId).trim(),
    ) + 2
  );
}

/** Generates the next vehicle id (VEH-n) based on the highest existing suffix. */
function generateVehicleId(rows: unknown[][]): string {
  let max = 0;
  rows.forEach((row) => {
    const match = /^VEH-(\d+)$/i.exec(String(row[0] || "").trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  });
  return `VEH-${max + 1}`;
}
export async function addVehicle(
  payload: CreateVehiclePayload,
  userId = "",
): Promise<Vehicle> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getSpreadsheetId();

    const makeAndModel = payload.makeAndModel.trim();
    const licensePlate = payload.licensePlate.trim();
    if (!makeAndModel) throw new Error("Make & Model is required.");
    if (!licensePlate) throw new Error("License Plate is required.");

    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${VEHICLES_SHEET}!A2:A`,
    });
    const rows = existingRes.data.values || [];

    let vehicleId = String(payload.vehicleId ?? "").trim();
    if (vehicleId) {
      const duplicate = rows.some(
        (row) => String(row[0] ?? "").trim() === vehicleId,
      );
      if (duplicate) {
        throw new Error(`Vehicle ID "${vehicleId}" already exists.`);
      }
    } else {
      vehicleId = generateVehicleId(rows);
    }

    const now = new Date().toISOString();
    const values = [
      vehicleId,
      makeAndModel,
      licensePlate,
      payload.year || "",
      payload.currentMileage || "",
      payload.lastPmsDate || "",
      payload.nextPmsDate || "",
      payload.nextPmsMileage || "",
      payload.registrationExpiry || "",
      payload.insuranceExpiry || "",
      payload.status || "active",
      userId,
      now,
      userId,
      now,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: VEHICLES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });

    return {
      vehicleId,
      makeAndModel,
      licensePlate,
      year: payload.year || undefined,
      currentMileage: payload.currentMileage || undefined,
      lastPmsDate: payload.lastPmsDate || undefined,
      nextPmsDate: payload.nextPmsDate || undefined,
      nextPmsMileage: payload.nextPmsMileage || undefined,
      registrationExpiry: payload.registrationExpiry || undefined,
      insuranceExpiry: payload.insuranceExpiry || undefined,
      status: payload.status || "active",
      createdBy: userId || undefined,
      createdAt: now,
      updatedBy: userId || undefined,
      updatedAt: now,
    };
  } catch (error) {
    console.error("Failed to create vehicle in Google Sheets:", error);
    throw error;
  }
}
export async function updateVehicle(
  vehicleId: string,
  payload: UpdateVehiclePayload,
  userId = "",
): Promise<Vehicle> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getSpreadsheetId();

    const rowNumber = await findVehicleRow(sheets, spreadsheetId, vehicleId);
    if (rowNumber <= 1) throw new Error(`Vehicle "${vehicleId}" not found.`);

    const currentRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${VEHICLES_SHEET}!A${rowNumber}:O${rowNumber}`,
    });
    const current = currentRes.data.values?.[0] || [];

    const updatedAt = new Date().toISOString();
    const updated = [
      vehicleId,
      payload.makeAndModel ?? String(current[1] ?? "").trim(),
      payload.licensePlate ?? String(current[2] ?? "").trim(),
      payload.year !== undefined ? payload.year : String(current[3] ?? "").trim(),
      payload.currentMileage !== undefined
        ? payload.currentMileage
        : String(current[4] ?? "").trim(),
      payload.lastPmsDate !== undefined
        ? payload.lastPmsDate
        : String(current[5] ?? "").trim(),
      payload.nextPmsDate !== undefined
        ? payload.nextPmsDate
        : String(current[6] ?? "").trim(),
      payload.nextPmsMileage !== undefined
        ? payload.nextPmsMileage
        : String(current[7] ?? "").trim(),
      payload.registrationExpiry !== undefined
        ? payload.registrationExpiry
        : String(current[8] ?? "").trim(),
      payload.insuranceExpiry !== undefined
        ? payload.insuranceExpiry
        : String(current[9] ?? "").trim(),
      payload.status ?? String(current[10] ?? "active").trim(),
      String(current[11] ?? "").trim(), // L: CreatedBy preserved
      String(current[12] ?? "").trim(), // M: CreatedAt preserved
      userId || String(current[13] ?? "").trim(), // N: UpdatedBy
      updatedAt, // O: UpdatedAt
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${VEHICLES_SHEET}!A${rowNumber}:O${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updated] },
    });

    return {
      vehicleId,
      makeAndModel: String(updated[1]),
      licensePlate: String(updated[2]),
      year: String(updated[3] ?? "").trim() || undefined,
      currentMileage: String(updated[4] ?? "").trim() || undefined,
      lastPmsDate: String(updated[5] ?? "").trim() || undefined,
      nextPmsDate: String(updated[6] ?? "").trim() || undefined,
      nextPmsMileage: String(updated[7] ?? "").trim() || undefined,
      registrationExpiry: String(updated[8] ?? "").trim() || undefined,
      insuranceExpiry: String(updated[9] ?? "").trim() || undefined,
      status: parseStatus(updated[10]),
      createdBy: String(updated[11] ?? "").trim() || undefined,
      createdAt: String(updated[12] ?? "").trim() || undefined,
      updatedBy: String(updated[13] ?? "").trim() || undefined,
      updatedAt: String(updated[14] ?? "").trim() || undefined,
    };
  } catch (error) {
    console.error(`Failed to update vehicle ${vehicleId}:`, error);
    throw error;
  }
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getSpreadsheetId();

    const rowNumber = await findVehicleRow(sheets, spreadsheetId, vehicleId);
    if (rowNumber <= 1) throw new Error(`Vehicle "${vehicleId}" not found.`);

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === VEHICLES_SHEET,
    );
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined)
      throw new Error(`Sheet "${VEHICLES_SHEET}" not found.`);

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
  } catch (error) {
    console.error(`Failed to delete vehicle ${vehicleId}:`, error);
    throw error;
  }
}