// Pure rules for inactive-product usages and duplicate-product replacement.
// One scope table per document type decides what is in progress, what can be
// swapped automatically, and what an admin has to handle by hand.

import { effectiveContractStatus } from "../contractStatus.ts";
import {
  ReplacementInputError,
  type CellEdit,
  type ProductUsage,
  type ReplacementPlan,
  type ReplacementSnapshot,
  type SalesOrderEdit,
  type SnapshotProduct,
  type UsageDocumentType,
} from "./types.ts";

const OPEN_SO_STATUSES = new Set(["DRAFT", "CONFIRMED", "ON_HOLD"]);
const EDITABLE_QUOTATION_STATUSES = new Set(["DRAFT", "SAVED"]);
/** Any PO that is neither a draft nor finished has gone to the supplier (created, approved, printed, ...). */
const FINISHED_PO_STATUSES = new Set(["completed", "cancelled", "deleted"]);

const q = encodeURIComponent;
/** Where each usage opens: the record itself, or its list filtered down to it. */
const HREF: Record<UsageDocumentType, (id: string, no: string, productId: string) => string> = {
  contract: (id) => `/dashboard/customer-contracts?contract=${q(id)}`,
  salesOrder: (id) => `/dashboard/sales-orders/${q(id)}`,
  purchaseRequest: (_id, no) => (no.startsWith("AIC-PR-") ? `/dashboard/purchase-requests?q=${q(no)}` : "/dashboard/purchase-requests"),
  quotation: (_id, no) => `/dashboard/quotations?q=${q(no)}`,
  purchaseOrder: (_id, no) => `/dashboard/purchase-orders?q=${q(no)}`,
  customerPrice: () => "/dashboard/customer-prices",
  supplierProduct: (_id, _no, productId) => `/dashboard/supplier-products?productId=${q(productId)}`,
};

/** A usage before a replacement target is known; `apply` builds its edits once one is. */
interface Candidate {
  usage: Omit<ProductUsage, "productCode" | "productName">;
  apply?: (to: SnapshotProduct, ctx: PlanContext) => "changed" | "conflict" | { skip: string };
}

interface PlanContext {
  edits: CellEdit[];
  salesOrderEdits: Map<string, SalesOrderEdit>;
  bumpedPrs: Set<string>;
  actor: string;
  nowIso: string;
  /** customerId → has (or will have) an active price on the target. */
  customersWithTargetPrice: Set<string>;
  suppliersWithTargetOffering: Map<string, string>;
}

const usage = (
  documentType: UsageDocumentType, productId: string, documentId: string, documentNo: string, partyName: string, lineLabel: string,
  disposition: ProductUsage["disposition"] = "replaceable", reason = "",
): Candidate["usage"] => ({
  documentType, productId, documentId, documentNo, partyName, lineLabel, disposition, reason,
  href: HREF[documentType](documentId, documentNo, productId),
});

function edit(ctx: PlanContext, sheet: string, rowNumber: number, column: string, oldValue: unknown, newValue: unknown) {
  ctx.edits.push({ sheet, rowNumber, column, oldValue: String(oldValue ?? ""), newValue: String(newValue ?? "") });
}

