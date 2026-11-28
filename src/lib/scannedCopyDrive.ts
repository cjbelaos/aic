import type { drive_v3 } from "googleapis";
import { getCompanies } from "@/lib/companySheets";
import { driveFileIdFromLink, isReplacedFileName, manilaIsoDate, replacedFileName } from "@/lib/scannedCopyFileName";

/** The name the app shows in the Customer column: company name, else the stored id. */
export async function scanCustomerName(companyId: string): Promise<string> {
  const company = (await getCompanies()).find((c) => c.companyId === companyId || c.id === companyId);
  return company?.companyName || companyId;
}

/**
 * Renames the scan being replaced to `{name} (replaced YYYY-MM-DD)` so it stays in Drive
 * but can't be mistaken for the current copy. Never throws: returns a warning instead.
 * `onlyIfNamePrefix` guards legacy links that may point at a generated PDF, not a scan.
 */
export async function markReplacedScan(
  drive: drive_v3.Drive,
  link: string | undefined,
  options: { onlyIfNamePrefix?: string } = {},
): Promise<string | undefined> {
  const fileId = link ? driveFileIdFromLink(link) : null;
  if (!fileId) return undefined;
  try {
    const file = await drive.files.get({ fileId, fields: "name,trashed", supportsAllDrives: true });
    const name = file.data.name || "";
    if (file.data.trashed || isReplacedFileName(name)) return undefined;
    if (options.onlyIfNamePrefix && !name.startsWith(options.onlyIfNamePrefix)) return undefined;
    await drive.files.update({ fileId, requestBody: { name: replacedFileName(name, manilaIsoDate()) }, supportsAllDrives: true });
    return undefined;
  } catch (error) {
    console.warn("Could not rename the replaced scan:", error);
    return "Scan saved, but the old scanned copy in Drive could not be marked as replaced.";
  }
}

export function noDateWarning(label: string): string {
  return `Scan saved, but the ${label} has no date, so its file is named with today's date.`;
}
