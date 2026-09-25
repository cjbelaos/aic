import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { createDraft, listOrders } from "@/lib/salesOrders/service";
import { parseCreateOrderInput } from "@/lib/salesOrders/validation";

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
      syncStatus: query.get("syncStatus") ?? undefined,
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
    const detail = await createDraft(toActor(session), {
      commandId: input.commandId,
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
    return NextResponse.json({ success: true, order: detail }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}