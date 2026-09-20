import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { postFinalizedDeliveryReleaseFulfillment } from "@/lib/deliverySalesOrderIntegration";
import { requireSalesPermission } from "@/lib/salesOrders/http-helpers";

/** Retries a previously finalized Delivery Release's idempotent SO fulfillment. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  const salesAuth = await requireSalesPermission("so.fulfill");
  if (salesAuth.response) return salesAuth.response;
  const { id } = await params;
  const drNumber = Number.parseInt(id, 10);
  if (!Number.isInteger(drNumber) || drNumber <= 0) {
    return NextResponse.json({ error: "Invalid Delivery Release number." }, { status: 400 });
  }
  try {
    const result = await postFinalizedDeliveryReleaseFulfillment(drNumber, {
      userId: salesAuth.session.userId,
      displayName: salesAuth.session.fullName,
    });
    return NextResponse.json({ success: true, fulfillment: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to post Delivery Release fulfillment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
