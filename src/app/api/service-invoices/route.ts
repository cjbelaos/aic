import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processServiceInvoice,
  getServiceInvoices,
} from "@/lib/serviceInvoiceSheets";
import { CreateServiceInvoicePayload } from "@/types/serviceInvoice";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const invoices = await getServiceInvoices();
    return NextResponse.json(invoices, { status: 200 });
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

    const result = await processServiceInvoice(body, session.userId);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process service invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
