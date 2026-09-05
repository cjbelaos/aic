import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  LocationAddress,
  CreateLocationAddressPayload,
  deriveLocationStatus,
} from "@/types/locationAddress";

const LOCATION_ADDRESSES_SHEET = "LocationAddresses";
const LOCATION_ADDRESSES_RANGE = `${LOCATION_ADDRESSES_SHEET}!A2:J`;
// A=LocationId, B=LocationName, C=Address, D=Latitude, E=Longitude,
// F=CompanyId, G=CreatedBy, H=CreatedAt, I=UpdatedBy, J=UpdatedAt

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
          companyId: (row[5] || "").toString().trim() || undefined,
          status: deriveLocationStatus({
            address: (row[2] || "").toString(),
            latitude: parseOptionalNumber(row[3]),
            longitude: parseOptionalNumber(row[4]),
          }),
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
    const updateRange = `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:J${rowNumber}`;

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
      payload.companyId !== undefined
        ? payload.companyId.trim()
        : existingRow[5] || "",
      existingRow[6] || "", // G: CreatedBy (preserved)
      existingRow[7] || "", // H: CreatedAt (preserved)
      existingRow[8] || "", // I: UpdatedBy (preserved)
      existingRow[9] || "", // J: UpdatedAt (preserved)
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedValues] },
    });

    const updated = {
      id: payload.id,
      locationId: updatedValues[0],
      locationName: updatedValues[1],
      address: updatedValues[2],
      latitude: parseOptionalNumber(updatedValues[3]),
      longitude: parseOptionalNumber(updatedValues[4]),
      companyId: updatedValues[5] || undefined,
    };
    return {
      ...updated,
      status: deriveLocationStatus(updated),
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
      const updateRange = `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:J${rowNumber}`;
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
        payload.companyId !== undefined
          ? payload.companyId.trim()
          : existingRow[5] || "",
        existingRow[6] || "", // G: CreatedBy (preserved)
        existingRow[7] || "", // H: CreatedAt (preserved)
        existingRow[8] || "", // I: UpdatedBy (preserved)
        existingRow[9] || "", // J: UpdatedAt (preserved)
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [updatedValues],
        },
      });

      const result = {
        id: `location_${rowNumber}`,
        locationId: updatedValues[0] as string,
        locationName: updatedValues[1] as string,
        address: updatedValues[2] as string,
        latitude: parseOptionalNumber(updatedValues[3]),
        longitude: parseOptionalNumber(updatedValues[4]),
        companyId: (updatedValues[5] as string) || undefined,
      };
      return {
        ...result,
        status: deriveLocationStatus(result),
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
      (payload.companyId || "").trim(),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRowValues],
      },
    });

    const result = {
      id: `location_${newRowNumber}`,
      locationId,
      locationName: newRowValues[1] as string,
      address: newRowValues[2] as string,
      latitude: parseOptionalNumber(newRowValues[3]),
      longitude: parseOptionalNumber(newRowValues[4]),
      companyId: (newRowValues[5] as string) || undefined,
    };
    return {
      ...result,
      status: deriveLocationStatus(result),
    };
  } catch (error) {
    console.error(
      `Failed to create location address row in Google Sheets:`,
      error,
    );
    throw error;
  }
}
function strOf(value: unknown): string {
  return (value ?? "").toString().trim();
}

/**
 * Resolves where a company's location row lives WITHOUT ever guessing on an
 * ambiguous name match:
 *   - CompanyId (col F) match → { kind: "match", index } (exact identity)
 *   - a UNIQUE LocationName (col B, case-insensitive) match → { kind: "match", index }
 *   - zero name matches                     → { kind: "append" }
 *   - MULTIPLE rows share that name         → { kind: "ambiguous" } (never link)
 */
function resolveCompanyLocationTarget(
  rows: unknown[][],
  companyId: string,
  companyName: string,
): { kind: "match"; index: number } | { kind: "append" } | { kind: "ambiguous" } {
  const id = (companyId || "").trim();
  if (id) {
    const byId = rows.findIndex((row) => strOf(row[5]) === id);
    if (byId >= 0) return { kind: "match", index: byId };
  }
  const name = (companyName || "").trim().toLowerCase();
  if (!name) return { kind: "append" };
  const nameMatches = rows
    .map((row, index) => ({ index, name: strOf(row[1]).toLowerCase() }))
    .filter((r) => r.name === name);
  if (nameMatches.length === 1) return { kind: "match", index: nameMatches[0].index };
  if (nameMatches.length > 1) return { kind: "ambiguous" };
  return { kind: "append" };
}

/** Retries a Sheets write on the per-minute quota (429 / "quota exceeded"). */
async function withSheetWriteQuotaRetry<T>(fn: () => Promise<T>): Promise<T> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuota =
        error?.response?.status === 429 ||
        /quota/i.test(String(error?.message || ""));
      if (!isQuota) throw error;
      if (attempt < 2) await sleep(70_000 * (attempt + 1));
    }
  }
  throw new Error("Quota retries exhausted — try again shortly.");
}
/**
 * Auto-provisions (upserts) a LocationAddresses row for a newly-created
 * company. Sets only LocationName + CompanyId — Address/Latitude/Longitude are
 * deliberately left blank because that geodata is owned by the Location
 * Addresses page (Google-Maps address for FTI), not the billing address.
 *
 * Idempotent: re-provisioning the same company updates its existing row
 * (CompanyId match, or a unique name match on retry) and never appends a
 * duplicate. Never guesses on an ambiguous name — it appends a fresh shell
 * instead so no false CompanyId relationship is created.
 */
