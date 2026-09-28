import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { createOrderFromQuotation } from "@/lib/salesOrders/service";
import { syncSalesOrderToTracker } from "@/lib/salesOrders/trackerWriter";
import { parseFromQuotationInput } from "@/lib/salesOrders/validation";

/** POST /api/sales-orders/from-quotation — creates a confirmed Sales Order. */
export async function POST(request: Request) {
  const auth = await requireSalesPermission("so.create");
  if (auth.response) return auth.response;
  try {
    const input = parseFromQuotationInput(await request.json());
    const detail = await createOrderFromQuotation(toActor(auth.session), {
      commandId: input.commandId,
      quotationNo: input.quotationNo,
      initialStatus: input.initialStatus,
    });
    await syncSalesOrderToTracker(detail.order, detail.items);
    return NextResponse.json({ success: true, order: detail }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
