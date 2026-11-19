import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDeliveryReceiptStatus } from "@/lib/deliverySheets";
import { validateSerialUpdate } from "@/lib/deliverySerials";
import { getDeliveryItems, updateDeliveryItemSerials } from "@/lib/transactionItemSheets";

/**
 * Serial-only update. Allowed on Completed DRs (which are otherwise locked) so a
 * "Serial missing" flag can always be resolved. Never touches the DR header or
 * Sales Order fulfillment.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });

    const status = await getDeliveryReceiptStatus(drNumber);
    if (status === null) return NextResponse.json({ error: `DR #${drNumber} not found.` }, { status: 404 });

    const body = await request.json().catch(() => null);
    const items = (await getDeliveryItems()).get(drNumber) ?? [];
    const existingItemIds = items.flatMap((item) => (item.deliveryReceiptItemId ? [item.deliveryReceiptItemId] : []));
    const result = validateSerialUpdate({ status, body, existingItemIds });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await updateDeliveryItemSerials(drNumber, result.updates);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to update delivery receipt serials:", error);
    const message = error instanceof Error ? error.message : "Failed to update serials.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
