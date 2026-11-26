import { NextResponse } from "next/server";
import { notifyRecommender } from "@/lib/salesOrders/recommenderNotice";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { confirmOrder } from "@/lib/salesOrders/service";
import { syncSalesOrderToTracker } from "@/lib/salesOrders/trackerWriter";
import { parseExpectedVersion } from "@/lib/salesOrders/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.confirm");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseExpectedVersion(await request.json());
    const detail = await confirmOrder(toActor(auth.session), id, { commandId: input.commandId, expectedVersion: input.expectedVersion });
    // Only a DRAFT can be confirmed here, so this is always the first confirmation.
    // Email before the tracker sync so a sync failure cannot lose it.
    const notice = await notifyRecommender(detail.order, detail.items, new URL(request.url).origin);
    const links = {
      quotation: detail.documents.find((document) => document.documentType === "QUOTATION")?.externalUrl,
      customerPO: detail.documents.find((document) => document.documentType === "CUSTOMER_PO")?.externalUrl,
    };
    await syncSalesOrderToTracker(detail.order, detail.items, links);
    return NextResponse.json({ success: true, order: detail, notice }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
