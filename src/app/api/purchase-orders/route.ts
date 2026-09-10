import { NextResponse } from "next/server";
import { isAdminRole, requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processPurchaseOrder,
  getPurchaseOrders,
  PurchaseOrderNumberConflictError,
} from "@/lib/purchaseOrderSheets";
import { CreatePurchaseOrderPayload } from "@/types/purchaseOrder";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const orders = await getPurchaseOrders();
    return NextResponse.json(orders, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch purchase orders.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreatePurchaseOrderPayload = await request.json();

    if (!body.supplierId?.trim()) {
      return NextResponse.json(
        { error: "Supplier is required." },
        { status: 400 },
      );
    }

    const isDraft = body.status === "draft";

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

    if (body.poNumberMode === "manual" && !isAdminRole(session.userRoleId)) {
      return NextResponse.json({ error: "Forbidden. Admin access is required to enter a PO number manually." }, { status: 403 });
    }
    const result = await processPurchaseOrder(body, session.userId, { allowManualNumber: isAdminRole(session.userRoleId) });

    // NOTE: PDF generation is now client-side (HTML layout):
    // the caller generates the letter-PDF from the HTML form and calls
    // POST /api/purchase-orders/save-pdf to persist it to Google Drive.
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process purchase order.";
    return NextResponse.json({ error: message }, { status: error instanceof PurchaseOrderNumberConflictError ? 409 : 400 });
  }
}
