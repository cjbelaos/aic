import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { authorizedSyncRetry } from "@/lib/salesOrders/service";
import { parseRetrySyncInput } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.sync.retry");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseRetrySyncInput(await request.json());
    const result = await authorizedSyncRetry(toActor(auth.session), id, input.commandId);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}