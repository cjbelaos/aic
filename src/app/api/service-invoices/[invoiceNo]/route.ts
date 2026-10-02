import { parseInvoiceMetadata, paymentStatusFor } from "@/lib/serviceInvoiceTracking";
import { NextResponse } from "next/server";
import { requireAuthenticatedSession, isAdminUser } from "@/lib/auth/session";
import {
  updateServiceInvoice,
  updateServiceInvoiceCategory,
  updateServiceInvoicePayment,
  deleteServiceInvoice,
  resolvePreparedByPosition,
  UpdateServiceInvoicePayload,
  readServiceInvoiceItemValues,
} from "@/lib/serviceInvoiceSheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCustomers } from "@/lib/companySheets";
import { resolveDeliveryReceiptReferences } from "@/lib/deliverySheets";
import { getOrderDetail } from "@/lib/salesOrders/service";
import { getUserById } from "@/lib/userSheets";

const SERVICE_INVOICES_SHEET = "ServiceInvoices";

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
      range: `${SERVICE_INVOICES_SHEET}!A${invRowNumber}:Z${invRowNumber}`,
    });
    const invRow = invResponse.data.values?.[0] || [];
    const date = String(invRow[1] ?? "").trim();
    const customerId = String(invRow[2] ?? "").trim();
    const storedPreparedBy = String(invRow[3] ?? "").trim();
    const createdBy = String(invRow[4] ?? "").trim();
    const preparedBy = createdBy
      ? (await getUserById(createdBy))?.fullName?.trim() || storedPreparedBy
      : storedPreparedBy;
    const preparedByPosition = await resolvePreparedByPosition(createdBy);
    const linkedDrNumber = parseInt(String(invRow[11] ?? ""), 10);
    const directSalesOrderId = String(invRow[18] ?? "").trim();
    const references = Number.isFinite(linkedDrNumber)
      ? await resolveDeliveryReceiptReferences(linkedDrNumber)
      : directSalesOrderId && invRow[20] !== "TR_NUMBER"
        ? await getOrderDetail(directSalesOrderId).then((detail) => ({ poNo: detail.order.customerPONo || "", trNo: detail.order.salesOrderNo || "" }))
        : { poNo: String(invRow[16] ?? "").trim(), trNo: String(invRow[17] ?? "").trim() };

    // 2. Fetch items
    const allItemRows = await readServiceInvoiceItemValues(sheets, spreadsheetId);
    const items = allItemRows
      .filter(
        (row) => String(row[0] ?? "").trim() === normalized,
      )
      .map((row) => ({
        productId: String(row[5] ?? "").trim() || undefined,
        productCategoryId: String(row[6] ?? "").trim() || undefined,
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

    const metadata = parseInvoiceMetadata(invRow[19]);
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
        status: invRow[8] === "paid" ? "created" : String(invRow[8] ?? "created").trim(),
        paymentStatus: paymentStatusFor(String(invRow[8]), metadata),
        scannedFileLink: metadata.scannedFileLink,
        scannedStatus: metadata.scannedFileLink ? "scanned" : "not_scanned",
        statusReason: metadata.statusReason,
        driveFileLink: String(invRow[9] ?? "").trim() || undefined,
        drNumber: Number.isFinite(linkedDrNumber) ? linkedDrNumber : undefined,
        poNo: references.poNo || undefined,
        trNo: references.trNo || undefined,
        salesOrderId: directSalesOrderId || undefined,
        referenceMode: invRow[20] === "TR_NUMBER" ? "TR_NUMBER" : "SALES_ORDER",
        replacesInvoiceNo: (() => { try { return JSON.parse(String(invRow[19] ?? "{}")).replacesInvoiceNo; } catch { return undefined; } })(),
        replacementInvoiceNo: (() => { try { return JSON.parse(String(invRow[19] ?? "{}")).replacementInvoiceNo; } catch { return undefined; } })(),
        assignedTechnicianUserId: String(invRow[12] ?? "").trim() || undefined,
        assignedTechnicianName: String(invRow[13] ?? "").trim() || undefined,
        serviceReportId: String(invRow[14] ?? "").trim() || undefined,
        serviceReportStatus: String(invRow[15] ?? "").trim() || undefined,
        manualCompletionStatus: metadata.status,
        manualCompletionDate: metadata.completionDate,
        manualCompletionTechnicianId: metadata.technicianId,
        manualCompletionTechnicianName: metadata.technicianName,
        manualCompletionNotes: metadata.notes,

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

export async function PATCH(request: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { invoiceNo } = await params;
    const body = await request.json();
    if (body.paymentStatus !== undefined) {
      if (!isAdminUser(session)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      if (body.manualCategories !== undefined) return NextResponse.json({ error: "Update payment and category separately." }, { status: 400 });
      await updateServiceInvoicePayment(decodeURIComponent(invoiceNo).trim(), body.paymentStatus, session.userId);
    } else await updateServiceInvoiceCategory(decodeURIComponent(invoiceNo).trim(), body.manualCategories, session.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update invoice category.";
    const status = /not found/i.test(message) ? 404 : /Invalid invoice category|Invalid payment status|active invoices|automatically assigned|no longer be edited/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
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
    if ("paymentStatus" in body) return NextResponse.json({ error: "Use the admin payment update action." }, { status: 400 });
    const result = await updateServiceInvoice(normalized, body, session.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update service invoice.";
    const isValidationError = /Assigned Technician|Delivery Receipt|Sales Order|different customer|Invalid invoice category|Invalid invoice status|reason is required|Resolve recorded payments|no longer be edited/i.test(message);
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 });
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
