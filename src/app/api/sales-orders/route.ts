import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { attachDocument, createOrder, listOrders } from "@/lib/salesOrders/service";
import { syncSalesOrderToTracker } from "@/lib/salesOrders/trackerWriter";
import { parseCreateOrderInput } from "@/lib/salesOrders/validation";
import { getQuotationByRefNo } from "@/lib/quotationSheets";

export async function GET(request: Request) {
  const auth = await requireSalesPermission("so.view");
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const query = url.searchParams;
    const result = await listOrders({
      page: Number.parseInt(query.get("page") ?? "1"),
      pageSize: Number.parseInt(query.get("pageSize") ?? "15"),
      q: query.get("q") ?? undefined,
      status: query.get("status") ?? undefined,
      fulfillmentStatus: query.get("fulfillmentStatus") ?? undefined,
      customerId: query.get("customerId") ?? undefined,
      category: query.get("category") ?? undefined,
      assignedToUserId: query.get("assignedToUserId") ?? undefined,
      dateFrom: query.get("dateFrom") ?? undefined,
      dateTo: query.get("dateTo") ?? undefined,
      overdue: query.get("overdue") === "true",
      view: (query.get("view") === "services" ? "services" : "all"),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesPermission("so.create");
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const input = parseCreateOrderInput(body);
    const session = auth.session;
    let quotationUrl = "";
    let quotationFileId = "";
    if (input.quotationSource === "INTERNAL" && input.sourceQuotationNo) {
      const quotation = await getQuotationByRefNo(input.sourceQuotationNo);
      quotationUrl = quotation?.file ?? "";
      quotationFileId = quotationUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? "";
      if (!quotationFileId) throw new Error(`Quotation ${input.sourceQuotationNo} has no saved PDF. Save its PDF before creating a Sales Order.`);
    }
    const detail = await createOrder(toActor(session), {
      commandId: input.commandId,
      initialStatus: input.initialStatus,
      sourceQuotationNo: input.sourceQuotationNo,
      quotationSource: input.quotationSource,
      externalQuotationNo: input.externalQuotationNo,
      customerId: input.customerId,
      customerNameSnapshot: input.customerNameSnapshot,
      customerTINSnapshot: input.customerTINSnapshot,
      billingAddressSnapshot: input.billingAddressSnapshot,
      contactId: input.contactId,
      contactNameSnapshot: input.contactNameSnapshot,
      contactPhoneSnapshot: input.contactPhoneSnapshot,
      deliveryAddressSnapshot: input.deliveryAddressSnapshot,
      customerPONo: input.customerPONo,
      paymentTermId: input.paymentTermId,
      paymentTermsSnapshot: input.paymentTermsSnapshot,
      receivedDate: input.receivedDate,
      requiredDate: input.requiredDate,
      assignedToUserId: input.assignedToUserId,
      currency: input.currency,
      remarks: input.remarks,
      lines: input.lines,
    });
    if (quotationFileId) {
      await attachDocument(toActor(session), detail.order.salesOrderId, {
        commandId: crypto.randomUUID(), documentType: "QUOTATION",
        externalDocumentNo: input.sourceQuotationNo, driveFileId: quotationFileId,
        externalUrl: quotationUrl, fileName: `Quotation - ${input.sourceQuotationNo}.pdf`,
        mimeType: "application/pdf", orderVersion: detail.order.version,
      });
    }
    await syncSalesOrderToTracker(detail.order, detail.items, { quotation: quotationUrl });
    return NextResponse.json({ success: true, order: detail }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
