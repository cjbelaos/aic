import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { SalesOrderError } from "@/lib/salesOrders/errors";
import { activeWarehouseError, guardedDrWrite, inventoryErrorResponse } from "@/lib/inventory/drGuard";
import { effectiveSourcesKey } from "@/lib/deliverySources";
import { isCountedDrStatus } from "@/lib/inventory/domain";
import {
  getDeliveryReceipts,
  updateDeliveryReceipt,
  deleteDeliveryReceipt,
  populateAndExportDeliveryReceiptFormPdf,
  UpdateDeliveryPayload,
} from "@/lib/deliverySheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import { getProducts } from "@/lib/productSheets";
import { getDeliveryItems } from "@/lib/transactionItemSheets";
import { regenerateStoredServiceInvoicePdfsForDr } from "@/lib/serviceInvoiceSheets";
import {
  deliveryReferenceFromRow,
  isDeliveryReferenceMode,
  resolveDeliveryReference,
} from "@/lib/deliveryReference";

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Find DR header row
    const drRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A2:A`,
    });
    const rows = drRows.data.values || [];
    const drRowIdx = rows.findIndex((row) => {
      const val = parseInt(String(row[0] ?? "").trim(), 10);
      return val === drNumber;
    });
    if (drRowIdx < 0) {
      return NextResponse.json(
        { error: `DR #${drNumber} not found.` },
        { status: 404 },
      );
    }
    const drRowNumber = drRowIdx + 2; // +2: 0-based + header row

    const drResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:AA${drRowNumber}`,
    });
    const drRow = drResponse.data.values?.[0] || [];
    const deliveryDate = String(drRow[1] ?? "").trim();
    const companyId = String(drRow[2] ?? "").trim();
    const poNo = String(drRow[3] ?? "").trim();
    const trNo = String(drRow[4] ?? "").trim();
    const reference = deliveryReferenceFromRow(drRow);
    const comments = String(drRow[6] ?? "").trim();
    const preparedBy = String(drRow[7] ?? "").trim();
    const deliveredBy = String(drRow[8] ?? "").trim();
    const status = String(drRow[10] ?? "created").trim();
    const forCompanyId = String(drRow[24] ?? "").trim() || undefined;

    // 2. Fetch DR items from the canonical DeliveryReceiptItems tab
    const itemsByDr = await getDeliveryItems();
    const currentItems = itemsByDr.get(drNumber) ?? [];
    const products = await getProducts();
    const productMap = new Map(products.map((product) => [product.productCode, product]));
    const items = currentItems.map((item) => ({
      ...item,
      description:
        item.description ||
        productMap.get(item.productCode)?.productName ||
        item.productCode,
    }));

    // 3. Fetch company details
    const companies = await getCompanies();
    const company = companies.find(
      (c) => c.companyId === companyId || c.id === companyId,
    );
    const companyName = company?.companyName || companyId;
    const address = company?.address || "";
    const tin = company?.tin || "";
    const forCompany = forCompanyId ? companies.find((c) => c.companyId === forCompanyId) : undefined;
    const forCompanyName = forCompanyId ? forCompany?.companyName || forCompanyId : undefined;

    // Current receipts use the in-app A4 document. Do not make their preview
    // depend on regenerating the retired Google Sheets PDF template.
    let pdfBase64: string | undefined;
    let printUrl: string | undefined;
    if (!currentItems) {
      ({ pdfBase64, printUrl } =
        await populateAndExportDeliveryReceiptFormPdf(drNumber));
    }

    return NextResponse.json(
      {
        success: true,
        drNumber,
        companyId,
        forCompanyId,
        forCompanyName,
        forCompanyAddress: forCompany?.address || undefined,
        forCompanyTin: forCompany?.tin || undefined,
        companyName,
        address,
        tin,
        date: deliveryDate,
        poNo,
        salesOrderNo: reference.salesOrderNo || undefined,
        salesOrderId: String(drRow[18] ?? "").trim() || undefined,
        trNo,
        noChargeReason: reference.noChargeReason || undefined,
        noChargeNote: reference.noChargeNote || undefined,
        preparedBy,
        deliveredBy,
        comments,
        items,
        status,
        driveFileLink: String(drRow[11] ?? "").trim() || undefined,
        previewFormat: currentItems ? "current" : "legacy",
        printUrl,
        pdfBase64,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch delivery receipt preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    const body: UpdateDeliveryPayload = await request.json();
    // Approval fields and the held status are server-owned; drop anything the browser sent.
    delete body.approvedBy;
    delete body.approvedAt;
    delete body.approvalNote;
    delete body.requestedStatus;

    // Same reference rule as the create path, enforced on the server: a mode
    // requires its value, and the two modes are mutually exclusive.
    const reference = resolveDeliveryReference({
      referenceMode: body.referenceMode,
      salesOrderId: body.salesOrderId,
      salesOrderNo: body.salesOrderNo,
      trNo: body.trNo,
      noChargeReason: body.noChargeReason,
      noChargeNote: body.noChargeNote,
    });
    if (reference.error) {
      return NextResponse.json({ error: reference.error }, { status: 422 });
    }
    if (isDeliveryReferenceMode(body.referenceMode)) {
      body.salesOrderId = reference.salesOrderId || undefined;
      body.trNo = reference.trNo;
      body.noChargeReason = reference.noChargeReason;
      body.noChargeNote = reference.noChargeNote;
    }
    // Stock guard. Saving into a counted status (or resubmitting a pending or
    // rejected DR) is checked; historical finalized DRs without a warehouse are
    // outside inventory and are left alone.
    const stored = (await getDeliveryReceipts()).find((receipt) => receipt.drNumber === drNumber);
    const rawStatus = String(body.status ?? stored?.status ?? "created").trim().toLowerCase();
    // Resubmitting a held DR goes back to the status it was originally saved for.
    const requestedStatus = ["pending_approval", "rejected"].includes(rawStatus) ? (stored?.requestedStatus || "created") : rawStatus;
    // A blank warehouse means "unchanged"; a DR that has one can never be cleared.
    const warehouseId = body.warehouseId?.trim() || stored?.warehouseId || "";
    if (body.warehouseId !== undefined) body.warehouseId = warehouseId;
    const storedStatus = String(stored?.status ?? "").trim().toLowerCase();
    const notYetFinal = drNumber <= 0 || ["draft", "pending_approval", "rejected"].includes(storedStatus);
    // A finalized DR whose stock-relevant fields (items, warehouse, date) are
    // unchanged keeps its earlier decision, so e.g. a comment edit on a
    // manager-approved DR does not send it back for approval.
    const stockUnchanged = Boolean(stored) && isCountedDrStatus(storedStatus) && isCountedDrStatus(requestedStatus)
      && warehouseId === (stored?.warehouseId ?? "")
      && (body.date === undefined || body.date === stored?.date)
      && (body.items === undefined || effectiveSourcesKey(body.items, warehouseId) === effectiveSourcesKey(stored?.items, stored?.warehouseId));
    const guarded = !stockUnchanged
      && (isCountedDrStatus(requestedStatus) || ["pending_approval", "rejected"].includes(rawStatus))
      && (Boolean(warehouseId) || notYetFinal);
    let result;
    if (guarded) {
      const warehouseError = await activeWarehouseError(warehouseId);
      if (warehouseError) return NextResponse.json({ error: warehouseError }, { status: 422 });
      ({ result } = await guardedDrWrite(
        session,
        { drNumber, warehouseId, date: body.date ?? stored?.date ?? "", requestedStatus, items: body.items ?? stored?.items ?? [] },
        (stock) => {
          return updateDeliveryReceipt(drNumber, { ...body, ...stock.approval, requestedStatus: stock.requestedStatus, warehouseId, status: stock.status }, session.userId);
        },
      ));
    } else {
      result = await updateDeliveryReceipt(drNumber, body, session.userId);
    }
    try {
      await regenerateStoredServiceInvoicePdfsForDr(result.drNumber);
    } catch (error) {
      console.error("Delivery Receipt saved but linked Service Invoice PDF refresh failed:", error);
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const inventoryResponse = inventoryErrorResponse(error);
    if (inventoryResponse) return inventoryResponse;
    const message =
      error instanceof Error ? error.message : "Failed to update delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    await deleteDeliveryReceipt(drNumber, { userId: session.userId, displayName: session.fullName }, session.userRoleId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete delivery receipt.";
    return NextResponse.json({ error: message }, { status: error instanceof SalesOrderError ? error.status : 500 });
  }
}
