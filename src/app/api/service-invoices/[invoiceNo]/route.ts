import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateServiceInvoice,
  deleteServiceInvoice,
  populateAndExportServiceInvoiceFormPdf,
  resolvePreparedByPosition,
  UpdateServiceInvoicePayload,
} from "@/lib/serviceInvoiceSheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCustomers } from "@/lib/companySheets";

const SERVICE_INVOICES_SHEET = "ServiceInvoices";
const SERVICE_INVOICE_ITEMS_SHEET = "ServiceInvoiceItems";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { invoiceNo } = await params;
    const normalized = decodeURIComponent(invoiceNo).trim();
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid invoice number." },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Find invoice header row
    const invRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A2:A`,
    });
    const rows = invRows.data.values || [];
    const invRowIdx = rows.findIndex(
      (row) => String(row[0] ?? "").trim() === normalized,
    );
    if (invRowIdx < 0) {
      return NextResponse.json(
        { error: `Invoice "${normalized}" not found.` },
        { status: 404 },
      );
    }
    const invRowNumber = invRowIdx + 2;

    const invResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A${invRowNumber}:J${invRowNumber}`,
    });
    const invRow = invResponse.data.values?.[0] || [];
    const date = String(invRow[1] ?? "").trim();
    const customerId = String(invRow[2] ?? "").trim();
    const preparedBy = String(invRow[3] ?? "").trim();
    const createdBy = String(invRow[4] ?? "").trim();
    const preparedByPosition = await resolvePreparedByPosition(createdBy);

    // 2. Fetch items
    const itemsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICE_ITEMS_SHEET}!A2:E`,
    });
    const allItemRows = itemsResponse.data.values || [];
    const items = allItemRows
      .filter(
        (row) => String(row[0] ?? "").trim() === normalized,
      )
      .map((row) => ({
        description: String(row[1] ?? "").trim(),
        quantity: parseFloat(String(row[2] ?? "0")) || 0,
        unitPrice: parseFloat(String(row[3] ?? "0")) || 0,
        amount: parseFloat(String(row[4] ?? "0")) || 0,
      }));

    // 3. Fetch customer details
    const customers = await getCustomers();
    const company = customers.find(
      (c) => c.companyId === customerId || c.id === customerId,
    );
    const companyName = company?.companyName || customerId;
    const address = company?.address || "";
    const tin = company?.tin || "";

    // 4. Generate PDF from DB data
    const { pdfBase64, printUrl } =
      await populateAndExportServiceInvoiceFormPdf(normalized);

    return NextResponse.json(
      {
        success: true,
        invoiceNo: normalized,
        companyName,
        address,
        tin,
        date,
        preparedBy,
        preparedByPosition,
        items,
        status: String(invRow[8] ?? "created").trim(),
        printUrl,
        pdfBase64,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch service invoice preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ invoiceNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { invoiceNo } = await params;
    const normalized = decodeURIComponent(invoiceNo).trim();

    const body: UpdateServiceInvoicePayload = await request.json();
    const result = await updateServiceInvoice(normalized, body, session.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update service invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invoiceNo: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { invoiceNo } = await params;
    const normalized = decodeURIComponent(invoiceNo).trim();
    await deleteServiceInvoice(normalized);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete service invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}