export async function provisionLocationFromCompany(company: {
  companyId: string;
  companyName: string;
}): Promise<LocationAddress | null> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
    });
    const rows = response.data.values || [];
    const target = resolveCompanyLocationTarget(
      rows,
      company.companyId,
      company.companyName,
    );
    const now = new Date().toISOString();

    if (target.kind === "match") {
      // Existing row → re-assert name + CompanyId; never touch geodata.
      const existing = rows[target.index];
      const rowNumber = target.index + 2;
      const updatedValues = [
        existing[0] || "", // A: LocationId
        (company.companyName || "").trim() || existing[1] || "", // B: LocationName
        existing[2] || "", // C: Address (preserved)
        existing[3] || "", // D: Latitude (preserved)
        existing[4] || "", // E: Longitude (preserved)
        (company.companyId || "").trim() || existing[5] || "", // F: CompanyId
        existing[6] || "", // G: CreatedBy
        existing[7] || "", // H: CreatedAt
        existing[8] || "", // I: UpdatedBy
        existing[9] || "", // J: UpdatedAt
      ];
      await withSheetWriteQuotaRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:J${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [updatedValues] },
        }),
      );
      const result: LocationAddress = {
        id: `location_${rowNumber}`,
        locationId: strOf(updatedValues[0]),
        locationName: strOf(updatedValues[1]),
        address: strOf(updatedValues[2]),
        latitude: parseOptionalNumber(updatedValues[3]),
        longitude: parseOptionalNumber(updatedValues[4]),
        companyId: strOf(updatedValues[5]) || undefined,
        status: deriveLocationStatus({
          address: updatedValues[2],
          latitude: parseOptionalNumber(updatedValues[3]),
          longitude: parseOptionalNumber(updatedValues[4]),
        }),
      };
      return result;
    }

    if (target.kind === "ambiguous") {
      console.warn(
        `[provisionLocationFromCompany] Ambiguous LocationName "${company.companyName}" (${company.companyId}) — appending a new shell instead of guessing which row owns it.`,
      );
    }

    // Append a blank shell (needs_geocoding). Also the correct fallback when
    // the name is ambiguous: a fresh row bound by CompanyId, never a wrong link.
    const locationId = await generateLocationId(rows);
    const newRowValues = [
      locationId,
      (company.companyName || "").trim(),
      "",
      "",
      "",
      (company.companyId || "").trim(),
      "SYSTEM",
      now,
      "",
      "",
    ];
    await withSheetWriteQuotaRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: LOCATION_ADDRESSES_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [newRowValues] },
      }),
    );
    const newRowNumber = rows.length + 2;
    const result: LocationAddress = {
      id: `location_${newRowNumber}`,
      locationId,
      locationName: strOf(newRowValues[1]),
      address: strOf(newRowValues[2]),
      latitude: parseOptionalNumber(newRowValues[3]),
      longitude: parseOptionalNumber(newRowValues[4]),
      companyId: strOf(newRowValues[5]) || undefined,
      status: "needs_geocoding",
    };
    return result;
  } catch (error) {
    console.error(
      "Failed to provision location row for company in Google Sheets:",
      error,
    );
    throw error;
  }
}
/**
 * Propagates a company rename to its linked LocationAddresses row — name only,
 * never touching Address/Latitude/Longitude. Idempotent: CompanyId match wins on
 * an existing row, else uses a unique name match; if none exists it provisions
 * a shell. Skips (without guessing) when the name is ambiguous.
 */
export async function syncLocationNameFromCompany(company: {
  companyId: string;
  companyName: string;
}): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
    });
    const rows = response.data.values || [];
    const target = resolveCompanyLocationTarget(
      rows,
      company.companyId,
      company.companyName,
    );

    if (target.kind === "append") {
      await provisionLocationFromCompany(company);
      return;
    }
    if (target.kind === "ambiguous") {
      console.warn(
        `[syncLocationNameFromCompany] Ambiguous LocationName "${company.companyName}" (${company.companyId}) — skipping name sync; not linking by guess.`,
      );
      return;
    }

    const existing = rows[target.index];
    const rowNumber = target.index + 2;
    const updatedValues = [
      existing[0] || "", // A: LocationId
      (company.companyName || "").trim() || existing[1] || "", // B: LocationName
      existing[2] || "", // C: Address (preserved)
      existing[3] || "", // D: Latitude (preserved)
      existing[4] || "", // E: Longitude (preserved)
      existing[5] || "", // F: CompanyId (preserved)
      existing[6] || "", // G: CreatedBy
      existing[7] || "", // H: CreatedAt
      existing[8] || "", // I: UpdatedBy
      existing[9] || "", // J: UpdatedAt
    ];
    await withSheetWriteQuotaRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${LOCATION_ADDRESSES_SHEET}!A${rowNumber}:J${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [updatedValues] },
      }),
    );
  } catch (error) {
    console.error(
      "Failed to sync location name for company in Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * Detaches a deleted company from LocationAddresses: clears the CompanyId link
 * (col F) on every matching row, leaving the location itself (and any FTI
 * history) intact. Returns the number of rows detached.
 */
export async function detachCompanyFromLocations(
  companyId: string,
): Promise<number> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LOCATION_ADDRESSES_RANGE,
    });
    const rows = response.data.values || [];
    const id = (companyId || "").trim();
    const matches = rows
      .map((row, index) => ({ rowNumber: index + 2, link: strOf(row[5]) }))
      .filter((r) => r.link === id);
    if (matches.length === 0) return 0;

    for (const match of matches) {
      await withSheetWriteQuotaRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${LOCATION_ADDRESSES_SHEET}!F${match.rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[""]] },
        }),
      );
    }
    return matches.length;
  } catch (error) {
    console.error(
      "Failed to detach company from locations in Google Sheets:",
      error,
    );
    throw error;
  }
}