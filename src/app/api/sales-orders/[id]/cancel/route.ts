import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { cancelOrder } from "@/lib/salesOrders/service";
import { parseCancelOrderInput } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.cancel");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseCancelOrderInput(await request.json());
    const detail = await cancelOrder(toActor(auth.session), id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      cancelAllLines: input.cancelAllLines,
      lines: input.lines,
    });
    return NextResponse.json({ success: true, order: detail }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}