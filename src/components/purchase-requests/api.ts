// Client helpers shared by the Purchase Request screens.
export type { EligibleSalesOrder, OpenPrLine, PrView } from "@/lib/purchaseRequests/service";

export async function prApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed.");
  return body as T;
}

const SO_STATUS_LABELS: Record<string, string> = { ON_HOLD: "On hold", CANCELLED: "Cancelled", CLOSED: "Closed", DRAFT: "Draft" };

/** Label for a Sales Order that is no longer Confirmed, or null when it is fine. */
export function salesOrderWarning(status: string): string | null {
  if (!status || status === "CONFIRMED") return null;
  return `SO ${SO_STATUS_LABELS[status] ?? status.toLowerCase()}`;
}
