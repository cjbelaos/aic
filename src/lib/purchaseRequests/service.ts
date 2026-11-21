import { isAdminRole } from "@/lib/auth/session";
import { withInventoryLock } from "@/lib/inventory/lock";
import { getProductsOnly } from "@/lib/productSheets";
import { getProductUnits } from "@/lib/productReferenceSheets";
import { readSalesOrderListSnapshot } from "@/lib/salesOrders/repository";
import {
  deriveLineProgress,
  derivePrStatus,
  isPrLocked,
  nextPrNo,
  validateCancelRemaining,
  validateFromStock,
} from "@/lib/purchaseRequests/domain";
import {
  allocateIds,
  readPoStatusMap,
  readPurchaseRequestSnapshot,
  replacePurchaseRequestItems,
  savePurchaseRequestRow,
  updatePurchaseRequestItemRow,
} from "@/lib/purchaseRequests/sheets";
import type { SalesOrder, SalesOrderItem } from "@/types/salesOrder";
import type { PrLineProgress, PrStatus, PurchaseRequest, PurchaseRequestItem, PurchaseRequestLink } from "@/types/purchaseRequest";
import type { SessionUser } from "@/types/user";

export interface PrView extends PurchaseRequest {
  derivedStatus: PrStatus;
  salesOrderStatus: string;
  lines: (PurchaseRequestItem & PrLineProgress)[];
  poNumbers: string[];
  locked: boolean;
}

export interface PrDraftInput {
  salesOrderId: string;
  neededByDate: string;
  purpose: string;
  version?: number;
  items: { productId: string; quantity: number; salesOrderItemId?: string; remarks?: string }[];
}

export interface EligibleSalesOrder {
  salesOrderId: string;
  salesOrderNo: string;
  customerName: string;
  quotationNo: string;
  deliveryAddress: string;
  lines: { salesOrderItemId: string; lineNo: number; productId: string; productCode: string; productName: string; unitId: string; unit: string; quantity: number | null }[];
}

export interface OpenPrLine {
  prId: string;
  prNo: string;
  prItemId: string;
  salesOrderNo: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  claimable: number;
  salesOrderStatus: string;
}

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

type Snapshot = Awaited<ReturnType<typeof readPurchaseRequestSnapshot>>;

function buildView(pr: PurchaseRequest, snap: Snapshot, poStatus: ReadonlyMap<string, string>, soStatus: ReadonlyMap<string, string>): PrView {
  const items = snap.items.filter((i) => i.prId === pr.prId).sort((a, b) => a.lineNo - b.lineNo);
  const links = snap.links.filter((l) => l.prId === pr.prId);
  const lines = items.map((i) => ({ ...i, ...deriveLineProgress(i, links, poStatus) }));
  return {
    ...pr,
    derivedStatus: derivePrStatus(pr, lines),
    salesOrderStatus: soStatus.get(pr.salesOrderId) ?? "",
    lines,
    poNumbers: [...new Set(lines.flatMap((l) => l.poNumbers))].sort(),
    locked: isPrLocked(lines, links),
  };
}

async function loadContext() {
  const [snap, poStatus, so] = await Promise.all([readPurchaseRequestSnapshot(), readPoStatusMap(), readSalesOrderListSnapshot()]);
  const soStatus = new Map(so.orders.map((o) => [o.salesOrderId, o.orderStatus]));
  return { snap, poStatus, so, soStatus };
}

async function viewOf(prId: string): Promise<PrView> {
  const { snap, poStatus, soStatus } = await loadContext();
  const pr = snap.prs.find((p) => p.prId === prId);
  if (!pr) throw httpError(404, "Purchase request not found.");
  return buildView(pr, snap, poStatus, soStatus);
}

const canSeeDraft = (pr: PurchaseRequest, session: SessionUser) => pr.requestedByUserId === session.userId || isAdminRole(session.userRoleId);

