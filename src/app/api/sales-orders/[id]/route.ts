import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { deleteDraftOrder, getOrderDetail, updateOrder } from "@/lib/salesOrders/service";
import { parseUpdateOrderInput } from "@/lib/salesOrders/validation";
import { readSalesOrderById, readSalesOrderItems } from "@/lib/salesOrders/repository";
import { syncSalesOrderToTracker } from "@/lib/salesOrders/trackerWriter";
import { getUsers } from "@/lib/userSheets";
import { syncSalesOrderDeliveryReferences } from "@/lib/deliverySheets";
import { syncSalesOrderServiceInvoiceReferences } from "@/lib/serviceInvoiceSheets";
import { getProducts } from "@/lib/productSheets";
import { getProductCategories, getProductUnits } from "@/lib/productReferenceSheets";
import { bindNewCatalogLines } from "@/lib/salesOrders/catalogBinding";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.view");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const detail = await getOrderDetail(id);
    const users = await getUsers();
    const fullNameByUserId = new Map(users.map((user) => [user.userId, user.fullName]));
    return NextResponse.json(
      {
        success: true,
        ...detail,
        history: detail.history.map((entry) => ({
          ...entry,
          actorFullName: fullNameByUserId.get(entry.actorUserId) || entry.actorUserId,
        })),
        capabilities: {
          canEdit: auth.session.userRoleId === 1 || detail.order.assignedToUserId === auth.session.userId,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await readSalesOrderById(id).catch(() => null);
  const auth = await requireSalesPermission("so.edit.draft", {
    assignedToUserId: existing?.assignedToUserId,
    orderStatus: existing?.orderStatus,
  });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const input = parseUpdateOrderInput(body);
    const previousItems = input.lines ? await readSalesOrderItems(id) : [];
    const previousById = new Map(previousItems.map((item) => [item.salesOrderItemId, item]));
    const changedIdentity = (line: NonNullable<typeof input.lines>[number]) => {
      const previous = line.salesOrderItemId ? previousById.get(line.salesOrderItemId) : undefined;
      return !previous || previous.lineType !== line.lineType || previous.productId !== line.productId;
    };
    const catalog = input.lines?.some((line) => changedIdentity(line) && (line.lineType === "SERVICE" || !!line.productId))
      ? await Promise.all([getProducts(), getProductCategories(), getProductUnits()]) : null;
    const lines = input.lines && catalog
      ? bindNewCatalogLines(input.lines, { products: catalog[0], categories: catalog[1], units: catalog[2] }, changedIdentity)
      : input.lines;
    const detail = await updateOrder(toActor(auth.session), id, {
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      receivedDate: input.receivedDate,
      requiredDate: input.requiredDate,
      assignedToUserId: input.assignedToUserId,
      customerPONo: input.customerPONo,
      paymentTermId: input.paymentTermId,
      paymentTermsSnapshot: input.paymentTermsSnapshot,
      remarks: input.remarks,
      customerId: input.customerId,
      customerNameSnapshot: input.customerNameSnapshot,
      customerTINSnapshot: input.customerTINSnapshot,
      billingAddressSnapshot: input.billingAddressSnapshot,
      contactId: input.contactId,
      contactNameSnapshot: input.contactNameSnapshot,
      contactPhoneSnapshot: input.contactPhoneSnapshot,
      deliveryAddressSnapshot: input.deliveryAddressSnapshot,
      lines,
    });
    await syncSalesOrderToTracker(detail.order, detail.items);
    if (existing?.customerPONo !== detail.order.customerPONo) {
      try {
        await syncSalesOrderDeliveryReferences(detail.order.salesOrderId);
        await syncSalesOrderServiceInvoiceReferences(detail.order.salesOrderId);
      } catch (error) {
        // The order write is already durable; document regeneration can safely
        // be retried without rejecting the customer PO update.
        console.error("Sales Order saved but linked document refresh failed:", error);
      }
    }
    return NextResponse.json({ success: true, order: detail }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await readSalesOrderById(id).catch(() => null);
  const auth = await requireSalesPermission("so.delete.draft", {
    assignedToUserId: existing?.assignedToUserId,
    orderStatus: existing?.orderStatus,
  });
  if (auth.response) return auth.response;
  try {
    await deleteDraftOrder(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
