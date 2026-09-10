import { NextResponse } from "next/server";
import { isAdminRole, requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updatePurchaseOrder,
  deletePurchaseOrder,
  PurchaseOrderNumberConflictError,
} from "@/lib/purchaseOrderSheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import { getPurchaseOrderItemsV2 } from "@/lib/transactionItemV2Sheets";

const PURCHASE_ORDERS_SHEET = "PurchaseOrders";
const PURCHASE_ORDER_ITEMS_SHEET = "PurchaseOrderItems";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const poNumber = id.trim();
    if (!poNumber) {
      return NextResponse.json(
        { error: "Invalid PO number." },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Find PO header row
    const poRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A2:A`,
    });
    const rows = poRows.data.values || [];
    const poRowIdx = rows.findIndex((row) => {
      const val = String(row[0] ?? "").trim();
      return val === poNumber;
    });
    if (poRowIdx < 0) {
      return NextResponse.json(
        { error: `PO #${poNumber} not found.` },
        { status: 404 },
      );
    }
    const poRowNumber = poRowIdx + 2;

    const poResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PURCHASE_ORDERS_SHEET}!A${poRowNumber}:P${poRowNumber}`,
    });
    const poRow = poResponse.data.values?.[0] || [];
    const date = String(poRow[1] ?? "").trim();
    const supplierId = String(poRow[2] ?? "").trim();
    const prNumber = String(poRow[3] ?? "").trim();
    const deliveryDate = String(poRow[4] ?? "").trim();
    const paymentTerms = String(poRow[5] ?? "").trim();
    const comments = String(poRow[6] ?? "").trim();
    const preparedBy = String(poRow[7] ?? "").trim();
    const approvedBy = String(poRow[8] ?? "").trim();
    const totalAmount = parseFloat(String(poRow[10] ?? "0")) || 0;
    const status = String(poRow[11] ?? "created").trim();
    const driveFileLink = String(poRow[12] ?? "").trim();

    // 2. Fetch PO items
    const itemsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PURCHASE_ORDER_ITEMS_SHEET}!A2:G`,
    });
    const allItemRows = itemsResponse.data.values || [];
    const legacyItems = allItemRows
      .filter((row) => {
        const poId = String(row[0] ?? "").trim();
        return poId === poNumber;
      })
      .map((row) => ({
        itemNo: parseInt(String(row[1] ?? "0"), 10) || 0,
        description: String(row[2] ?? "").trim(),
        quantity: parseInt(String(row[3] ?? "0"), 10) || 0,
        unit: String(row[4] ?? "").trim(),
        pricePerUnit: parseFloat(String(row[5] ?? "0")) || 0,
        totalAmount: parseFloat(String(row[6] ?? "0")) || 0,
      }));
    const v2Items = await getPurchaseOrderItemsV2();
    const items = v2Items.get(poNumber) || legacyItems;

    // 3. Fetch supplier details
    const suppliers = await getCompanies();
    const supplier = suppliers.find(
      (s) => s.companyId === supplierId || s.id === supplierId,
    );
    const supplierName = supplier?.companyName || supplierId;
    const address = supplier?.address || "";
    const tin = supplier?.tin || "";

    // 4. Return PO data (PDF is generated client-side from the HTML form layout)
    return NextResponse.json(
      {
        success: true,
        poNumber: String(poNumber),
        supplierName,
        supplierId,
        address,
        tin,
        date,
        prNumber,
        deliveryDate,
        paymentTerms,
        preparedBy,
        approvedBy,
        comments,
        items,
        status,
        totalAmount,
        driveFileLink,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch purchase order preview.";
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
    const poNumber = id.trim();
    if (!poNumber) {
      return NextResponse.json(
        { error: "Invalid PO number." },
        { status: 400 },
      );
    }

    const body = await request.json();
    if (body.poNumberMode === "manual" && !isAdminRole(session.userRoleId)) return NextResponse.json({ error: "Forbidden. Admin access is required to enter a PO number manually." }, { status: 403 });
    const result = await updatePurchaseOrder(
      poNumber,
      body,
      session.userId,
      { allowManualNumber: isAdminRole(session.userRoleId) },
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update purchase order.";
    return NextResponse.json({ error: message }, { status: error instanceof PurchaseOrderNumberConflictError ? 409 : 400 });
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
    const poNumber = id.trim();
    if (!poNumber) {
      return NextResponse.json(
        { error: "Invalid PO number." },
        { status: 400 },
      );
    }

    await deletePurchaseOrder(poNumber);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete purchase order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