export async function listPurchaseRequests(session: SessionUser): Promise<PrView[]> {
  const { snap, poStatus, soStatus } = await loadContext();
  return snap.prs
    .filter((pr) => pr.status !== "DRAFT" || canSeeDraft(pr, session))
    .map((pr) => buildView(pr, snap, poStatus, soStatus))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getPurchaseRequest(prId: string, session: SessionUser): Promise<PrView> {
  const view = await viewOf(prId);
  if (view.status === "DRAFT" && !canSeeDraft(view, session)) throw httpError(404, "Purchase request not found.");
  return view;
}

function requireConfirmed(so: { orders: SalesOrder[] }, salesOrderId: string): SalesOrder {
  const order = so.orders.find((o) => o.salesOrderId === salesOrderId);
  if (!order) throw httpError(400, "Sales order not found.");
  if (order.orderStatus !== "CONFIRMED") throw httpError(400, `Sales order ${order.salesOrderNo} is ${order.orderStatus.toLowerCase().replace("_", " ")}; only confirmed sales orders can have purchase requests.`);
  return order;
}

async function buildItems(input: PrDraftInput, prId: string, existingIds: string[], soItems: SalesOrderItem[], actor: string, now: string): Promise<PurchaseRequestItem[]> {
  if (!input.items?.length) throw httpError(400, "Add at least one item.");
  const [products, units] = await Promise.all([getProductsOnly(), getProductUnits()]);
  const productById = new Map(products.map((p) => [p.productId, p]));
  const unitById = new Map(units.map((u) => [u.unitId, u]));
  const ids = allocateIds("PRI", existingIds, input.items.length);
  return input.items.map((line, index) => {
    const product = productById.get(String(line.productId ?? ""));
    if (!product) throw httpError(400, `Line ${index + 1}: product not found.`);
    if (product.status !== "active") throw httpError(400, `Line ${index + 1}: product ${product.productCode} is inactive.`);
    const quantity = Number(line.quantity);
    if (!(quantity > 0)) throw httpError(400, `Line ${index + 1}: quantity must be more than zero.`);
    const salesOrderItemId = String(line.salesOrderItemId ?? "").trim();
    if (salesOrderItemId && !soItems.some((s) => s.salesOrderItemId === salesOrderItemId)) throw httpError(400, `Line ${index + 1}: the sales order line it is for was not found.`);
    const unit = unitById.get(product.unitId);
    return {
      prItemId: ids[index], prId, lineNo: index + 1, productId: product.productId, productCodeSnapshot: product.productCode,
      productNameSnapshot: product.productName, unitId: product.unitId, unitSnapshot: unit?.unitName || unit?.unitCode || "",
      quantity, salesOrderItemId, remarks: String(line.remarks ?? "").trim(),
      fromStockQty: 0, fromStockNote: "", fromStockBy: "", fromStockAt: "", cancelledQty: 0, cancelReason: "", cancelledBy: "", cancelledAt: "",
      createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
    };
  });
}

function soSnapshot(order: SalesOrder) {
  return {
    salesOrderId: order.salesOrderId, salesOrderNoSnapshot: order.salesOrderNo, customerNameSnapshot: order.customerNameSnapshot,
    quotationNoSnapshot: order.quotationNo, deliveryAddressSnapshot: order.deliveryAddressSnapshot,
  };
}

export async function createPurchaseRequest(input: PrDraftInput, session: SessionUser): Promise<PrView> {
  const prId = await withInventoryLock(async () => {
    const { snap, so } = await loadContext();
    const order = requireConfirmed(so, String(input.salesOrderId ?? ""));
    const now = new Date().toISOString();
    const [prId] = allocateIds("PR", snap.prs.map((p) => p.prId), 1);
    const items = await buildItems(input, prId, snap.items.map((i) => i.prItemId), so.items.filter((i) => i.salesOrderId === order.salesOrderId), session.userId, now);
    const pr: PurchaseRequest = {
      prId, prNo: "", status: "DRAFT", ...soSnapshot(order), requestedByUserId: session.userId, requestedByName: session.fullName,
      requestedDate: manilaToday(), neededByDate: String(input.neededByDate ?? "").trim(), purpose: String(input.purpose ?? "").trim(),
      cancelReason: "", version: 1, createdAt: now, createdBy: session.userId, updatedAt: now, updatedBy: session.userId,
    };
    await savePurchaseRequestRow(pr);
    await replacePurchaseRequestItems(prId, items);
    return prId;
  });
  return viewOf(prId);
}

function requireEditable(view: PrView, session: SessionUser, version?: number) {
  if (view.requestedByUserId !== session.userId && !isAdminRole(session.userRoleId)) throw httpError(403, "Only the requester or an admin can change this purchase request.");
  if (view.status === "CANCELLED") throw httpError(409, "This purchase request is cancelled.");
  if (view.locked) throw httpError(409, "This PR already has POs or stock marks and can no longer be edited.");
  if (version !== undefined && version !== view.version) throw httpError(409, "This purchase request was changed by someone else. Reload and try again.");
}

export async function updatePurchaseRequest(prId: string, input: PrDraftInput, session: SessionUser): Promise<PrView> {
  await withInventoryLock(async () => {
    const { snap, poStatus, so, soStatus } = await loadContext();
    const pr = snap.prs.find((p) => p.prId === prId);
    if (!pr) throw httpError(404, "Purchase request not found.");
    requireEditable(buildView(pr, snap, poStatus, soStatus), session, input.version);
    const order = requireConfirmed(so, String(input.salesOrderId ?? ""));
    const now = new Date().toISOString();
    const items = await buildItems(input, prId, snap.items.map((i) => i.prItemId), so.items.filter((i) => i.salesOrderId === order.salesOrderId), session.userId, now);
    await savePurchaseRequestRow({ ...pr, ...soSnapshot(order), neededByDate: String(input.neededByDate ?? "").trim(), purpose: String(input.purpose ?? "").trim(), version: pr.version + 1, updatedAt: now, updatedBy: session.userId });
    await replacePurchaseRequestItems(prId, items);
  });
  return viewOf(prId);
}

export async function submitPurchaseRequest(prId: string, session: SessionUser): Promise<PrView> {
  await withInventoryLock(async () => {
    const { snap, so } = await loadContext();
    const pr = snap.prs.find((p) => p.prId === prId);
    if (!pr) throw httpError(404, "Purchase request not found.");
    if (pr.requestedByUserId !== session.userId && !isAdminRole(session.userRoleId)) throw httpError(403, "Only the requester or an admin can submit this purchase request.");
    if (pr.status !== "DRAFT") throw httpError(409, "This purchase request was already submitted.");
    requireConfirmed(so, pr.salesOrderId);
    if (!snap.items.some((i) => i.prId === prId)) throw httpError(400, "Add at least one item.");
    const today = manilaToday();
    const now = new Date().toISOString();
    await savePurchaseRequestRow({ ...pr, status: "SUBMITTED", prNo: nextPrNo(snap.prs.map((p) => p.prNo), today), requestedDate: today, version: pr.version + 1, updatedAt: now, updatedBy: session.userId });
  });
  return viewOf(prId);
}

export async function cancelPurchaseRequest(prId: string, reason: string, session: SessionUser): Promise<PrView> {
  if (!reason?.trim()) throw httpError(400, "A reason is required to cancel a purchase request.");
  await withInventoryLock(async () => {
    const { snap, poStatus, soStatus } = await loadContext();
    const pr = snap.prs.find((p) => p.prId === prId);
    if (!pr) throw httpError(404, "Purchase request not found.");
    requireEditable(buildView(pr, snap, poStatus, soStatus), session);
    const now = new Date().toISOString();
    await savePurchaseRequestRow({ ...pr, status: "CANCELLED", cancelReason: reason.trim(), version: pr.version + 1, updatedAt: now, updatedBy: session.userId });
  });
  return viewOf(prId);
}

/** Runs a line action under the lock with the line's current progress. */
async function withLine(prItemId: string, work: (item: PurchaseRequestItem, progress: PrLineProgress, pr: PurchaseRequest) => PurchaseRequestItem): Promise<PrView> {
  const prId = await withInventoryLock(async () => {
    const { snap, poStatus } = await loadContext();
    const item = snap.items.find((i) => i.prItemId === prItemId);
    if (!item) throw httpError(404, "Purchase request line not found.");
    const pr = snap.prs.find((p) => p.prId === item.prId);
    if (!pr || pr.status !== "SUBMITTED") throw httpError(409, "Only submitted purchase requests can be updated line by line.");
    const links: PurchaseRequestLink[] = snap.links.filter((l) => l.prItemId === prItemId);
    await updatePurchaseRequestItemRow(work(item, deriveLineProgress(item, links, poStatus), pr));
    return pr.prId;
  });
  return viewOf(prId);
}

export function markFromStock(prItemId: string, qty: number, note: string, session: SessionUser): Promise<PrView> {
  return withLine(prItemId, (item, progress) => {
    const error = validateFromStock(progress, Number(qty));
    if (error) throw httpError(400, error);
    const now = new Date().toISOString();
    const combinedNote = [item.fromStockNote, String(note ?? "").trim()].filter(Boolean).join("; ");
    return { ...item, fromStockQty: item.fromStockQty + Number(qty), fromStockNote: combinedNote, fromStockBy: session.fullName, fromStockAt: now, updatedAt: now, updatedBy: session.userId };
  });
}

export function undoFromStock(prItemId: string, session: SessionUser): Promise<PrView> {
  return withLine(prItemId, (item) => {
    if (!(item.fromStockQty > 0)) throw httpError(400, "This line has nothing marked from stock.");
    const now = new Date().toISOString();
    return { ...item, fromStockQty: 0, fromStockNote: "", fromStockBy: "", fromStockAt: "", updatedAt: now, updatedBy: session.userId };
  });
}

export function cancelRemaining(prItemId: string, qty: number, reason: string, session: SessionUser): Promise<PrView> {
  return withLine(prItemId, (item, progress) => {
    const error = validateCancelRemaining(progress, Number(qty), String(reason ?? ""));
    if (error) throw httpError(400, error);
    const now = new Date().toISOString();
    const combinedReason = [item.cancelReason, reason.trim()].filter(Boolean).join("; ");
    return { ...item, cancelledQty: item.cancelledQty + Number(qty), cancelReason: combinedReason, cancelledBy: session.fullName, cancelledAt: now, updatedAt: now, updatedBy: session.userId };
  });
}

export async function listEligibleSalesOrders(): Promise<EligibleSalesOrder[]> {
  const { orders, items } = await readSalesOrderListSnapshot();
  return orders
    .filter((o) => o.orderStatus === "CONFIRMED")
    .map((o) => ({
      salesOrderId: o.salesOrderId, salesOrderNo: o.salesOrderNo, customerName: o.customerNameSnapshot, quotationNo: o.quotationNo,
      deliveryAddress: o.deliveryAddressSnapshot,
      lines: items
        .filter((i) => i.salesOrderId === o.salesOrderId && i.lineType === "PRODUCT" && i.lineStatus === "ACTIVE" && i.productId)
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((i) => ({ salesOrderItemId: i.salesOrderItemId, lineNo: i.lineNo, productId: i.productId, productCode: i.productCodeSnapshot, productName: i.productNameSnapshot, unitId: i.unitId, unit: i.unitSnapshot, quantity: i.quantity })),
    }))
    .sort((a, b) => b.salesOrderNo.localeCompare(a.salesOrderNo, undefined, { numeric: true }));
}

export async function listOpenPrLines(excludePoNumber?: string): Promise<OpenPrLine[]> {
  const { snap, poStatus, soStatus } = await loadContext();
  const links = excludePoNumber ? snap.links.filter((l) => l.poNumber !== excludePoNumber) : snap.links;
  const prById = new Map(snap.prs.map((p) => [p.prId, p]));
  const out: OpenPrLine[] = [];
  for (const item of snap.items) {
    const pr = prById.get(item.prId);
    if (!pr || pr.status !== "SUBMITTED") continue;
    const { claimable } = deriveLineProgress(item, links, poStatus);
    if (claimable <= 0) continue;
    out.push({
      prId: pr.prId, prNo: pr.prNo, prItemId: item.prItemId, salesOrderNo: pr.salesOrderNoSnapshot, productId: item.productId,
      productCode: item.productCodeSnapshot, productName: item.productNameSnapshot, unit: item.unitSnapshot, claimable,
      salesOrderStatus: soStatus.get(pr.salesOrderId) ?? "",
    });
  }
  return out.sort((a, b) => a.prNo.localeCompare(b.prNo, undefined, { numeric: true }));
}
