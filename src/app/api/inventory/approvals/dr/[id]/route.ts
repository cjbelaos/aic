import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDeliveryReceipts, updateDeliveryReceipt } from "@/lib/deliverySheets";
import { postFinalizedDeliveryReleaseFulfillment } from "@/lib/deliverySalesOrderIntegration";
import { can } from "@/lib/salesOrders/permissions";
import { requireInventoryAction } from "@/lib/inventory/access";
import { withInventoryLock } from "@/lib/inventory/lock";
import { guardDrStock } from "@/lib/inventory/service";
import { inventoryErrorResponse } from "@/lib/inventory/drGuard";

type Context = { params: Promise<{ id: string }> };

/** Approve or reject a Delivery Receipt waiting for safety-stock approval. */
export async function POST(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  const level = await requireInventoryAction(session, "approval:decide");
  if (level instanceof Response) return level;
  try {
    const { id } = await params;
    const drNumber = Number.parseInt(id, 10);
    if (Number.isNaN(drNumber)) return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    const body = (await request.json()) as { decision?: string; note?: string };
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: "Decision must be approve or reject." }, { status: 400 });
    }
    const note = String(body.note ?? "").trim();
    const stamp = { approvedBy: session.userId, approvedAt: new Date().toISOString(), approvalNote: note };

    const result = await withInventoryLock(async () => {
      const stored = (await getDeliveryReceipts()).find((receipt) => receipt.drNumber === drNumber);
      if (!stored) throw Object.assign(new Error(`DR #${drNumber} not found.`), { status: 404 });
      if (stored.status.trim().toLowerCase() !== "pending_approval") {
        throw Object.assign(new Error("Only a delivery receipt waiting for approval can be approved or rejected."), { status: 422 });
      }
      if (body.decision === "reject") {
        return updateDeliveryReceipt(drNumber, { ...stamp, status: "rejected" }, session.userId);
      }
      // Re-check: another DR may have used the stock since this one was sent.
      await guardDrStock({
        drNumber,
        warehouseId: stored.warehouseId ?? "",
        date: stored.date,
        requestedStatus: "created",
        items: stored.items,
        level: "manage",
      });
      return updateDeliveryReceipt(drNumber, { ...stamp, status: "created" }, session.userId);
    });

    let fulfillment: { state: string; posted: number; alreadyPosted: number } | undefined;
    if (body.decision === "approve" && result.salesOrderId) {
      const permission = can("so.fulfill", { roleId: session.userRoleId, actorUserId: session.userId });
      if (!permission.allowed) {
        fulfillment = { state: "PENDING_AUTHORIZATION", posted: 0, alreadyPosted: 0 };
      } else {
        try {
          fulfillment = await postFinalizedDeliveryReleaseFulfillment(result.drNumber, { userId: session.userId, displayName: session.fullName });
        } catch (error) {
          console.error("DR approved but Sales Order fulfillment needs reconciliation:", error);
          fulfillment = { state: "PENDING_RECONCILIATION", posted: 0, alreadyPosted: 0 };
        }
      }
    }
    return NextResponse.json({ ...result, fulfillment });
  } catch (error) {
    const inventoryResponse = inventoryErrorResponse(error);
    if (inventoryResponse) return inventoryResponse;
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to decide the approval." }, { status });
  }
}
