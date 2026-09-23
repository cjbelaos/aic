"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/logo-loader";
import {
  OrderForm,
  type SalesOrderReferenceFiles,
} from "@/components/sales-orders/order-form";
import salesOrderService, {
  type OptionsResponse,
  type OrderInput,
} from "@/lib/services/sales-order.service";

export default function NewSalesOrderPage(): React.ReactNode {
  const router = useRouter();
  const [options, setOptions] = React.useState<OptionsResponse | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    salesOrderService
      .options()
      .then(setOptions)
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "Failed to load options.",
        ),
      );
  }, []);

  const submit = async (
    payload: OrderInput,
    referenceFiles?: SalesOrderReferenceFiles,
  ): Promise<void> => {
    const result = await salesOrderService.createDraft(payload);
    const orderId = result.order.order.salesOrderId;
    let orderVersion = result.order.order.version;
    const uploads: Array<{
      documentType: "QUOTATION" | "CUSTOMER_PO";
      file?: File;
    }> = [
      { documentType: "QUOTATION", file: referenceFiles?.quotation },
      { documentType: "CUSTOMER_PO", file: referenceFiles?.customerPO },
    ];
    const failedUploads: string[] = [];

    for (const upload of uploads) {
      if (!upload.file) continue;
      try {
        await salesOrderService.uploadDocument(orderId, {
          documentType: upload.documentType,
          file: upload.file,
          orderVersion,
        });
        orderVersion = (await salesOrderService.get(orderId)).order.version;
      } catch {
        failedUploads.push(upload.file.name);
      }
    }

    if (failedUploads.length > 0) {
      toast.error(
        `Sales Order created, but ${failedUploads.join(", ")} could not be uploaded. Retry it in Documents.`,
      );
    } else if (uploads.some((upload) => upload.file)) {
      toast.success("Sales Order created and reference documents uploaded.");
    }
    router.push(`/dashboard/sales-orders/${orderId}`);
  };

  const createFromQuotation = async (quotationNo: string): Promise<void> => {
    const result = await salesOrderService.fromQuotation(quotationNo);
    const id = result.order.order.salesOrderId;
    router.push(
      result.order.reusedExisting
        ? `/dashboard/sales-orders/${id}`
        : `/dashboard/sales-orders/${id}/edit`,
    );
  };

  if (error)
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {error}
      </p>
    );
  if (!options) return <PageLoader label="Loading sales order options" />;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create Sales Order
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the customer, commercial details, products or services, and
            pricing.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/sales-orders")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sales Orders
        </Button>
      </div>
      <OrderForm
        initial={{
          customerId: "",
          receivedDate: new Date().toISOString().slice(0, 10),
          lines: [],
        }}
        options={options}
        submitLabel="Create Sales Order"
        onSubmit={submit}
        onCancel={() => router.push("/dashboard/sales-orders")}
        onCreateFromQuotation={createFromQuotation}
        enableReferenceUploads
      />
    </div>
  );
}
