import { AsyncLocalStorage } from "node:async_hooks";
import { payloadHash } from "./crypto-hash.ts";
// Sales Orders — server-side orchestration. Route handlers stay thin and call
// this module. Server owns: actor identity, timestamps, sequence state (via the
// gateway), status transitions, calculated amounts, fulfillment totals, audit
// history and authorization checks.

import type { SalesOrder, SalesOrderItem, SalesOrderHistory, SalesOrderDocument, SalesOrderFulfillment, SalesOrderDocumentLink, SalesOrderSyncJob, OrderStatus } from "@/types/salesOrder";
import {
  readSalesOrders, readSalesOrderById, readSalesOrderItems,
  readSalesOrderListSnapshot, readSalesOrderDetailSnapshot,
} from "./repository.ts";
import { nowIso, newUuid, manilaBusinessDate, businessDateYear } from "./ids.ts";
import {
  canTransition, collectConfirmationIssues, deriveFulfillmentStatus, deriveOrderCategory,
  postFulfillment, applyReversalToItem, applyCancellationToItem, recalculateItemMoney,
  recalculateOrderTotals, remainingDemand, conversionPlanFromQuotation,
} from "./domain.ts";
import { createSyncJob } from "./sync.ts";
import { sendGatewayCommand, verifyEnvironment } from "./gateway.ts";
import { notFound, validationError } from "./errors.ts";
import { TAX_RATE_LEGACY_PHI } from "./money.ts";
import { getQuotationByRefNo } from "@/lib/quotationSheets";

export interface Actor {
  userId: string;
  displayName: string;
}

export interface SalesOrderDetail {
  order: SalesOrder;
  items: SalesOrderItem[];
  history: SalesOrderHistory[];
  documents: SalesOrderDocument[];
  fulfillments: SalesOrderFulfillment[];
  documentLinks: SalesOrderDocumentLink[];
  syncJobs: SalesOrderSyncJob[];
  totals: { subtotalExTax: number; discountTotal: number; taxTotal: number; grandTotal: number };
  category: string;
}

export interface ListQuery {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  fulfillmentStatus?: string;
  customerId?: string;
  category?: string;
  assignedToUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  overdue?: boolean;
  syncStatus?: string;
  view?: "all" | "services";
}

export interface OrderRowView {
  order: SalesOrder;
  itemsCount: number;
  activeLines: number;
  category: string;
  fulfillmentPercent: number;
  overdue: boolean;
  ageDays: number;
  syncStatus: string;
}

const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ["DRAFT", "CONFIRMED", "ON_HOLD"];

