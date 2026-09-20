"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderForm } from "@/components/sales-orders/order-form";
import salesOrderService, { type OptionsResponse, type OrderInput } from "@/lib/services/sales-order.service";

export default function EditSalesOrderPage(): React.ReactNode {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [options, setOptions] = React.useState<OptionsResponse | null>(null);
  const [detail, setDetail] = React.useState<Awaited<ReturnType<typeof salesOrderService.get>> | null>(null);
  const [error, setError] = React.useState("");
  const orderId = params?.id ?? "";

  React.useEffect(() => {
    Promise.all([salesOrderService.options(), salesOrderService.get(orderId)])
      .then(([optionResult, detailResult]) => { setOptions(optionResult); setDetail(detailResult); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load the Sales Order."));
  }, [orderId]);

  const submit = async (payload: OrderInput): Promise<void> => {
    if (!detail) return;
    await salesOrderService.updateDraft(orderId, { ...payload, expectedVersion: detail.order.version });
    router.push(`/dashboard/sales-orders/${orderId}`);
  };

  if (error) return <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>;
  if (!options || !detail) return <div className="space-y-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const order = detail.order;
  const initial: OrderInput = {
    sourceQuotationNo: order.quotationNo,
    customerId: order.customerId,
    customerNameSnapshot: order.customerNameSnapshot,
    customerTINSnapshot: order.customerTINSnapshot,
    billingAddressSnapshot: order.billingAddressSnapshot,
    contactId: order.contactId,
    contactNameSnapshot: order.contactNameSnapshot,
    contactPhoneSnapshot: order.contactPhoneSnapshot,
    deliveryAddressSnapshot: order.deliveryAddressSnapshot,
    customerPONo: order.customerPONo,
    paymentTermId: order.paymentTermId,
    paymentTermsSnapshot: order.paymentTermsSnapshot,
    receivedDate: order.receivedDate,
    requiredDate: order.requiredDate,
    assignedToUserId: order.assignedToUserId,
    currency: order.currency,
    remarks: order.remarks,
    lines: detail.items.filter((item) => item.lineStatus !== "INACTIVE").map((item) => ({
      salesOrderItemId: item.salesOrderItemId,
      lineType: item.lineType,
      productId: item.productId,
      productCodeSnapshot: item.productCodeSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      customerProductName: item.customerProductNameSnapshot,
      description: item.description,
      unitId: item.unitId,
      unitSnapshot: item.unitSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      priceSource: item.priceSource,
      priceOverrideReason: item.priceOverrideReason,
      customerProductPriceId: item.customerProductPriceId,
      quotationLineReference: item.quotationLineReference,
      discountAmount: item.discountAmount,
      taxMode: item.taxMode,
      taxRate: item.taxRate,
      orderCategory: item.orderCategory,
    })),
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Edit {order.salesOrderNo || "Sales Order Draft"}</h1><p className="text-sm text-muted-foreground">Version {order.version}. Your edits are checked for conflicts when saved.</p></div>
        <Button variant="outline" onClick={() => router.push(`/dashboard/sales-orders/${orderId}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to Order</Button>
      </div>
      <OrderForm initial={initial} options={options} submitLabel="Save Changes" onSubmit={submit} onCancel={() => router.push(`/dashboard/sales-orders/${orderId}`)} />
    </div>
  );
}