function collectCandidates(snapshot: ReplacementSnapshot, productIds: ReadonlySet<string>, today: string): Candidate[] {
  const hits = (productId: string) => Boolean(productId) && productIds.has(productId);
  const out: Candidate[] = [];

  const contracts = new Map(snapshot.contracts.map((c) => [c.id, c]));
  for (const item of snapshot.contractItems) {
    const contract = contracts.get(item.contractId);
    if (!hits(item.productId) || item.status !== "Active" || !contract) continue;
    if (effectiveContractStatus({ status: contract.status as never, endDate: contract.endDate, agreementType: contract.agreementType as never }, today) !== "Active") continue;
    out.push({
      usage: usage("contract", item.productId, contract.id, contract.id, contract.companyName, ""),
      apply: (to, ctx) => {
        edit(ctx, "ContractItems", item.rowNumber, "C", item.productId, to.productId);
        edit(ctx, "ContractItems", item.rowNumber, "D", item.productCode, to.productCode);
        return "changed";
      },
    });
  }

  const orders = new Map(snapshot.salesOrders.map((o) => [o.salesOrderId, o]));
  for (const item of snapshot.salesOrderItems) {
    const order = orders.get(item.salesOrderId);
    if (!hits(item.productId) || !order || !OPEN_SO_STATUSES.has(order.orderStatus) || item.lineStatus !== "ACTIVE") continue;
    const done = item.quantity !== null && item.fulfilledQty + item.cancelledQty >= item.quantity;
    if (done) continue;
    const label = `Line ${item.lineNo}`;
    const docNo = order.salesOrderNo || "Draft order";
    if (item.fulfilledQty > 0) {
      out.push({ usage: usage("salesOrder", item.productId, order.salesOrderId, docNo, order.customerName, label, "needs_manual", "partially delivered") });
      continue;
    }
    out.push({
      usage: usage("salesOrder", item.productId, order.salesOrderId, docNo, order.customerName, label),
      apply: (_to, ctx) => {
        const existing = ctx.salesOrderEdits.get(order.salesOrderId);
        if (existing) existing.itemIds.push(item.salesOrderItemId);
        else ctx.salesOrderEdits.set(order.salesOrderId, { salesOrderId: order.salesOrderId, expectedVersion: order.version, itemIds: [item.salesOrderItemId] });
        return "changed";
      },
    });
  }

  const prs = new Map(snapshot.purchaseRequests.map((p) => [p.prId, p]));
  const linkedQty = new Map<string, number>();
  for (const link of snapshot.prLinks) linkedQty.set(link.prItemId, (linkedQty.get(link.prItemId) ?? 0) + link.quantity);
  for (const item of snapshot.prItems) {
    const pr = prs.get(item.prId);
    if (!hits(item.productId) || !pr || pr.status === "CANCELLED") continue;
    const linked = linkedQty.get(item.prItemId) ?? 0;
    const remaining = item.quantity - linked - item.fromStockQty - item.cancelledQty;
    if (remaining <= 0) continue;
    const docNo = pr.prNo || "Draft request";
    const label = `Line ${item.lineNo}`;
    if (linked > 0 || item.fromStockQty > 0) {
      out.push({ usage: usage("purchaseRequest", item.productId, pr.prId, docNo, pr.customerName, label, "needs_manual", "already on a PO or taken from stock") });
      continue;
    }
    out.push({
      usage: usage("purchaseRequest", item.productId, pr.prId, docNo, pr.customerName, label),
      apply: (to, ctx) => {
        edit(ctx, "PurchaseRequestItems", item.rowNumber, "D", item.productId, to.productId);
        edit(ctx, "PurchaseRequestItems", item.rowNumber, "E", item.productCode, to.productCode);
        edit(ctx, "PurchaseRequestItems", item.rowNumber, "F", item.productName, to.productName);
        edit(ctx, "PurchaseRequestItems", item.rowNumber, "V", "", ctx.nowIso);
        edit(ctx, "PurchaseRequestItems", item.rowNumber, "W", "", ctx.actor);
        if (!ctx.bumpedPrs.has(pr.prId)) {
          ctx.bumpedPrs.add(pr.prId);
          edit(ctx, "PurchaseRequests", pr.rowNumber, "O", pr.version, pr.version + 1);
          edit(ctx, "PurchaseRequests", pr.rowNumber, "R", "", ctx.nowIso);
          edit(ctx, "PurchaseRequests", pr.rowNumber, "S", "", ctx.actor);
        }
        return "changed";
      },
    });
  }

  const quotations = new Map(snapshot.quotations.map((q) => [q.quotationNo, q]));
  for (const detail of snapshot.quotationDetails) {
    const quotation = quotations.get(detail.quotationNo);
    if (!hits(detail.productId) || !quotation) continue;
    if (quotation.status === "SENT") {
      out.push({ usage: usage("quotation", detail.productId, quotation.quotationNo, quotation.quotationNo, quotation.customerName, "", "needs_manual", "already sent to customer") });
      continue;
    }
    if (!EDITABLE_QUOTATION_STATUSES.has(quotation.status)) continue;
    out.push({
      usage: usage("quotation", detail.productId, quotation.quotationNo, quotation.quotationNo, quotation.customerName, ""),
      apply: (to, ctx) => {
        edit(ctx, "QuotationDetails", detail.rowNumber, "B", detail.productId, to.productId);
        edit(ctx, "QuotationDetails", detail.rowNumber, "C", detail.productCode, to.productCode);
        return "changed";
      },
    });
  }

  const pos = new Map(snapshot.purchaseOrders.map((p) => [p.poNumber, p]));
  for (const item of snapshot.poItems) {
    const po = pos.get(item.poNumber);
    if (!hits(item.productId) || !po) continue;
    const status = po.status.toLowerCase();
    const label = `Item ${item.itemNo}`;
    if (FINISHED_PO_STATUSES.has(status)) continue;
    if (status !== "draft") {
      out.push({ usage: usage("purchaseOrder", item.productId, po.poNumber, po.poNumber, po.supplierName, label, "needs_manual", "already sent to supplier") });
      continue;
    }
    out.push({
      usage: usage("purchaseOrder", item.productId, po.poNumber, po.poNumber, po.supplierName, label),
      apply: (to, ctx) => {
        if (item.supplierProductId) {
          const offering = ctx.suppliersWithTargetOffering.get(po.supplierId);
          if (!offering) return { skip: "supplier has no offering for the replacement" };
          edit(ctx, "PurchaseOrderItems", item.rowNumber, "C", item.supplierProductId, offering);
        }
        edit(ctx, "PurchaseOrderItems", item.rowNumber, "D", item.productId, to.productId);
        return "changed";
      },
    });
  }

  for (const price of snapshot.customerPrices) {
    if (!hits(price.productId) || price.status !== "active") continue;
    out.push({
      usage: usage("customerPrice", price.productId, price.id, price.customerName || price.customerId, "", String(price.pricePerUnit)),
      apply: (to, ctx) => {
        if (ctx.customersWithTargetPrice.has(price.customerId)) {
          edit(ctx, "CustomerPrices", price.rowNumber, "H", price.status, "inactive");
          edit(ctx, "CustomerPrices", price.rowNumber, "K", "", ctx.nowIso);
          edit(ctx, "CustomerPrices", price.rowNumber, "L", "", ctx.actor);
          return "conflict";
        }
        ctx.customersWithTargetPrice.add(price.customerId);
        edit(ctx, "CustomerPrices", price.rowNumber, "C", price.productId, to.productId);
        return "changed";
      },
    });
  }

  for (const offering of snapshot.supplierProducts) {
    if (!hits(offering.productId) || offering.status !== "active") continue;
    out.push({
      usage: usage("supplierProduct", offering.productId, offering.id, offering.supplierName || offering.supplierId, "", ""),
      apply: (to, ctx) => {
        if (ctx.suppliersWithTargetOffering.has(offering.supplierId)) {
          edit(ctx, "SupplierProducts", offering.rowNumber, "I", offering.status, "inactive");
          edit(ctx, "SupplierProducts", offering.rowNumber, "L", "", ctx.nowIso);
          edit(ctx, "SupplierProducts", offering.rowNumber, "M", "", ctx.actor);
          return "conflict";
        }
        ctx.suppliersWithTargetOffering.set(offering.supplierId, offering.id);
        edit(ctx, "SupplierProducts", offering.rowNumber, "B", offering.productId, to.productId);
        return "changed";
      },
    });
  }

  return out;
}

