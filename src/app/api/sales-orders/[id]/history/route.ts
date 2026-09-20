import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse } from "@/lib/salesOrders/http-helpers";
import { getOrderDetail } from "@/lib/salesOrders/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.view");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const detail = await getOrderDetail(id, { historyLimit: 200 });
    return NextResponse.json({ success: true, history: detail.history }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}