// Client helpers shared by the Purchase Request screens.
export type { ContractDueView, EligibleContract, EligibleSalesOrder, OpenPrLine, PrView } from "@/lib/purchaseRequests/service";

export async function prApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed.");
  return body as T;
}

/** What a PR is for, for lists and headers: "SO …", "Contract …", or "—". */
export function prReferenceLabel(pr: { requestType: string; salesOrderNoSnapshot: string; contractNoSnapshot: string }): string {
  if (pr.requestType === "CONTRACT") return pr.contractNoSnapshot ? `Contract ${pr.contractNoSnapshot}` : "—";
  if (pr.requestType === "NONE") return "—";
  return pr.salesOrderNoSnapshot ? `SO ${pr.salesOrderNoSnapshot}` : "—";
}

/** "CODE — Name" for catalog lines, the name alone for typed items. */
export function lineName(line: { productCodeSnapshot: string; productNameSnapshot: string }): string {
  return line.productCodeSnapshot ? `${line.productCodeSnapshot} — ${line.productNameSnapshot}` : line.productNameSnapshot;
}

const SO_STATUS_LABELS: Record<string, string> = { ON_HOLD: "On hold", CANCELLED: "Cancelled", CLOSED: "Closed", DRAFT: "Draft" };

/** Label for a Sales Order that is no longer Confirmed, or null when it is fine. */
export function salesOrderWarning(status: string): string | null {
  if (!status || status === "CONFIRMED") return null;
  return `SO ${SO_STATUS_LABELS[status] ?? status.toLowerCase()}`;
}
