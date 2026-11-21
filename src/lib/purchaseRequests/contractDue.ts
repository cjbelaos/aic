// Pure "still due" calculation for filling a PR from a customer contract.
// Due = entitled − released in the item's current period. Quantity already on other PRs in
// that period is reported for the technician to see; it is NOT subtracted (Chris's call).
import type { ContractItem } from "../../types/contract.ts";
import type { ContractPeriodSummary } from "../../types/contract-release.ts";
import type { PurchaseRequest, PurchaseRequestItem } from "../../types/purchaseRequest.ts";

export interface ContractDueLine {
  contractItemId: string;
  productId: string;
  productCode: string;
  frequency: string;
  entitledQty: number;
  releasedQty: number;
  dueQty: number;
  alreadyRequested: { prNo: string; quantity: number }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Calendar period containing `today` (YYYY-MM-DD) for a contract item frequency. */
export function periodWindow(frequency: string, today: string): { start: string; end: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const span = (fromMonth: number, months: number) => {
    const toMonth = fromMonth + months - 1;
    return { start: `${year}-${pad(fromMonth)}-01`, end: `${year}-${pad(toMonth)}-${pad(lastDay(year, toMonth))}` };
  };
  switch (frequency) {
    case "Monthly": return span(month, 1);
    case "Quarterly": return span(Math.floor((month - 1) / 3) * 3 + 1, 3);
    case "Semi-Annual": return span(month <= 6 ? 1 : 7, 6);
    case "Annual": return span(1, 12);
    default: return { start: "0000-01-01", end: "9999-12-31" };
  }
}

export function computeContractDue(input: {
  items: ContractItem[];
  summaries: ContractPeriodSummary[];
  prs: PurchaseRequest[];
  prItems: PurchaseRequestItem[];
  today: string;
  excludePrId?: string;
}): ContractDueLine[] {
  const prById = new Map(input.prs.map((p) => [p.prId, p]));
  return input.items
    .filter((item) => item.status === "Active")
    .map((item) => {
      const summary = input.summaries.find((s) => s.contractItemId === item.id && s.periodStart <= input.today && input.today <= s.periodEnd);
      const window = summary ? { start: summary.periodStart, end: summary.periodEnd } : periodWindow(item.frequency, input.today);
      const releasedQty = summary?.releasedQty ?? 0;
      const alreadyRequested: ContractDueLine["alreadyRequested"] = [];
      for (const line of input.prItems) {
        if (line.contractItemId !== item.id || line.prId === input.excludePrId) continue;
        const pr = prById.get(line.prId);
        if (!pr || pr.status === "CANCELLED" || pr.requestedDate < window.start || pr.requestedDate > window.end) continue;
        const quantity = line.quantity - line.cancelledQty;
        if (quantity > 0) alreadyRequested.push({ prNo: pr.prNo || "Draft", quantity });
      }
      return {
        contractItemId: item.id, productId: item.productId ?? "", productCode: item.productCode, frequency: item.frequency,
        entitledQty: item.entitledQty, releasedQty, dueQty: Math.max(0, item.entitledQty - releasedQty), alreadyRequested,
      };
    });
}
