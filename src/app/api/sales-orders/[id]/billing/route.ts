import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse } from "@/lib/salesOrders/http-helpers";
import { getOrderDetail } from "@/lib/salesOrders/service";
import { billingProgress, effectiveBillingType } from "@/lib/salesOrders/billing";
import { readSalesOrderLinkedInvoices } from "@/lib/invoiceRepository";
import { getDeliveryReceipts } from "@/lib/deliverySheets";

/** GET /api/sales-orders/[id]/billing — the order's DRs, SI/SR invoices and billing progress. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.view");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const [detail, invoices, receipts] = await Promise.all([getOrderDetail(id), readSalesOrderLinkedInvoices(id), getDeliveryReceipts()]);
    return NextResponse.json({
      billingType: effectiveBillingType(detail.order, detail.category, invoices),
      progress: billingProgress(detail.totals.grandTotal, invoices),
      invoices,
      deliveryReceipts: receipts
        .filter((receipt) => receipt.salesOrderId === id && !["deleted", "cancelled", "void"].includes(receipt.status))
        .map((receipt) => ({ drNumber: receipt.drNumber, date: receipt.date, status: receipt.status })),
    });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
