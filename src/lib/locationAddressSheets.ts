import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  LocationAddress,
  CreateLocationAddressPayload,
} from "@/types/locationAddress";

const LOCATION_ADDRESSES_SHEET = "LocationAddresses";
const LOCATION_ADDRESSES_RANGE = `${LOCATION_ADDRESSES_SHEET}!A2:E`; // A=LocationId, B=LocationName, C=Address, D=Latitude, E=Longitude

function getRowFromId(id: string): number {
  const rowStr = id.replace("location_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid Location ID format: ${id}`);
  }
  return rowNum;
}

async function getSheetTabId(
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
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet.`);
  }
  return sheet.properties.sheetId;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const v = (value || "").toString().trim();
  if (!v) return undefined;
  const num = parseFloat(v);
  return isNaN(num) ? undefined : num;
}

export async function getLocationAddresses(): Promise<LocationAddress[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
    });

    const rows = response.data.values || [];

    return rows
      .map((row, index): LocationAddress => {
        const rowNumber = index + 2; // +2 because row 1 is header
        return {
          id: `location_${rowNumber}`,
          locationId: (row[0] || "").toString().trim(),
          locationName: (row[1] || "").toString().trim(),
          address: (row[2] || "").toString().trim(),
          latitude: parseOptionalNumber(row[3]),
          longitude: parseOptionalNumber(row[4]),
        };
      })
      // Hide stale/blank rows
      .filter((loc) => loc.locationName.trim() !== "");
  } catch (error) {
    console.error(
      "Failed to fetch location addresses from Google Sheets:",
      error,
    );
    throw error;
  }
}

async function generateLocationId(rows: unknown[][]): Promise<string> {
  let max = 0;
  rows.forEach((row) => {
    const match = /^LOC-(\d+)$/i.exec(String(row[0] || "").trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  });
  return `LOC-${max + 1}`;
}

export async function updateLocationAddressInSheets(
  payload: CreateLocationAddressPayload & { id: string },
): Promise<LocationAddress> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(payload.id);
    const updateRange = `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:E${rowNumber}`;

    const currentDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: updateRange,
    });
    const existingRow = currentDataResponse.data.values?.[0] || [];

    const updatedValues = [
      payload.locationId !== undefined
        ? payload.locationId
        : existingRow[0] || "",
      payload.locationName !== undefined
        ? payload.locationName.trim()
        : existingRow[1] || "",
      payload.address !== undefined
        ? payload.address.trim()
        : existingRow[2] || "",
      payload.latitude !== undefined && !isNaN(payload.latitude)
        ? String(payload.latitude)
        : existingRow[3] || "",
      payload.longitude !== undefined && !isNaN(payload.longitude)
        ? String(payload.longitude)
        : existingRow[4] || "",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedValues] },
    });

    return {
      id: payload.id,
      locationId: updatedValues[0],
      locationName: updatedValues[1],
      address: updatedValues[2],
      latitude: parseOptionalNumber(updatedValues[3]),
      longitude: parseOptionalNumber(updatedValues[4]),
    };
  } catch (error) {
    console.error(
      `Failed to update location row ${payload.id} in Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function deleteLocationAddressFromSheets(id: string): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const rowNumber = getRowFromId(id);
    const sheetId = await getSheetTabId(
      sheets,
      spreadsheetId,
      LOCATION_ADDRESSES_SHEET,
    );

    // Physically remove the row (shift subsequent rows up).
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // 0-based row index
                endIndex: rowNumber, // exclusive
              },
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error(
      `Failed to delete location row ${id} from Google Sheets:`,
      error,
    );
    throw error;
  }
}

export async function addLocationAddress(
  payload: CreateLocationAddressPayload,
): Promise<LocationAddress> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
    });
    const existingRows = response.data.values || [];

    // ── Duplicate-name merge ─────────────────────────────────────────
    // If a location with the same name already exists (case-insensitive),
    // update that row in place instead of creating a second row.
    const incomingName = (payload.locationName || "").trim().toLowerCase();
    const matchIndex = incomingName
      ? existingRows.findIndex(
          (row) =>
            String(row[1] || "")
              .trim()
              .toLowerCase() === incomingName,
        )
      : -1;

    if (matchIndex >= 0) {
      const existingRow = existingRows[matchIndex];
      const rowNumber = matchIndex + 2;
      const updateRange = `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:E${rowNumber}`;
      const updatedValues = [
        existingRow[0] || "", // keep existing LocationId
        (payload.locationName || "").trim() || existingRow[1] || "",
        payload.address !== undefined ? payload.address : existingRow[2] || "",
        payload.latitude !== undefined && !isNaN(payload.latitude)
          ? String(payload.latitude)
          : existingRow[3] || "",
        payload.longitude !== undefined && !isNaN(payload.longitude)
          ? String(payload.longitude)
          : existingRow[4] || "",
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [updatedValues],
        },
      });

      return {
        id: `location_${rowNumber}`,
        locationId: updatedValues[0],
        locationName: updatedValues[1],
        address: updatedValues[2],
        latitude: parseOptionalNumber(updatedValues[3]),
        longitude: parseOptionalNumber(updatedValues[4]),
      };
    }

    // ── Append new row ───────────────────────────────────────────────
    const locationId =
      (payload.locationId || "").trim() ||
      (await generateLocationId(existingRows));
    const newRowNumber = existingRows.length + 2;

    const newRowValues = [
      locationId,
      (payload.locationName || "").trim(),
      (payload.address || "").trim(),
      payload.latitude !== undefined && !isNaN(payload.latitude)
        ? String(payload.latitude)
        : "",
      payload.longitude !== undefined && !isNaN(payload.longitude)
        ? String(payload.longitude)
        : "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    return {
      id: `location_${newRowNumber}`,
      locationId,
      locationName: newRowValues[1],
      address: newRowValues[2],
      latitude: parseOptionalNumber(newRowValues[3]),
      longitude: parseOptionalNumber(newRowValues[4]),
    };
  } catch (error) {
    console.error(
      `Failed to create location address row in Google Sheets:`,
      error,
    );
    throw error;
  }
}