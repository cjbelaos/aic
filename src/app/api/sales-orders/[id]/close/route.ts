import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { closeOrder } from "@/lib/salesOrders/service";
import { parseExpectedVersion } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.confirm");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const raw = await request.json();
    const input = parseExpectedVersion(raw);
    const body = raw as { reason?: string };
    const detail = await closeOrder(toActor(auth.session), id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      reason: typeof body.reason === "string" ? body.reason : "",
    });
    return NextResponse.json({ success: true, order: detail }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}