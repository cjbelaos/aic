import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { confirmOrder } from "@/lib/salesOrders/service";
import { parseExpectedVersion } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.confirm");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseExpectedVersion(await request.json());
    const detail = await confirmOrder(toActor(auth.session), id, { commandId: input.commandId, expectedVersion: input.expectedVersion });
    return NextResponse.json({ success: true, order: detail }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}