export const CONTRACT_ID_PATTERN = /^CTR-(\d+)$/i;

export class ContractConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractConflictError";
  }
}

export function nextContractId(ids: string[], width = 4): string {
  const max = ids.reduce((highest, value) => {
    const match = CONTRACT_ID_PATTERN.exec(String(value).trim());
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest;
  }, 0);
  return `CTR-${String(max + 1).padStart(width, "0")}`;
}

export function duplicateContractIds(ids: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of ids) {
    const id = String(value).trim();
    if (!CONTRACT_ID_PATTERN.test(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
}

const INACTIVE_RELEASE_STATUSES = new Set(["deleted", "cancelled"]);

/**
 * Why a contract can't be deleted, or null when it can. Deleting removes the
 * contract row for good, so it is refused while invoices were billed against
 * it (ServiceInvoices/SalesInvoices column K) or live releases still point at
 * it (ContractReleases column C, status column L).
 */
export function contractDeleteBlocker(
  contractId: string,
  { invoiceRows, releaseRows }: { invoiceRows: unknown[][]; releaseRows: unknown[][] },
): string | null {
  const id = contractId.trim();
  const invoices = [...new Set(invoiceRows
    .filter((row) => String(row[10] ?? "").trim() === id)
    .map((row) => String(row[0] ?? "").trim())
    .filter(Boolean))];
  const releases = releaseRows.filter((row) =>
    String(row[2] ?? "").trim() === id && !INACTIVE_RELEASE_STATUSES.has(String(row[11] ?? "").trim().toLowerCase()));
  const reasons: string[] = [];
  if (invoices.length) {
    const shown = invoices.slice(0, 5).join(", ");
    reasons.push(`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} (${shown}${invoices.length > 5 ? ", …" : ""})`);
  }
  if (releases.length) reasons.push(`${releases.length} release${releases.length === 1 ? "" : "s"}`);
  return reasons.length
    ? `${id} can't be deleted because ${reasons.join(" and ")} still reference it. Change its status instead.`
    : null;
}
