// Pure Purchase Request rules. Nothing here touches Sheets: status, remaining and
// claimable quantities are always derived from PR lines + PO links + PO statuses,
// so editing, cancelling or deleting a PO can never leave a PR out of date.
import type {
  PoLineLinkInput,
  PrLineProgress,
  PrStatus,
  PurchaseRequest,
  PurchaseRequestItem,
  PurchaseRequestLink,
} from "../../types/purchaseRequest.ts";

/** PO statuses whose links do not count as ordered. */
export const NON_ORDERED_PO_STATUSES: ReadonlySet<string> = new Set(["draft", "cancelled", "deleted"]);

const PR_PREFIX = "AIC-PR-";

export function formatPrNo(year: string, n: number): string {
  return `${PR_PREFIX}${year}-${String(n).padStart(4, "0")}`;
}

/** Next number in the year of `date` (YYYY-MM-DD), based on existing PR numbers. */
export function nextPrNo(existing: string[], date: string): string {
  const year = /^\d{4}/.exec(date)?.[0] ?? String(new Date().getFullYear());
  const prefix = `${PR_PREFIX}${year}-`;
  const max = existing.reduce((n, no) => (no.startsWith(prefix) ? Math.max(n, Number.parseInt(no.slice(prefix.length), 10) || 0) : n), 0);
  return formatPrNo(year, max + 1);
}

const floor0 = (n: number) => Math.max(0, n);

export function deriveLineProgress(
  item: PurchaseRequestItem,
  links: PurchaseRequestLink[],
  poStatus: ReadonlyMap<string, string>,
): PrLineProgress {
  let orderedQty = 0;
  let onDraftQty = 0;
  const poNumbers = new Set<string>();
  for (const l of links) {
    if (l.prItemId !== item.prItemId) continue;
    const status = poStatus.get(l.poNumber);
    if (status === undefined) continue;
    if (status === "draft") onDraftQty += l.quantity;
    else if (!NON_ORDERED_PO_STATUSES.has(status)) {
      orderedQty += l.quantity;
      poNumbers.add(l.poNumber);
    }
  }
  const remaining = floor0(item.quantity - orderedQty - item.fromStockQty - item.cancelledQty);
  return {
    prItemId: item.prItemId,
    quantity: item.quantity,
    orderedQty,
    onDraftQty,
    fromStockQty: item.fromStockQty,
    cancelledQty: item.cancelledQty,
    remaining,
    claimable: floor0(remaining - onDraftQty),
    poNumbers: [...poNumbers].sort(),
  };
}

export function derivePrStatus(pr: Pick<PurchaseRequest, "status">, lines: PrLineProgress[]): PrStatus {
  if (pr.status === "DRAFT") return "DRAFT";
  if (pr.status === "CANCELLED") return "CANCELLED";
  const fulfilled = lines.some((l) => l.orderedQty > 0 || l.fromStockQty > 0);
  const touched = lines.some((l) => l.orderedQty > 0 || l.fromStockQty > 0 || l.cancelledQty > 0);
  const done = lines.length > 0 && lines.every((l) => l.remaining === 0);
  if (done) return fulfilled ? "COMPLETED" : "CANCELLED";
  return touched ? "PARTIAL" : "OPEN";
}

/** A PR can no longer be edited or cancelled as a whole once anything has been done with it. */
export function isPrLocked(lines: PrLineProgress[], links: PurchaseRequestLink[]): boolean {
  return links.length > 0 || lines.some((l) => l.fromStockQty > 0 || l.cancelledQty > 0);
}

export function validatePoLinks(input: {
  poNumber: string;
  items: { itemNo: number; productId?: string; quantity: number; prLinks?: PoLineLinkInput[] }[];
  prItems: PurchaseRequestItem[];
  prs: PurchaseRequest[];
  allLinks: PurchaseRequestLink[];
  poStatus: ReadonlyMap<string, string>;
}): string[] {
  const errors: string[] = [];
  const prItemById = new Map(input.prItems.map((i) => [i.prItemId, i]));
  const prById = new Map(input.prs.map((p) => [p.prId, p]));
  const otherLinks = input.allLinks.filter((l) => l.poNumber !== input.poNumber);
  const claimedHere = new Map<string, number>();
  const label = (i: PurchaseRequestItem) => `${prById.get(i.prId)?.prNo || i.prId} · ${i.productNameSnapshot || i.productCodeSnapshot}`;

  for (const line of input.items) {
    const links = line.prLinks ?? [];
    if (!links.length) continue;
    const linkedSum = links.reduce((s, l) => s + l.quantity, 0);
    if (line.quantity < linkedSum) {
      errors.push(`PO line ${line.itemNo}: quantity ${line.quantity} is less than the ${linkedSum} linked from purchase requests. Unlink PR lines first.`);
    }
    for (const l of links) {
      const prItem = prItemById.get(l.prItemId);
      if (!prItem) { errors.push(`PO line ${line.itemNo}: purchase request line "${l.prItemId}" was not found.`); continue; }
      const pr = prById.get(prItem.prId);
      if (!pr || pr.status !== "SUBMITTED") { errors.push(`${label(prItem)}: the purchase request is not open.`); continue; }
      if (!(l.quantity > 0)) { errors.push(`${label(prItem)}: linked quantity must be more than zero.`); continue; }
      if (!line.productId || line.productId !== prItem.productId) { errors.push(`PO line ${line.itemNo}: product does not match ${label(prItem)}.`); continue; }
      claimedHere.set(l.prItemId, (claimedHere.get(l.prItemId) ?? 0) + l.quantity);
    }
  }
  for (const [prItemId, qty] of claimedHere) {
    const prItem = prItemById.get(prItemId)!;
    const { claimable } = deriveLineProgress(prItem, otherLinks, input.poStatus);
    if (qty > claimable) errors.push(`${label(prItem)}: only ${claimable} left to order (this PO links ${qty}).`);
  }
  return errors;
}

export function validateFromStock(progress: PrLineProgress, qty: number): string | null {
  if (!(qty > 0)) return "Quantity from stock must be more than zero.";
  if (qty > progress.claimable) return `Only ${progress.claimable} left that is not already on a PO.`;
  return null;
}

export function validateCancelRemaining(progress: PrLineProgress, qty: number, reason: string): string | null {
  if (!reason.trim()) return "A reason is required to cancel a line.";
  if (!(qty > 0)) return "Quantity to cancel must be more than zero.";
  if (qty > progress.claimable) return `Only ${progress.claimable} left that is not already on a PO.`;
  return null;
}