function withProduct(products: Map<string, SnapshotProduct>, u: Candidate["usage"]): ProductUsage {
  const product = products.get(u.productId);
  return { ...u, productCode: product?.productCode ?? "", productName: product?.productName ?? "" };
}

/** Every in-progress document line that still uses an inactive product. */
export function findUsages(snapshot: ReplacementSnapshot, today: string): ProductUsage[] {
  const products = new Map(snapshot.products.map((p) => [p.productId, p]));
  const inactive = new Set(snapshot.products.filter((p) => p.status === "inactive").map((p) => p.productId));
  return collectCandidates(snapshot, inactive, today).map((c) => withProduct(products, c.usage));
}

/** Works out every edit needed to swap `fromProductId` for `toProductId`, without writing anything. */
export function planReplacement(
  snapshot: ReplacementSnapshot, fromProductId: string, toProductId: string, today: string, actor: string, nowIso: string,
): ReplacementPlan {
  const products = new Map(snapshot.products.map((p) => [p.productId, p]));
  const from = products.get(fromProductId);
  const to = products.get(toProductId);
  if (!from) throw new ReplacementInputError(`Product ${fromProductId} was not found.`);
  if (!to) throw new ReplacementInputError(`Replacement product ${toProductId} was not found.`);
  if (from.productId === to.productId) throw new ReplacementInputError("A product cannot replace itself.");
  if (to.status !== "active") throw new ReplacementInputError(`Replacement product ${to.productCode} is inactive.`);

  const ctx: PlanContext = {
    edits: [], salesOrderEdits: new Map(), bumpedPrs: new Set(), actor, nowIso,
    customersWithTargetPrice: new Set(snapshot.customerPrices.filter((p) => p.productId === to.productId && p.status === "active").map((p) => p.customerId)),
    suppliersWithTargetOffering: new Map(snapshot.supplierProducts.filter((p) => p.productId === to.productId && p.status === "active").map((p) => [p.supplierId, p.id])),
  };
  const candidates = collectCandidates(snapshot, new Set([from.productId]), today);
  // Price lists first, so a draft PO line sees an offering that this run moves onto the kept product.
  const order = (c: Candidate) => (c.usage.documentType === "customerPrice" || c.usage.documentType === "supplierProduct" ? 0 : 1);
  candidates.sort((a, b) => order(a) - order(b));

  const changes: ProductUsage[] = [];
  const skipped: ProductUsage[] = [];
  const conflicts: ProductUsage[] = [];
  for (const candidate of candidates) {
    const u = withProduct(products, candidate.usage);
    if (!candidate.apply) { skipped.push(u); continue; }
    const outcome = candidate.apply(to, ctx);
    if (outcome === "changed") changes.push(u);
    else if (outcome === "conflict") conflicts.push({ ...u, disposition: "needs_manual", reason: `already has an active entry on ${to.productCode}; this one is deactivated` });
    else skipped.push({ ...u, disposition: "needs_manual", reason: outcome.skip });
  }
  return { from, to, changes, skipped, conflicts, cellEdits: ctx.edits, salesOrderEdits: [...ctx.salesOrderEdits.values()] };
}
