import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { currentActor, inTransaction, isPostgresBackend, txQuery } from "@/lib/db/postgres";
import { sheetRowsForRange } from "@/lib/db/sheetRows";
import { ContractRelease } from "@/types/contract-release";

const RELEASES_SHEET = "ContractReleases";
const RELEASES_RANGE = `${RELEASES_SHEET}!A2:M`;
// Columns: A: ReleaseId, B: ContractItemId, C: ContractId, D: PeriodYear, E: PeriodMonth, F: PeriodQuarter, G: Frequency, H: ReleaseDate, I: Quantity, J: ReleasedBy, K: Remarks, L: Status, M: DRNo.

/**
 * GET: Fetches all releases, optionally filtered by contractItemId and period.
 */
export async function getContractReleases(
  contractItemId?: string,
  periodYear?: number,
  periodMonth?: number,
): Promise<ContractRelease[]> {
  try {
    const rows = isPostgresBackend()
      ? await sheetRowsForRange(RELEASES_RANGE)
      : (await (await getSheetsClient()).spreadsheets.values.get({ spreadsheetId: await getDatabaseSpreadsheetId(), range: RELEASES_RANGE })).data.values;
    if (!rows || rows.length === 0) return [];

    let releases: ContractRelease[] = rows
      .filter((row) => row[0] && row[0].startsWith("REL-"))
      .map((row) => ({
        id: row[0] || "",
        contractItemId: row[1] || "",
        contractId: row[2] || "",
        periodYear: parseInt(row[3] || "0", 10) || 0,
        periodMonth: parseInt(row[4] || "0", 10) || 0,
        periodQuarter: parseInt(row[5] || "0", 10) || 0,
        frequency: row[6] as ContractRelease["frequency"],
        releaseDate: row[7] || "",
        quantity: parseInt(row[8] || "0", 10) || 0,
        releasedBy: row[9] || "",
        remarks: row[10] || undefined,
        status: (row[11] as ContractRelease["status"]) || "Completed",
        drNumber: row[12] ? parseInt(row[12], 10) : undefined,
      }));

    if (contractItemId) {
      releases = releases.filter((r) => r.contractItemId === contractItemId);
    }
    if (periodYear) {
      releases = releases.filter((r) => r.periodYear === periodYear);
    }
    if (periodMonth) {
      releases = releases.filter((r) => r.periodMonth === periodMonth);
    }

    return releases;
  } catch (error) {
    console.error(
      "Failed to fetch contract releases from Google Sheets:",
      error,
    );
    throw error;
  }
}

/**
 * GET: Fetches releases for a specific period (contractItemId + year + month).
 */
export async function getReleasesForPeriod(
  contractItemId: string,
  periodYear: number,
  periodMonth: number,
): Promise<ContractRelease[]> {
  return getContractReleases(contractItemId, periodYear, periodMonth);
}

/**
 * POST: Appends a new release row.
 */
export async function addContractRelease(
  release: ContractRelease,
): Promise<ContractRelease> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RELEASES_RANGE,
    });
    const existingRows = existingResponse.data.values || [];

    // Find first empty row
    let firstEmptyRowIndex = existingRows.length;
    for (let i = 0; i < existingRows.length; i++) {
      if (
        !existingRows[i] ||
        existingRows[i].every((cell) => !cell || cell.trim() === "")
      ) {
        firstEmptyRowIndex = i;
        break;
      }
    }

    const rowNumber = firstEmptyRowIndex + 2;
    const updateRange = `${RELEASES_SHEET}!A${rowNumber}:M${rowNumber}`;

    const newRowValues = [
      release.id,
      release.contractItemId,
      release.contractId,
      release.periodYear.toString(),
      release.periodMonth.toString(),
      release.periodQuarter.toString(),
      release.frequency,
      release.releaseDate,
      release.quantity.toString(),
      release.releasedBy,
      release.remarks || "",
      release.status,
      release.drNumber?.toString() || "",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRowValues] },
    });

    return release;
  } catch (error) {
    console.error("Failed to add contract release to Google Sheets:", error);
    throw error;
  }
}

/**
 * Appends several release rows in one write. Callers hold the inventory lock
 * (POST /api/deliveries) so ids from generateReleaseId stay unique.
 */
export async function appendContractReleases(releases: ContractRelease[]): Promise<void> {
  if (!releases.length) return;
  if (isPostgresBackend()) return insertReleasesPg(releases);
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${RELEASES_SHEET}!A:M`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: releases.map((r) => [
        r.id, r.contractItemId, r.contractId, String(r.periodYear), String(r.periodMonth), String(r.periodQuarter),
        r.frequency, r.releaseDate, String(r.quantity), r.releasedBy, r.remarks || "", r.status, r.drNumber?.toString() || "",
      ]),
    },
  });
}

/**
 * Generates the next Release ID (REL-XXXX).
 */
export async function generateReleaseId(): Promise<string> {
  if (isPostgresBackend()) {
    // In the save's transaction, serialised so two saves cannot take the same REL number.
    return inTransaction(currentActor() ?? "system:release-id", async () => {
      await txQuery("select pg_advisory_xact_lock(hashtext('aic:release-id'))");
      const [{ max }] = await txQuery<{ max: number | null }>("select max(substring(release_id from 5)::int) as max from aic.contract_releases where release_id ~ '^REL-[0-9]+$'");
      return `REL-${String(Number(max ?? 0) + 1).padStart(4, "0")}`;
    });
  }
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RELEASES_RANGE,
    });

    const rows = response.data.values || [];
    const validRows = rows.filter((row) => row[0] && row[0].startsWith("REL-"));

    let maxNumber = 0;
    validRows.forEach((row) => {
      const id = row[0];
      if (id && id.startsWith("REL-")) {
        const num = parseInt(id.substring(4), 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    const nextNumber = maxNumber + 1;
    return `REL-${String(nextNumber).padStart(4, "0")}`;
  } catch (error) {
    console.error("Failed to generate release ID:", error);
    throw error;
  }
}

/** PostgreSQL: inserts release rows in the current (or a new) transaction. */
async function insertReleasesPg(releases: ContractRelease[]): Promise<void> {
  await inTransaction(currentActor() ?? "system:contract-release", async () => {
    for (const r of releases) {
      await txQuery(
        `insert into aic.contract_releases (release_id, contract_item_id, contract_id, period_year, period_month, period_quarter,
           frequency, release_date, quantity, released_by, remarks, status, dr_number)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [r.id, r.contractItemId || null, r.contractId || null, r.periodYear, r.periodMonth, r.periodQuarter, r.frequency,
          r.releaseDate || null, r.quantity, r.releasedBy, r.remarks || null, r.status, r.drNumber ?? null],
      );
    }
  });
}

/**
 * PostgreSQL: a deleted DR's live releases become "Deleted" (Sheets does the same inline in
 * deleteDeliveryReceipt). Cancelled or already-deleted releases are left as they are.
 */
export async function markDrReleasesDeleted(drNumber: number): Promise<void> {
  await inTransaction(currentActor() ?? "system:contract-release", () => txQuery(
    "update aic.contract_releases set status = 'Deleted' where dr_number = $1 and lower(coalesce(status, '')) not in ('deleted', 'cancelled')",
    [drNumber],
  ));
}
