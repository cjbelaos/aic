import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { createDocumentLinks } from "@/lib/salesOrders/service";
import { parseDocumentLinkInput } from "@/lib/salesOrders/validation";

/** POST /api/sales-orders/[id]/documents/link — creates linked delivery records. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.fulfill");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const input = parseDocumentLinkInput(await request.json());
    const links = await createDocumentLinks(toActor(auth.session), id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      documentType: input.documentType as "CUSTOMER_PO" | "QUOTATION" | "SALES_ORDER_PDF" | "DELIVERY_RECEIPT" | "SERVICE_REPORT" | "OTHER",
      documentId: input.documentId,
      documentLineId: input.documentLineId,
      entries: input.entries,
    });
    return NextResponse.json({ success: true, links }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
