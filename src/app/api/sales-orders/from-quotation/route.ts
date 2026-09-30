import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { createOrderFromQuotation } from "@/lib/salesOrders/service";
import { syncSalesOrderToTracker } from "@/lib/salesOrders/trackerWriter";
import { parseFromQuotationInput } from "@/lib/salesOrders/validation";
import { getQuotationByRefNo } from "@/lib/quotationSheets";
import { attachDocument } from "@/lib/salesOrders/service";

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
    if (!detail.reusedExisting) {
      const quotation = await getQuotationByRefNo(input.quotationNo);
      const quotationUrl = quotation?.file ?? "";
      const driveFileId = quotationUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? "";
      if (!driveFileId) throw new Error("The quotation PDF link is missing after conversion.");
      await attachDocument(toActor(auth.session), detail.order.salesOrderId, {
        commandId: crypto.randomUUID(), documentType: "QUOTATION",
        externalDocumentNo: quotation!.quotationNo, driveFileId,
        externalUrl: quotationUrl, fileName: `Quotation - ${quotation!.quotationNo}.pdf`,
        mimeType: "application/pdf", orderVersion: detail.order.version,
      });
      await syncSalesOrderToTracker(detail.order, detail.items, { quotation: quotationUrl });
    } else {
      await syncSalesOrderToTracker(detail.order, detail.items);
    }
    return NextResponse.json({ success: true, order: detail }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
