import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { createDraftFromQuotation } from "@/lib/salesOrders/service";
import { parseFromQuotationInput } from "@/lib/salesOrders/validation";

/** POST /api/sales-orders/from-quotation — converts a quotation into a DRAFT order. */
export async function POST(request: Request) {
  const auth = await requireSalesPermission("so.create");
  if (auth.response) return auth.response;
  try {
    const input = parseFromQuotationInput(await request.json());
    const detail = await createDraftFromQuotation(toActor(auth.session), {
      commandId: input.commandId,
      quotationNo: input.quotationNo,
    });
    return NextResponse.json({ success: true, order: detail }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}