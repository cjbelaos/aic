import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processServiceInvoice,
  getServiceInvoices,
} from "@/lib/serviceInvoiceSheets";
import { CreateServiceInvoicePayload } from "@/types/serviceInvoice";
import { getUserById } from "@/lib/userSheets";
import { readSalesOrderListSnapshot } from "@/lib/salesOrders/repository";
import { deriveOrderCategory } from "@/lib/salesOrders/domain";
import { getDeliverySalesOrderLinks } from "@/lib/deliverySheets";
import { categoryForInvoice } from "@/lib/serviceInvoiceFilters";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const invoices = await getServiceInvoices();
    if (!invoices.length) return NextResponse.json([], { status: 200 });
    const [snapshot, deliveryLinks] = await Promise.all([
      readSalesOrderListSnapshot(),
      invoices.some((invoice) => invoice.drNumber != null) ? getDeliverySalesOrderLinks() : Promise.resolve(new Map<number, string>()),
    ]);
    const itemsByOrder = new Map<string, typeof snapshot.items>();
    for (const item of snapshot.items) {
      const group = itemsByOrder.get(item.salesOrderId) ?? [];
      group.push(item);
      itemsByOrder.set(item.salesOrderId, group);
    }
    const categories = new Map(snapshot.orders.map((order) => [order.salesOrderId, deriveOrderCategory(itemsByOrder.get(order.salesOrderId) ?? [])]));
    return NextResponse.json(invoices.map((invoice) => ({ ...invoice, category: categoryForInvoice(invoice, categories, deliveryLinks) })), { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch service invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateServiceInvoicePayload = await request.json();

    const isDraft = body.status === "draft";

    if (!isDraft) {
      if (!body.invoiceNo?.trim()) {
        return NextResponse.json(
          { error: "Invoice No. is required." },
          { status: 400 },
        );
      }
    }
    if (!body.customerId?.trim()) {
      return NextResponse.json(
        { error: "Customer is required." },
        { status: 400 },
      );
    }
    if (!body.date?.trim()) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 });
    }

    if (!isDraft) {
      if (!body.preparedBy?.trim()) {
        return NextResponse.json(
          { error: "Prepared by is required." },
          { status: 400 },
        );
      }
      if (!body.items || body.items.length === 0) {
        return NextResponse.json(
          { error: "At least one item is required." },
          { status: 400 },
        );
      }
    }

    // The signed session owns the preparer's identity; a stale browser cache
    // must not turn the printed name into a username.
    body.preparedBy = session.fullName?.trim() || (await getUserById(session.userId))?.fullName?.trim() || body.preparedBy;
    const result = await processServiceInvoice(body, session.userId);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process service invoice.";
    const isValidationError = /Delivered By|Delivery Receipt|Sales Order|different customer/i.test(message);
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 });
  }
}