export function destinationConfig(): { spreadsheetId: string; sheetId: string } | null {
  const mode = (process.env.SALES_ORDER_SYNC_ENABLED ?? "").trim().toLowerCase();
  const spreadsheetId = process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID;
  const sheetId = process.env.SALES_ORDER_DESTINATION_TRACKER_SHEET_ID;
  if (!spreadsheetId || !sheetId) return null;
  if (mode === "off" || mode === "") return null;
  if (mode === "live" && process.env.SALES_ORDER_SYNC_ALLOW_LIVE !== "1") return null;
  return { spreadsheetId, sheetId };
}
function daysBetween(aIso: string, bIso: string): number {
  if (!aIso || !bIso) return 0;
  const a = Date.parse(`${aIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function assertFound(order: SalesOrder | null, id: string): asserts order is SalesOrder {
  if (!order) throw notFound(`Sales order ${id} was not found.`);
}

export async function getOrderDetail(id: string, options: { historyLimit?: number } = {}): Promise<SalesOrderDetail> {
  const snapshot = await readSalesOrderDetailSnapshot(id);
  const order = snapshot.order;
  assertFound(order, id);
  const items = snapshot.items.sort((a, b) => a.lineNo - b.lineNo);
  return {
    order,
    items,
    history: snapshot.history.slice(-(options.historyLimit ?? 50)),
    documents: snapshot.documents,
    fulfillments: snapshot.fulfillments,
    documentLinks: snapshot.documentLinks,
    syncJobs: snapshot.syncJobs,
    totals: recalculateOrderTotals(items),
    category: deriveOrderCategory(items),
  };
}

export async function listOrders(query: ListQuery): Promise<{ rows: OrderRowView[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(1000, Math.max(1, query.pageSize || 15));
  const snapshot = await readSalesOrderListSnapshot();
  const orders = snapshot.orders;
  const allItems = snapshot.items;
  const allJobs = snapshot.syncJobs;
  const today = manilaBusinessDate();

  const sorted = [...orders].sort(
    (a, b) => (b.receivedDate || "").localeCompare(a.receivedDate || "") || b.createdAt.localeCompare(a.createdAt),
  );
  const rows: OrderRowView[] = [];
  for (const order of sorted) {
    const items = allItems.filter((item) => item.salesOrderId === order.salesOrderId);
    const active = items.filter((item) => item.lineStatus === "ACTIVE");
    const demand = active.reduce((sum, item) => sum + Math.max(0, (item.quantity ?? 0) - item.cancelledQty), 0);
    const fulfilled = active.reduce((sum, item) => sum + item.fulfilledQty, 0);
    const category = deriveOrderCategory(items);
    if (!matchesFilter(query, order, items, category)) continue;
    const relevantJobs = allJobs.filter((job) => job.salesOrderId === order.salesOrderId).sort((a, b) => b.orderVersion - a.orderVersion);
    const syncStatus = relevantJobs.length ? relevantJobs[0].status : "NONE";
    if (query.syncStatus && query.syncStatus !== syncStatus) continue;
    const overdue = OPEN_ORDER_STATUSES.includes(order.orderStatus) && Boolean(order.requiredDate) && order.requiredDate < today;
    if (query.overdue && !overdue) continue;
    rows.push({
      order,
      itemsCount: items.length,
      activeLines: active.length,
      category,
      fulfillmentPercent: demand === 0 ? (active.length === 0 ? 100 : 0) : Math.min(100, Math.round((fulfilled / demand) * 100)),
      overdue,
      ageDays: order.receivedDate ? daysBetween(order.receivedDate, today) : 0,
      syncStatus,
    });
  }
  const total = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  return { rows: paged, total, page, pageSize };
}

function matchesFilter(query: ListQuery, order: SalesOrder, items: SalesOrderItem[], category: string): boolean {
  if (query.view === "services" && !items.some((item) => item.lineStatus === "ACTIVE" && item.orderCategory === "Services/ Repair")) return false;
  if (query.status && query.status !== order.orderStatus) return false;
  if (query.fulfillmentStatus && query.fulfillmentStatus !== order.fulfillmentStatus) return false;
  if (query.customerId && query.customerId !== order.customerId) return false;
  if (query.category && query.category !== category) return false;
  if (query.assignedToUserId && query.assignedToUserId !== order.assignedToUserId) return false;
  if (query.dateFrom && order.receivedDate < query.dateFrom) return false;
  if (query.dateTo && order.receivedDate > query.dateTo) return false;
  const q = (query.q ?? "").trim().toLowerCase();
  if (q) {
    const haystack = [
      order.salesOrderNo, order.legacyTrackerNo, order.customerPONo, order.customerNameSnapshot,
      ...items.map((item) => `${item.productCodeSnapshot} ${item.productNameSnapshot} ${item.description}`),
    ].join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
function baseOrder(input: {
  customerId: string; receivedDate: string; currency: string; assignedToUserId: string;
  customerNameSnapshot: string; customerTINSnapshot: string; billingAddressSnapshot: string;
  contactId: string; contactNameSnapshot: string; contactPhoneSnapshot: string;
  deliveryAddressSnapshot: string; customerPONo: string; quotationNo: string; paymentTermId: string;
  paymentTermsSnapshot: string; requiredDate: string; remarks: string;
}, actor: Actor): SalesOrder {
  const now = nowIso();
  return {
    salesOrderId: newUuid(), salesOrderNo: "", legacyTrackerNo: "", receivedDate: input.receivedDate,
    customerId: input.customerId, customerNameSnapshot: input.customerNameSnapshot,
    customerTINSnapshot: input.customerTINSnapshot, billingAddressSnapshot: input.billingAddressSnapshot,
    contactId: input.contactId, contactNameSnapshot: input.contactNameSnapshot,
    contactPhoneSnapshot: input.contactPhoneSnapshot, deliveryAddressSnapshot: input.deliveryAddressSnapshot,
    customerPONo: input.customerPONo, quotationNo: input.quotationNo, paymentTermId: input.paymentTermId,
    paymentTermsSnapshot: input.paymentTermsSnapshot, requiredDate: input.requiredDate,
    assignedToUserId: input.assignedToUserId, currency: input.currency as SalesOrder["currency"], orderStatus: "DRAFT",
    fulfillmentStatus: "UNFULFILLED", subtotalExTax: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0,
    remarks: input.remarks, version: 1, confirmedAt: "", closedAt: "", cancelReason: "",
    importQuality: "", createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId,
  };
}

export function buildItems(orderId: string, lines: Array<{
  lineType: "PRODUCT" | "SERVICE"; productId: string; description: string; unitId: string; unitSnapshot: string;
  customerProductName: string; productCodeSnapshot: string; productNameSnapshot: string;
  quantity: number | null; unitPrice: number | null; priceSource: string; priceOverrideReason: string;
  customerProductPriceId: string; quotationLineReference: string; discountAmount: number; taxMode: string;
  taxRate: number; orderCategory: string;
}>, actor: Actor, now = nowIso()): SalesOrderItem[] {
  return lines.map((line, index) => {
    const money = recalculateItemMoney({
      quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount,
      taxMode: line.taxMode as SalesOrderItem["taxMode"], taxRate: line.taxRate,
    });
    return {
      salesOrderItemId: newUuid(), salesOrderId: orderId, lineNo: index + 1,
      orderCategory: line.orderCategory || "Parts", lineType: line.lineType, productId: line.productId,
      productCodeSnapshot: line.productCodeSnapshot, productNameSnapshot: line.productNameSnapshot,
      customerProductNameSnapshot: line.customerProductName, description: line.description,
      unitId: line.unitId, unitSnapshot: line.unitSnapshot, quantity: line.quantity, unitPrice: line.unitPrice,
      priceSource: line.priceSource as SalesOrderItem["priceSource"], customerProductPriceId: line.customerProductPriceId,
      quotationLineReference: line.quotationLineReference, discountAmount: line.discountAmount,
      taxMode: line.taxMode as SalesOrderItem["taxMode"], taxRate: line.taxRate, subtotalExTax: money.subtotalExTax,
      taxAmount: money.taxAmount, lineTotal: money.lineTotal, fulfilledQty: 0, cancelledQty: 0,
      lineStatus: "ACTIVE", priceOverrideReason: line.priceOverrideReason, createdAt: now,
      createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId,
    };
  });
}

export function historyEvent(input: {
  orderId: string; itemId?: string; eventType: string; fromStatus?: string; toStatus?: string;
  changedFields?: Record<string, { from: unknown; to: unknown }>; reason?: string; commandId: string; actor: Actor;
}): SalesOrderHistory {
  return {
    eventId: newUuid(), salesOrderId: input.orderId, salesOrderItemId: input.itemId ?? "",
    eventType: input.eventType, fromStatus: input.fromStatus ?? "", toStatus: input.toStatus ?? "",
    changedFieldsJson: JSON.stringify(input.changedFields ?? {}), reason: input.reason ?? "",
    commandId: input.commandId, actorUserId: input.actor.userId, createdAt: nowIso(),
  };
}

export function createOutboundJob(orderId: string, version: number, now = nowIso()): SalesOrderSyncJob | null {
  const destination = destinationConfig();
  if (!destination) return null;
  return createSyncJob({
    syncJobId: newUuid(), salesOrderId: orderId, orderVersion: version,
    destinationSpreadsheetId: destination.spreadsheetId, destinationSheetId: destination.sheetId, nowIso: now,
  });
}

async function runWrite<T>(
  commandType: string,
  input: { commandId: string; salesOrderId: string | null; expectedVersion: number | null; payload: unknown; actor: Actor },
): Promise<{ ok: boolean; replayed: boolean; result: T }> {
  const command = {
    commandId: input.commandId, commandType,
    salesOrderId: input.salesOrderId, expectedVersion: input.expectedVersion,
    actorUserId: input.actor.userId, issuedAt: nowIso(), payload: { ...(input.payload as object), requestHash: requestContext.getStore() },
  };
  return sendGatewayCommand<T>({ command, payload: command.payload });
}
async function createDraftImpl(actor: Actor, input: {
  commandId: string;
  sourceQuotationNo?: string; customerId: string; customerNameSnapshot: string; customerTINSnapshot: string;
  billingAddressSnapshot: string; contactId: string; contactNameSnapshot: string; contactPhoneSnapshot: string;
  deliveryAddressSnapshot: string; customerPONo: string; paymentTermId: string; paymentTermsSnapshot: string;
  receivedDate: string; requiredDate: string; assignedToUserId: string; currency: string; remarks: string;
  lines: Array<{ lineType: "PRODUCT" | "SERVICE"; productId: string; description: string; unitId: string;
    unitSnapshot: string; customerProductName: string; productCodeSnapshot: string; productNameSnapshot: string;
    quantity: number | null; unitPrice: number | null; priceSource: string; priceOverrideReason: string;
    customerProductPriceId: string; quotationLineReference: string; discountAmount: number; taxMode: string;
    taxRate: number; orderCategory: string; }>;
}): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const order = baseOrder({ ...input, quotationNo: input.sourceQuotationNo ?? "" }, actor);
  const items = buildItems(order.salesOrderId, input.lines, actor);
  const totals = recalculateOrderTotals(items);
  order.subtotalExTax = totals.subtotalExTax;
  order.discountTotal = totals.discountTotal;
  order.taxTotal = totals.taxTotal;
  order.grandTotal = totals.grandTotal;
  order.fulfillmentStatus = deriveFulfillmentStatus(items);

  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: order.salesOrderId, eventType: "ORDER_CREATED", toStatus: "DRAFT", commandId, actor,
  })];
  const payload = { salesOrderId: order.salesOrderId, receivedDate: order.receivedDate, order, items, history };
  const saved = await runWrite<{ version: number; salesOrderId: string }>("so.create", {
    salesOrderId: order.salesOrderId, expectedVersion: null, commandId, payload, actor,
  });
  return getOrderDetail(saved.result.salesOrderId);
}
async function updateOrderImpl(actor: Actor, id: string, input: { commandId: string;
  expectedVersion: number; receivedDate?: string; requiredDate?: string; assignedToUserId?: string;
  customerPONo?: string; paymentTermId?: string; paymentTermsSnapshot?: string; remarks?: string;
  customerId?: string; customerNameSnapshot?: string; customerTINSnapshot?: string; billingAddressSnapshot?: string;
  contactId?: string; contactNameSnapshot?: string; contactPhoneSnapshot?: string; deliveryAddressSnapshot?: string;
  lines?: Array<{ salesOrderItemId?: string; lineType: "PRODUCT" | "SERVICE"; productId: string; description: string; unitId: string;
    unitSnapshot: string; customerProductName: string; productCodeSnapshot: string; productNameSnapshot: string;
    quantity: number | null; unitPrice: number | null; priceSource: string; priceOverrideReason: string;
    customerProductPriceId: string; quotationLineReference: string; discountAmount: number; taxMode: string;
    taxRate: number; orderCategory: string; }>;
}): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  const now = nowIso();
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const applyString = (field: string, value: string | undefined, read: (o: SalesOrder) => string, write: (o: SalesOrder, v: string) => void) => {
    if (value !== undefined && value !== read(current)) {
      changed[field] = { from: read(current), to: value };
      write(order, value);
    }
  };
  const order = { ...current };
  if (input.lines) changed.lines = { from: "replaced", to: `${input.lines.length} lines` };
  applyString("receivedDate", input.receivedDate, (o) => o.receivedDate, (o, v) => { o.receivedDate = v; });
  applyString("requiredDate", input.requiredDate, (o) => o.requiredDate, (o, v) => { o.requiredDate = v; });
  applyString("assignedToUserId", input.assignedToUserId, (o) => o.assignedToUserId, (o, v) => { o.assignedToUserId = v; });
  applyString("customerPONo", input.customerPONo, (o) => o.customerPONo, (o, v) => { o.customerPONo = v; });
  applyString("paymentTermId", input.paymentTermId, (o) => o.paymentTermId, (o, v) => { o.paymentTermId = v; });
  applyString("paymentTermsSnapshot", input.paymentTermsSnapshot, (o) => o.paymentTermsSnapshot, (o, v) => { o.paymentTermsSnapshot = v; });
  applyString("remarks", input.remarks, (o) => o.remarks, (o, v) => { o.remarks = v; });
  applyString("customerId", input.customerId, (o) => o.customerId, (o, v) => { o.customerId = v; });
  applyString("customerNameSnapshot", input.customerNameSnapshot, (o) => o.customerNameSnapshot, (o, v) => { o.customerNameSnapshot = v; });
  applyString("billingAddressSnapshot", input.billingAddressSnapshot, (o) => o.billingAddressSnapshot, (o, v) => { o.billingAddressSnapshot = v; });
  applyString("deliveryAddressSnapshot", input.deliveryAddressSnapshot, (o) => o.deliveryAddressSnapshot, (o, v) => { o.deliveryAddressSnapshot = v; });
  applyString("contactId", input.contactId, (o) => o.contactId, (o, v) => { o.contactId = v; });
  applyString("contactNameSnapshot", input.contactNameSnapshot, (o) => o.contactNameSnapshot, (o, v) => { o.contactNameSnapshot = v; });
  applyString("contactPhoneSnapshot", input.contactPhoneSnapshot, (o) => o.contactPhoneSnapshot, (o, v) => { o.contactPhoneSnapshot = v; });

  const hadItems = input.lines !== undefined;
  if (["CANCELLED", "CLOSED"].includes(current.orderStatus)) throw validationError("Closed or cancelled orders cannot be edited.");
  const existingItems = await readSalesOrderItems(id);
  const seen = new Set<string>();
  const items = input.lines ? input.lines.map((line, index) => {
    const next = buildItems(current.salesOrderId, [line], actor, now)[0];
    next.lineNo = index + 1;
    if (!line.salesOrderItemId) return next;
    const existing = existingItems.find(item => item.salesOrderItemId === line.salesOrderItemId);
    if (!existing || seen.has(line.salesOrderItemId) || existing.lineStatus === "INACTIVE") throw validationError("Invalid or duplicate line identity.");
    seen.add(line.salesOrderItemId);
    if ((next.quantity ?? 0) < existing.fulfilledQty + existing.cancelledQty) throw validationError("Quantity cannot be below fulfilled plus cancelled quantity.");
    if (existing.fulfilledQty > 0 && (next.productId !== existing.productId || next.lineType !== existing.lineType || next.unitId !== existing.unitId)) throw validationError("Fulfilled line identity cannot be changed.");
    return { ...next, salesOrderItemId: existing.salesOrderItemId, fulfilledQty: existing.fulfilledQty, cancelledQty: existing.cancelledQty,
      lineStatus: existing.lineStatus, createdAt: existing.createdAt, createdBy: existing.createdBy };
  }) : existingItems;
  if (input.lines) for (const existing of existingItems) {
    if (seen.has(existing.salesOrderItemId)) continue;
    if (existing.fulfilledQty > 0 && existing.lineStatus !== "INACTIVE") throw validationError("A fulfilled line cannot be removed; cancel its remainder instead.");
    items.push({ ...existing, lineStatus: "INACTIVE", updatedAt: now, updatedBy: actor.userId });
  }
  if (current.orderStatus !== "DRAFT") {
    const issues = collectConfirmationIssues({ order, items: items.filter(item => item.lineStatus !== "INACTIVE"), assignmentOptional: true });
    if (issues.length) throw validationError("Confirmed order revisions must remain commercially valid.");
  }
  const totals = recalculateOrderTotals(items);
  order.subtotalExTax = totals.subtotalExTax;
  order.discountTotal = totals.discountTotal;
  order.taxTotal = totals.taxTotal;
  order.grandTotal = totals.grandTotal;
  order.fulfillmentStatus = deriveFulfillmentStatus(items);
  order.updatedAt = now;
  order.updatedBy = actor.userId;

  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "ORDER_UPDATED", fromStatus: current.orderStatus,
    toStatus: order.orderStatus, changedFields: changed, commandId, actor,
  })];
  const payload = { salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items, history, hadItems };
  await runWrite<{ version: number }>("so.update", {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  return getOrderDetail(id);
}
async function confirmOrderImpl(actor: Actor, id: string, input: { commandId: string; expectedVersion: number }): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  if (current.orderStatus !== "DRAFT") {
    throw validationError(`Only a DRAFT order can be confirmed (current status: ${current.orderStatus}).`);
  }
  const items = await readSalesOrderItems(id);
  const issues = collectConfirmationIssues({ order: current, items, assignmentOptional: true });
  if (issues.length > 0) throw validationError("This order is not ready for confirmation.", Object.fromEntries(issues.map((issue, i) => [`issue.${i + 1}`, issue])));
  const now = nowIso();
  const order = { ...current, orderStatus: "CONFIRMED" as const, confirmedAt: now, updatedAt: now, updatedBy: actor.userId };
  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "ORDER_CONFIRMED", fromStatus: current.orderStatus,
    toStatus: "CONFIRMED", commandId, actor,
  })];
  const payload = {
    salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items, history,
    syncJob: createOutboundJob(current.salesOrderId, current.version + 1, now),
  };
  const result = await runWrite<{ version: number; salesOrderNo: string }>("so.confirm", {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  if (result.result.salesOrderNo) order.salesOrderNo = result.result.salesOrderNo;
  return getOrderDetail(id);
}

async function transitionOrderImpl(
  actor: Actor,
  id: string,
  input: { commandId: string; expectedVersion: number; target: "ON_HOLD" | "CONFIRMED"; reason?: string },
): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  if (!canTransition(current.orderStatus, input.target)) {
    throw validationError(`Transition from ${current.orderStatus} to ${input.target} is not allowed.`);
  }
  const now = nowIso();
  const order = { ...current, orderStatus: input.target, updatedAt: now, updatedBy: actor.userId };
  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: `ORDER_${input.target}`, fromStatus: current.orderStatus,
    toStatus: input.target, reason: input.reason, commandId, actor,
  })];
  const payload = {
    salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items: await readSalesOrderItems(id),
    history, syncJob: createOutboundJob(current.salesOrderId, current.version + 1, now),
  };
  await runWrite<{ version: number }>(`so.${input.target === "ON_HOLD" ? "hold" : "resume"}`, {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  return getOrderDetail(id);
}
async function cancelOrderImpl(
  actor: Actor,
  id: string,
  input: { commandId: string; expectedVersion: number; reason: string; cancelAllLines: boolean; lines: Array<{ salesOrderItemId: string; quantity: number }> },
): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  if (!canTransition(current.orderStatus, "CANCELLED")) {
    throw validationError(`Order ${id} cannot be cancelled from state ${current.orderStatus}.`);
  }
  const items = await readSalesOrderItems(id);
  const targetByLine = new Map(input.lines.map((entry) => [entry.salesOrderItemId, entry.quantity]));
  const nextItems = items.map((item) => {
    if (item.lineStatus !== "ACTIVE") return item;
    if (input.cancelAllLines) {
      const remaining = item.quantity === null ? 0 : Math.max(0, item.quantity - item.cancelledQty - item.fulfilledQty);
      return remaining > 0 ? applyCancellationToItem(item, remaining) : item;
    }
    const qty = targetByLine.get(item.salesOrderItemId);
    return qty && qty > 0 ? applyCancellationToItem(item, qty) : item;
  });
  const now = nowIso();
  const order = {
    ...current, orderStatus: "CANCELLED" as const, cancelReason: input.reason, closedAt: now,
    updatedAt: now, updatedBy: actor.userId, fulfillmentStatus: deriveFulfillmentStatus(nextItems),
  };
  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "ORDER_CANCELLED", fromStatus: current.orderStatus,
    toStatus: "CANCELLED", reason: input.reason, commandId, actor,
  })];
  const payload = {
    salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items: nextItems,
    history, syncJob: createOutboundJob(current.salesOrderId, current.version + 1, now),
  };
  await runWrite<{ version: number }>("so.cancel", {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  return getOrderDetail(id);
}

async function postFulfillmentsImpl(actor: Actor, id: string, input: { commandId: string;
  expectedVersion: number;
  entries: Array<{ salesOrderItemId: string; type: "DELIVERY" | "SERVICE_COMPLETION" | "REVERSAL"; quantity: number;
    effectiveDate: string; sourceDocumentType: string; sourceDocumentId: string; sourceLineId: string;
    evidenceDriveFileId: string; reversesFulfillmentId: string }>;
}): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  const items = await readSalesOrderItems(id);
  const nextItems = [...items];
  const now = nowIso();
  const fulfillments: SalesOrderFulfillment[] = [];
  const commandId = input.commandId;
  for (const entry of input.entries) {
    const index = nextItems.findIndex((item) => item.salesOrderItemId === entry.salesOrderItemId);
    if (index < 0) throw validationError(`Line ${entry.salesOrderItemId} was not found on this order.`);
    if (entry.type === "REVERSAL") {
      nextItems[index] = applyReversalToItem(nextItems[index], entry.quantity);
    } else {
      nextItems[index] = postFulfillment(nextItems[index], entry.quantity);
    }
    fulfillments.push({
      fulfillmentId: newUuid(), salesOrderId: current.salesOrderId, salesOrderItemId: entry.salesOrderItemId,
      fulfillmentType: entry.type, sourceDocumentType: entry.sourceDocumentType, sourceDocumentId: entry.sourceDocumentId,
      sourceLineId: entry.sourceLineId, quantity: entry.quantity, effectiveDate: entry.effectiveDate,
      evidenceDriveFileId: entry.evidenceDriveFileId, reversesFulfillmentId: entry.reversesFulfillmentId,
      status: "POSTED", commandId, createdAt: now, createdBy: actor.userId,
    });
  }
  const order = {
    ...current, fulfillmentStatus: deriveFulfillmentStatus(nextItems), updatedAt: now, updatedBy: actor.userId,
  };
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "FULFILLMENT_POSTED", fromStatus: current.fulfillmentStatus,
    toStatus: order.fulfillmentStatus, commandId, actor,
  })];
  const payload = {
    salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items: nextItems,
    fulfillments, history, syncJob: createOutboundJob(current.salesOrderId, current.version + 1, now),
  };
  await runWrite<{ version: number }>("so.fulfill", {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  return getOrderDetail(id);
}
async function closeOrderImpl(actor: Actor, id: string, input: { commandId: string; expectedVersion: number; reason: string }): Promise<SalesOrderDetail> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  if (!canTransition(current.orderStatus, "CLOSED")) {
    throw validationError(`Order ${id} cannot be closed from state ${current.orderStatus}.`);
  }
  const items = await readSalesOrderItems(id);
  const status = deriveFulfillmentStatus(items);
  if (status !== "FULFILLED" && status !== "NOT_APPLICABLE" && !input.reason.trim()) {
    throw validationError("Closing requires fulfilled quantities or an explicit administrative close reason.");
  }
  const now = nowIso();
  const order = { ...current, orderStatus: "CLOSED" as const, closedAt: now, updatedAt: now, updatedBy: actor.userId };
  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "ORDER_CLOSED", fromStatus: current.orderStatus,
    toStatus: "CLOSED", reason: input.reason, commandId, actor,
  })];
  const payload = {
    salesOrderId: current.salesOrderId, receivedDate: order.receivedDate, order, items,
    history, syncJob: createOutboundJob(current.salesOrderId, current.version + 1, now),
  };
  await runWrite<{ version: number }>("so.close", {
    salesOrderId: current.salesOrderId, expectedVersion: input.expectedVersion, commandId, payload, actor,
  });
  return getOrderDetail(id);
}

async function attachDocumentImpl(actor: Actor, id: string, input: { commandId: string;
  documentType: string; externalDocumentNo: string; driveFileId: string; externalUrl: string;
  fileName: string; mimeType: string; orderVersion: number;
}): Promise<SalesOrderDocument> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  const now = nowIso();
  const document: SalesOrderDocument = {
    documentId: newUuid(), salesOrderId: current.salesOrderId,
    documentType: input.documentType as SalesOrderDocument["documentType"],
    externalDocumentNo: input.externalDocumentNo, driveFileId: input.driveFileId, externalUrl: input.externalUrl,
    fileName: input.fileName, mimeType: input.mimeType,
    orderVersion: input.orderVersion || current.version, generationStatus: "READY", errorCode: "",
    createdAt: now, createdBy: actor.userId,
  };
  const commandId = input.commandId;
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "DOCUMENT_ATTACHED", toStatus: current.orderStatus,
    changedFields: { documentType: { from: "", to: document.documentType } }, commandId, actor,
  })];
  const payload = { salesOrderId: current.salesOrderId, receivedDate: current.receivedDate, document, history };
  await runWrite<{ version: number }>("so.attach", {
    salesOrderId: current.salesOrderId, expectedVersion: input.orderVersion || current.version, commandId, payload, actor,
  });
  return document;
}

async function authorizedSyncRetryImpl(actor: Actor, id: string, commandId: string): Promise<{ queued: boolean }> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  const payload = { salesOrderId: current.salesOrderId, reason: "manual-retry", actorUserId: actor.userId };
  const result = await runWrite<{ queued: boolean }>("so.sync.retry", {
    commandId, salesOrderId: current.salesOrderId, expectedVersion: current.version, payload, actor,
  });
  return { queued: result.result.queued === true };
}

export interface DocumentLinkInput {
  documentType: "CUSTOMER_PO" | "QUOTATION" | "SALES_ORDER_PDF" | "DELIVERY_RECEIPT" | "SERVICE_REPORT" | "OTHER";
  documentId: string;
  documentLineId: string;
  entries: Array<{ salesOrderItemId: string; linkedQty: number }>;
}

/**
 * Linked delivery creation (plan §6 step 4 primitive): records explicit
 * SalesOrderDocumentLink rows referencing the source document (a DR/SI line)
 * for unfilled order lines. Links are DRAFT records only — they do NOT post
 * fulfillment, so a draft linked delivery never fulfills orders. Quantity is
 * capped at the line's remaining demand, evaluated server-side.
 */
async function createDocumentLinksImpl(actor: Actor, id: string, input: { commandId: string; expectedVersion: number } & DocumentLinkInput): Promise<SalesOrderDocumentLink[]> {
  verifyEnvironment();
  const current = await readSalesOrderById(id);
  assertFound(current, id);
  if (current.orderStatus !== "CONFIRMED" && current.orderStatus !== "ON_HOLD") {
    throw validationError(`Linked deliveries require a confirmed order (current status: ${current.orderStatus}); DRAFT orders are not fulfilled.`);
  }
  const items = await readSalesOrderItems(id);
  const byId = new Map(items.map((item) => [item.salesOrderItemId, item]));
  const now = nowIso();
  const links: SalesOrderDocumentLink[] = [];
  const linkErrors: Record<string, string> = {};
  for (const entry of input.entries) {
    const item = byId.get(entry.salesOrderItemId);
    if (!item) { linkErrors[entry.salesOrderItemId] = "Line was not found on this order."; continue; }
    if (item.lineStatus !== "ACTIVE") { linkErrors[entry.salesOrderItemId] = "Only active lines can be delivered."; continue; }
    const remaining = remainingDemand(item);
    if (!(entry.linkedQty > 0) || entry.linkedQty > remaining) {
      linkErrors[entry.salesOrderItemId] = `Linked quantity must be between 0 and the remaining demand (${remaining}).`;
      continue;
    }
    links.push({
      linkId: newUuid(), salesOrderId: current.salesOrderId, salesOrderItemId: entry.salesOrderItemId,
      documentType: input.documentType, documentId: input.documentId, documentLineId: input.documentLineId,
      linkedQty: entry.linkedQty, linkStatus: "LINKED", commandId: input.commandId, createdAt: now, createdBy: actor.userId,
    });
  }
  if (links.length === 0 && Object.keys(linkErrors).length > 0) {
    throw validationError("No linked delivery lines were valid.", linkErrors);
  }
  const history = [historyEvent({
    orderId: current.salesOrderId, eventType: "DELIVERY_LINKED", fromStatus: current.orderStatus,
    toStatus: current.orderStatus, changedFields: { documentId: { from: "", to: input.documentId } },
    commandId: input.commandId, actor,
  })];
  const payload = { salesOrderId: current.salesOrderId, receivedDate: current.receivedDate, links, history };
  const result = await runWrite<{ linkCount: number }>("so.documents.link", {
    commandId: input.commandId, salesOrderId: current.salesOrderId,
    expectedVersion: input.expectedVersion ?? current.version, payload, actor,
  });
  if (links.length > 0 && result.result.linkCount !== links.length) {
    throw new Error("The gateway persisted a different number of links than were submitted.");
  }
  return links;
}

async function createDraftFromQuotationImpl(actor: Actor, input: { commandId: string; quotationNo: string }): Promise<SalesOrderDetail> {
  const existing = (await readSalesOrders()).find((order) =>
    order.quotationNo.trim().toLowerCase() === input.quotationNo.trim().toLowerCase()
    && order.orderStatus !== "CANCELLED",
  );
  if (existing) {
    return Object.assign(await getOrderDetail(existing.salesOrderId), { reusedExisting: true });
  }
  const quotation = await getQuotationByRefNo(input.quotationNo);
  if (!quotation) throw notFound(`Quotation ${input.quotationNo} was not found.`);
  const plan = conversionPlanFromQuotation({
    quotationNo: quotation.quotationNo,
    items: quotation.items,
    shippingFee: quotation.shippingFee,
    defaultTaxMode: "VAT_INCLUSIVE",
    defaultTaxRate: TAX_RATE_LEGACY_PHI,
  });
  return createDraftImpl(actor, {
    commandId: input.commandId,
    sourceQuotationNo: quotation.quotationNo,
    customerId: quotation.customerId ?? "",
    customerNameSnapshot: quotation.customer,
    customerTINSnapshot: "",
    billingAddressSnapshot: "",
    contactId: "",
    contactNameSnapshot: "",
    contactPhoneSnapshot: "",
    deliveryAddressSnapshot: "",
    customerPONo: "",
    paymentTermId: quotation.paymentTermId ?? "",
    paymentTermsSnapshot: quotation.terms ?? "",
    receivedDate: new Date().toISOString().slice(0, 10),
    requiredDate: "",
    assignedToUserId: "",
    currency: "PHP",
    remarks: `Converted from quotation ${quotation.quotationNo}; original total ${quotation.amount}.`,
    lines: plan.lines.map((line) => ({
      orderCategory: line.description === "Shipping Fee" ? "Supplies" : "",
      ...line,
      productNameSnapshot: "",
      customerProductName: line.customerProductNameSnapshot ?? "",
      priceOverrideReason: "",
      customerProductPriceId: "",
      quotationLineReference: line.description === "Shipping Fee" ? `${quotation.quotationNo}:SHIPPING` : quotation.quotationNo,
    })),
  });
}

export { businessDateYear };
// Receipt lookup precedes state-dependent validation and generated timestamps/IDs.
// The stable intent hash includes actor, operation, parent ID and parsed input;
// the envelope separately signs the complete generated write payload.
const requestContext = new AsyncLocalStorage<string>();
async function replayable<T>(operation: string, actor: Actor, id: string | null,
  input: { commandId: string }, execute: () => Promise<T>, restore: (result: Record<string, unknown>) => Promise<T>): Promise<T> {
  const requestHash = payloadHash(JSON.parse(JSON.stringify({ operation, actorUserId: actor.userId, id, input })));
  const payload = { requestHash };
  const receipt = await sendGatewayCommand<Record<string, unknown> | null>({
    command: { commandId: input.commandId, commandType: "so.receipt", salesOrderId: id,
      expectedVersion: null, actorUserId: actor.userId, issuedAt: nowIso(), payload }, payload,
  });
  if (receipt.replayed && receipt.result) return restore(receipt.result);
  try { return await requestContext.run(requestHash, execute); }
  catch (error) {
    // Another invocation of this same intent may have committed while this
    // invocation was reading state. Reconcile before reporting a stale error.
    const retry = await sendGatewayCommand<Record<string, unknown> | null>({
      command: { commandId: input.commandId, commandType: "so.receipt", salesOrderId: id,
        expectedVersion: null, actorUserId: actor.userId, issuedAt: nowIso(), payload }, payload,
    });
    if (retry.replayed && retry.result) return restore(retry.result);
    throw error;
  }
}
export async function createDraft(...args: Parameters<typeof createDraftImpl>): ReturnType<typeof createDraftImpl> {
  const [actor, input] = args;
  return replayable("createDraft", actor, null, input, () => createDraftImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function updateOrder(...args: Parameters<typeof updateOrderImpl>): ReturnType<typeof updateOrderImpl> {
  const [actor, id, input] = args;
  return replayable("updateOrder", actor, id, input, () => updateOrderImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function confirmOrder(...args: Parameters<typeof confirmOrderImpl>): ReturnType<typeof confirmOrderImpl> {
  const [actor, id, input] = args;
  return replayable("confirmOrder", actor, id, input, () => confirmOrderImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function transitionOrder(...args: Parameters<typeof transitionOrderImpl>): ReturnType<typeof transitionOrderImpl> {
  const [actor, id, input] = args;
  return replayable("transitionOrder", actor, id, input, () => transitionOrderImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function cancelOrder(...args: Parameters<typeof cancelOrderImpl>): ReturnType<typeof cancelOrderImpl> {
  const [actor, id, input] = args;
  return replayable("cancelOrder", actor, id, input, () => cancelOrderImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function postFulfillments(...args: Parameters<typeof postFulfillmentsImpl>): ReturnType<typeof postFulfillmentsImpl> {
  const [actor, id, input] = args;
  return replayable("postFulfillments", actor, id, input, () => postFulfillmentsImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function closeOrder(...args: Parameters<typeof closeOrderImpl>): ReturnType<typeof closeOrderImpl> {
  const [actor, id, input] = args;
  return replayable("closeOrder", actor, id, input, () => closeOrderImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
export async function attachDocument(...args: Parameters<typeof attachDocumentImpl>): ReturnType<typeof attachDocumentImpl> {
  const [actor, id, input] = args;
  return replayable("attachDocument", actor, id, input, () => attachDocumentImpl(...args), async result => result.document as unknown as SalesOrderDocument);
}
export async function authorizedSyncRetry(...args: Parameters<typeof authorizedSyncRetryImpl>): ReturnType<typeof authorizedSyncRetryImpl> {
  const [actor, id, commandId] = args;
  return replayable("authorizedSyncRetry", actor, id, { commandId }, () => authorizedSyncRetryImpl(...args), async () => ({ queued: true }));
}
export async function createDocumentLinks(...args: Parameters<typeof createDocumentLinksImpl>): ReturnType<typeof createDocumentLinksImpl> {
  const [actor, id, input] = args;
  return replayable("createDocumentLinks", actor, id, input, () => createDocumentLinksImpl(...args), async result => result.links as unknown as SalesOrderDocumentLink[]);
}
export async function createDraftFromQuotation(...args: Parameters<typeof createDraftFromQuotationImpl>): ReturnType<typeof createDraftFromQuotationImpl> {
  const [actor, input] = args;
  return replayable("createDraftFromQuotation", actor, null, input, () => createDraftFromQuotationImpl(...args), result => getOrderDetail(String(result.salesOrderId)));
}
