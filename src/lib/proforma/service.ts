import { readSalesOrderById, readSalesOrderItems, readSalesOrders } from "@/lib/salesOrders/repository";
import { roundCurrency } from "@/lib/discounts";
import { getCompanies } from "@/lib/companySheets";
import type { ProformaInput, ProformaInvoice, ProformaItem, ProformaLegacyReference } from "@/types/proformaInvoice";
import type { SalesOrder } from "@/types/salesOrder";
import type { SessionUser } from "@/types/user";
import { assertWithinOrderTotal, defaultProformaItems, isLegacyProforma, priceProformaItems, ProformaError, proformaNumber, sequenceOf, sourceNumber } from "./domain";
import { readProformas, withProformaLock, writeProforma } from "./repository";
import { prepareProformaTrackerWrite } from "./tracker";

export async function getProforma(id: string): Promise<ProformaInvoice> {
  const invoice = (await readProformas()).find(invoice => invoice.id === id);
  if (!invoice) throw new ProformaError("Proforma Invoice not found.", 404);
  return invoice;
}
export async function proformaOptions(salesOrderId?: string, isAdmin = false) {
  if (salesOrderId) {
    const order = await readSalesOrderById(salesOrderId);
    if (!order) throw new ProformaError("Sales Order not found.", 404);
    const items = await readSalesOrderItems(salesOrderId);
    const all = await readProformas();
    const used = roundCurrency(all.filter(invoice => invoice.salesOrderId === salesOrderId && invoice.status === "ISSUED").reduce((sum, invoice) => sum + invoice.totalAmount, 0));
    const defaults = defaultProformaItems(items);
    return { order, sourceItems: items, items: defaults.length ? priceProformaItems(defaults, items) : [], issuedAmount: used, availableAmount: roundCurrency(order.grandTotal - used) };
  }
  const orders = (await readSalesOrders()).filter(order => !["DRAFT", "CANCELLED"].includes(order.orderStatus));
  const result = { orders: orders.map(order => ({ id: order.salesOrderId, number: order.salesOrderNo, trNo: order.legacyTrackerNo, customer: order.customerNameSnapshot, total: order.grandTotal })) };
  if (!isAdmin) return result;
  const companies = (await getCompanies()).filter(company => company.status === "active" && company.companyId).map(company => ({ id: company.companyId, name: company.companyName }));
  return { ...result, companies };
}
const ADMIN_ONLY = "Only admins can create or change legacy SO / TR proformas.";
/** Resolve the typed legacy reference into the invoice's reference snapshot. */
async function legacyReference(legacy: ProformaLegacyReference | undefined) {
  if (!legacy || typeof legacy !== "object") throw new ProformaError("Enter the legacy TR No. and customer, or select a Sales Order.");
  const trNo = typeof legacy.trNo === "string" ? legacy.trNo.trim() : "";
  if (!trNo || trNo.length > 50) throw new ProformaError("Enter the legacy TR No. (up to 50 characters).");
  const poNo = typeof legacy.poNo === "string" ? legacy.poNo.trim() : "";
  if (poNo.length > 100) throw new ProformaError("The PO No. must be under 100 characters.");
  // A TR already in the app must go through its Sales Order so the order-total limit applies.
  const owner = (await readSalesOrders()).find(order => !["DRAFT", "CANCELLED"].includes(order.orderStatus) && String(order.legacyTrackerNo ?? "").trim() === trNo);
  if (owner) throw new ProformaError(`TR ${trNo} already belongs to Sales Order ${owner.salesOrderNo}. Use the Sales Order option instead.`);
  const company = (await getCompanies()).find(company => company.companyId && company.companyId === legacy.customerId && company.status === "active");
  if (!company) throw new ProformaError("Select an active customer.");
  return { salesOrderId: "", salesOrderNo: "", trNo, customerId: company.companyId, companyName: company.companyName, tin: company.tin, address: company.address, poNo };
}
async function saveMirrored(invoice: ProformaInvoice, previous?: ProformaInvoice): Promise<ProformaInvoice> {
  if (JSON.stringify(invoice.items).length > 49000) throw new ProformaError("The invoice has too much item text. Shorten the descriptions.");
  let projection: Awaited<ReturnType<typeof prepareProformaTrackerWrite>>;
  try {
    projection = await prepareProformaTrackerWrite(invoice, previous);
    invoice.sourceRow = await projection.apply();
  } catch (error) {
    throw new ProformaError(`Not saved. The source tracker could not be updated: ${error instanceof Error ? error.message : "Connection failed"}. Please save again after resolving the error.`, 502);
  }
  try { await writeProforma(invoice); }
  catch {
    // Reconcile a lost Sheets response before compensating a completed write.
    const current = await readProformas().catch(() => null);
    if (!current) throw new ProformaError("The save result could not be confirmed. Reload the proforma before saving again.", 503);
    if (JSON.stringify(current.find(row => row.id === invoice.id)) === JSON.stringify(invoice)) return invoice;
    try { await projection.rollback(); }
    catch { throw new ProformaError("The application save failed and the source tracker could not be restored. Reload and check both records before saving again.", 503); }
    throw new ProformaError("Not saved. The source tracker was restored to its previous values. Please save again.", 502);
  }
  return invoice;
}
function assertVersion(invoice: ProformaInvoice, expected: number) {
  if (invoice.version !== expected) throw new ProformaError("This proforma changed. Reload it before saving.", 409);
}
export async function saveProforma(raw: ProformaInput, actor: SessionUser, isAdmin = false): Promise<ProformaInvoice> {
  if (!raw || typeof raw !== "object" || !/^[a-zA-Z0-9-]{10,80}$/.test(String(raw.id))) throw new ProformaError("A valid draft ID is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) || !Number.isFinite(Date.parse(raw.date)) || new Date(raw.date).toISOString().slice(0, 10) !== raw.date) throw new ProformaError("Enter a valid invoice date.");
  if ([raw.notes, raw.remarks, raw.drNo].some(value => typeof value !== "string" || value.length > 5000)) throw new ProformaError("Notes, remarks and DR number must be text under 5,000 characters.");
  return withProformaLock(async () => {
    const all = await readProformas();
    const existing = all.find(invoice => invoice.id === raw.id);
    if (existing) {
      assertVersion(existing, raw.expectedVersion);
      if (existing.status === "CANCELLED") throw new ProformaError("Cancelled proformas cannot be edited.");
      if (!existing.salesOrderId && existing.importIssue) throw new ProformaError("Migrated proformas cannot be edited.");
      if (existing.status === "ISSUED" && (isLegacyProforma(existing) ? !!raw.salesOrderId : existing.salesOrderId !== raw.salesOrderId)) throw new ProformaError("An issued proforma must keep its original Sales Order or legacy TR.");
      if (isLegacyProforma(existing) && !isAdmin) throw new ProformaError(ADMIN_ONLY, 403);
    } else if (raw.expectedVersion !== 0) throw new ProformaError("Draft not found. Reload the page.", 409);
    const issued = existing?.status === "ISSUED" || raw.issue === true;
    let order: SalesOrder | null = null, items: ProformaItem[], reference: Pick<ProformaInvoice, "salesOrderId" | "salesOrderNo" | "trNo" | "customerId" | "companyName" | "tin" | "address" | "poNo">;
    if (!raw.salesOrderId) {
      if (!isAdmin) throw new ProformaError(ADMIN_ONLY, 403);
      reference = await legacyReference(raw.legacy);
      items = priceProformaItems(raw.items, []);
    } else {
      order = await readSalesOrderById(raw.salesOrderId);
      if (!order || ["DRAFT", "CANCELLED"].includes(order.orderStatus)) throw new ProformaError("Select an active Sales Order.");
      if (issued && order.orderStatus === "ON_HOLD") throw new ProformaError("The Sales Order is on hold.");
      items = priceProformaItems(raw.items, await readSalesOrderItems(order.salesOrderId));
      reference = { salesOrderId: order.salesOrderId, salesOrderNo: order.salesOrderNo, trNo: order.legacyTrackerNo, customerId: order.customerId, companyName: order.customerNameSnapshot, tin: order.customerTINSnapshot, address: order.billingAddressSnapshot, poNo: order.customerPONo };
    }
    const now = new Date().toISOString();
    const invoice: ProformaInvoice = {
      id: raw.id, invoiceNo: existing?.invoiceNo || "", sourceInvoiceNo: existing?.sourceInvoiceNo || "", status: issued ? "ISSUED" : "DRAFT", ...reference,
      date: raw.date, drNo: raw.drNo.trim(), notes: raw.notes.trim(), remarks: raw.remarks.trim(), preparedBy: existing?.preparedBy || actor.fullName,
      items, totalAmount: roundCurrency(items.reduce((sum, item) => sum + item.amount, 0)), pdfLink: "", scanLink: "", version: (existing?.version ?? 0) + 1,
      sourceRow: existing?.sourceRow || 0, importIssue: existing?.importIssue || "", createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || actor.userId, updatedAt: now, updatedBy: actor.userId,
    };
    if (issued) {
      if (invoice.totalAmount <= 0) throw new ProformaError("The total must be greater than zero before saving an issued proforma.");
      if (order) assertWithinOrderTotal(order, invoice, all);
      if (!invoice.invoiceNo) {
        const sequence = Math.max(19, ...all.map(other => sequenceOf(other.invoiceNo))) + 1;
        invoice.invoiceNo = proformaNumber(sequence); invoice.sourceInvoiceNo = sourceNumber(sequence);
      }
      return saveMirrored(invoice, existing);
    }
    await writeProforma(invoice);
    return invoice;
  });
}
export async function changeProforma(id: string, action: string, expectedVersion: number, actor: SessionUser, notes?: unknown, isAdmin = false): Promise<ProformaInvoice> {
  return withProformaLock(async () => {
    const all = await readProformas();
    const invoice = all.find(invoice => invoice.id === id);
    if (!invoice) throw new ProformaError("Proforma Invoice not found.", 404);
    // A lost successful issuance response must never allocate a second number.
    if (action === "issue" && invoice.status === "ISSUED") return invoice;
    const previous = structuredClone(invoice);
    assertVersion(invoice, expectedVersion);
    const legacy = isLegacyProforma(invoice);
    if (legacy && !isAdmin) throw new ProformaError(ADMIN_ONLY, 403);
    if (action === "notes") {
      if (typeof notes !== "string" || notes.length > 5000) throw new ProformaError("Notes must be text under 5,000 characters.");
      invoice.notes = notes.trim(); invoice.version++; invoice.updatedAt = new Date().toISOString(); invoice.updatedBy = actor.userId;
      if (invoice.status !== "DRAFT") return saveMirrored(invoice, previous);
      await writeProforma(invoice);
      return invoice;
    }
    if (action === "issue") {
      if (invoice.status !== "DRAFT") throw new ProformaError("Only drafts can be issued.");
      if (legacy) {
        // Revalidate the stored reference (TR ownership, customer still active) at issue time.
        Object.assign(invoice, await legacyReference({ trNo: invoice.trNo, customerId: invoice.customerId, poNo: invoice.poNo }));
        invoice.items = priceProformaItems(invoice.items, []);
      } else {
        const order = await readSalesOrderById(invoice.salesOrderId);
        if (!order || ["CANCELLED", "DRAFT", "ON_HOLD"].includes(order.orderStatus)) throw new ProformaError("The Sales Order is not available for issuing.");
        invoice.items = priceProformaItems(invoice.items, await readSalesOrderItems(order.salesOrderId));
        invoice.companyName = order.customerNameSnapshot; invoice.tin = order.customerTINSnapshot; invoice.address = order.billingAddressSnapshot; invoice.poNo = order.customerPONo;
        invoice.salesOrderNo = order.salesOrderNo; invoice.trNo = order.legacyTrackerNo;
        invoice.totalAmount = roundCurrency(invoice.items.reduce((sum, item) => sum + item.amount, 0));
        assertWithinOrderTotal(order, invoice, all);
      }
      invoice.totalAmount = roundCurrency(invoice.items.reduce((sum, item) => sum + item.amount, 0));
      if (invoice.totalAmount <= 0) throw new ProformaError("The total must be greater than zero before issuing.");
      const sequence = Math.max(19, ...all.map(other => sequenceOf(other.invoiceNo))) + 1;
      invoice.invoiceNo = proformaNumber(sequence); invoice.sourceInvoiceNo = sourceNumber(sequence); invoice.status = "ISSUED";
    } else if (action === "cancel") {
      if (invoice.status !== "ISSUED") throw new ProformaError("Only issued proformas can be cancelled.");
      invoice.status = "CANCELLED";
    } else throw new ProformaError("Invalid action.");
    invoice.version++; invoice.updatedAt = new Date().toISOString(); invoice.updatedBy = actor.userId;
    return saveMirrored(invoice, previous);
  });
}
export async function recordProformaFile(id: string, kind: "pdfLink" | "scanLink", link: string, version: number): Promise<ProformaInvoice> {
  return withProformaLock(async () => {
    const invoice = await getProforma(id);
    assertVersion(invoice, version);
    if (invoice.status !== "ISSUED") throw new ProformaError("Files can only be attached to issued proformas.");
    invoice[kind] = link;
    // File attachments do not change the invoice content/version.
    await writeProforma(invoice);
    return invoice;
  });
}
