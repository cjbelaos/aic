import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { postFulfillments } from "@/lib/salesOrders/service";
import { parseFulfillmentInput } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.fulfill");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseFulfillmentInput(await request.json());
    const detail = await postFulfillments(toActor(auth.session), id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      entries: input.entries,
    });
    return NextResponse.json({ success: true, order: detail }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}