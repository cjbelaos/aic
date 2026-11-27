/**
 * What a saved scanned copy does to its Document Tracker entry. Pure, so it runs
 * in Node tests; the sheet writes live in documentHandoverSheets.ts.
 */

export type ScanReturnPlan = "return_both" | "verify_only" | "create" | "skip";

export type ScanReturnOutcome = "returned" | "created" | "already_returned" | "unassigned" | "not_permitted";

/**
 * Handed over → received and verified in one step; received → verified;
 * no entry → a new, already returned entry; returned or unassigned → unchanged.
 */
export function scanReturnPlan(status: string | undefined): ScanReturnPlan {
  if (status === undefined) return "create";
  const normalized = status.trim().toLowerCase();
  if (normalized === "handed_over") return "return_both";
  if (normalized === "received_by_after_sales") return "verify_only";
  return "skip";
}

/** Of several entries for one document, the one still open wins; otherwise the first. */
export function pickScanReturnEntry<T extends { status: string }>(entries: T[]): T | undefined {
  return entries.find((entry) => scanReturnPlan(entry.status) !== "skip") ?? entries[0];
}

export const SCAN_RETURN_NOTE = "Created from scanned copy upload";

/** A signed DR scan completes a DR that was issued (created or printed); other statuses are left alone. */
export function drCompletesOnScan(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "created" || normalized === "printed";
}
