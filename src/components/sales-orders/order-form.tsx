"use client";

import * as React from "react";
import { FileText, Loader2, Save, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LineEditor } from "@/components/sales-orders/line-editor";
import { money } from "@/components/sales-orders/badges";
import {
  EXTERNAL_QUOTATION_FIELD_LABEL,
  EXTERNAL_QUOTATION_REQUIRED_ERROR,
  INPUT_EXTERNAL_QUOTATION_LABEL,
  INTERNAL_QUOTATION_FIELD_LABEL,
  SELECT_EXISTING_QUOTATION_LABEL,
} from "@/lib/salesOrders/quotationReference";
import type { OptionsResponse, OrderInput, OrderLineInput } from "@/lib/services/sales-order.service";

export interface OrderFormProps {
  initial: OrderInput;
  options: OptionsResponse;
  submitLabel: string;
  onSubmit: (payload: OrderInput, referenceFiles?: SalesOrderReferenceFiles) => Promise<void>;
  onCancel?: () => void;
  onCreateFromQuotation?: (quotationNo: string) => Promise<void>;
  enableReferenceUploads?: boolean;
}

export interface SalesOrderReferenceFiles {
  quotation?: File;
  customerPO?: File;
}

function estimatedTotal(line: OrderLineInput): number {
  if (line.quantity === null || line.unitPrice === null) return 0;
  const payable = Math.max(0, line.quantity * line.unitPrice - (line.discountAmount ?? 0));
  return line.taxMode === "VAT_EXCLUSIVE" ? payable * (1 + (line.taxRate ?? 0)) : payable;
}

export function OrderForm({ initial, options, submitLabel, onSubmit, onCancel, onCreateFromQuotation, enableReferenceUploads = false }: OrderFormProps): React.ReactNode {
  const [header, setHeader] = React.useState({
    customerId: initial.customerId,
    receivedDate: initial.receivedDate,
    requiredDate: initial.requiredDate ?? "",
    assignedToUserId: initial.assignedToUserId ?? "",
    customerPONo: initial.customerPONo ?? "",
    paymentTermId: initial.paymentTermId ?? "",
    remarks: initial.remarks ?? "",
    sourceQuotationNo: initial.sourceQuotationNo ?? "",
    quotationSource: initial.quotationSource ?? (initial.externalQuotationNo ? "EXTERNAL" : "INTERNAL"),
    externalQuotationNo: initial.externalQuotationNo ?? "",
  });
  const [lines, setLines] = React.useState<OrderLineInput[]>(initial.lines);
  const [submitting, setSubmitting] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [referenceFiles, setReferenceFiles] = React.useState<SalesOrderReferenceFiles>({});
  const dirty = React.useRef(false);

  const markDirty = <T,>(fn: () => T): T => { dirty.current = true; return fn(); };
  const patchHeader = (patch: Partial<typeof header>): void => markDirty(() => setHeader((current) => ({ ...current, ...patch })));

  React.useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => { if (dirty.current) event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const selectedCustomer = options.customers.find((customer) => customer.customerId === header.customerId);
  const grandTotal = lines.reduce((sum, line) => sum + estimatedTotal(line), 0);

  const submit = async (): Promise<void> => {
    if (submitting) return;
    const selectedFiles = Object.values(referenceFiles).filter((file): file is File => Boolean(file));
    const invalidFile = selectedFiles.find((file) => file.size > 10 * 1024 * 1024 || !/\.(pdf|jpe?g|png|webp|docx?)$/i.test(file.name));
    if (invalidFile) {
      setError(`${invalidFile.name} must be a PDF, JPG, PNG, WebP, DOC, or DOCX file that is 10 MB or smaller.`);
      return;
    }
    if (header.quotationSource === "EXTERNAL" && !header.externalQuotationNo.trim()) {
      setError(EXTERNAL_QUOTATION_REQUIRED_ERROR);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        ...initial,
        ...header,
        customerNameSnapshot: selectedCustomer?.companyName ?? initial.customerNameSnapshot,
        customerTINSnapshot: selectedCustomer?.tin ?? initial.customerTINSnapshot,
        billingAddressSnapshot: selectedCustomer?.address ?? initial.billingAddressSnapshot,
        lines,
      }, enableReferenceUploads ? referenceFiles : undefined);
      dirty.current = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save the Sales Order.");
      setSubmitting(false);
    }
  };

  const switchQuotationSource = (source: "INTERNAL" | "EXTERNAL"): void => {
    markDirty(() => setHeader((current) => source === "EXTERNAL"
      ? { ...current, quotationSource: "EXTERNAL", sourceQuotationNo: "" }
      : { ...current, quotationSource: "INTERNAL", externalQuotationNo: "" }));
  };

  const convertQuotation = async (): Promise<void> => {
    if (!onCreateFromQuotation || header.quotationSource === "EXTERNAL" || !header.sourceQuotationNo || converting) return;
    setConverting(true);
    setError("");
    try {
      await onCreateFromQuotation(header.sourceQuotationNo);
      dirty.current = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create the Sales Order from the quotation.");
      setConverting(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {onCreateFromQuotation ? (
        <Card className="gap-4">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-blue-600" />Quotation Number</CardTitle><p className="text-sm text-muted-foreground">Select an existing quotation, or enter an external quotation number that has no internal record. Each selected quotation has one active Sales Order; selecting it again opens the existing order instead of creating a duplicate.</p></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {header.quotationSource === "EXTERNAL" ? (
              <Field label={EXTERNAL_QUOTATION_FIELD_LABEL} required className="min-w-0 flex-1">
                <Input
                  value={header.externalQuotationNo}
                  onChange={(event) => patchHeader({ externalQuotationNo: event.target.value })}
                  placeholder="Enter the external quotation number"
                  aria-label={EXTERNAL_QUOTATION_FIELD_LABEL}
                />
              </Field>
            ) : (
              <Field label={INTERNAL_QUOTATION_FIELD_LABEL} className="min-w-0 flex-1">
                <SearchableSelect value={header.sourceQuotationNo} onValueChange={(value) => patchHeader({ sourceQuotationNo: value })} options={options.quotations.map((quotation) => ({ value: quotation.quotationNo, label: `${quotation.quotationNo} — ${quotation.customer} — ${money(quotation.amount)}` }))} placeholder="Select quotation…" searchPlaceholder="Search quotation or customer…" />
              </Field>
            )}
            {header.quotationSource === "EXTERNAL" ? (
              <Button type="button" variant="outline" onClick={() => switchQuotationSource("INTERNAL")}><FileText className="mr-2 h-4 w-4" />{SELECT_EXISTING_QUOTATION_LABEL}</Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => switchQuotationSource("EXTERNAL")}><FileText className="mr-2 h-4 w-4" />{INPUT_EXTERNAL_QUOTATION_LABEL}</Button>
            )}
            {header.quotationSource === "EXTERNAL" ? null : (
              <Button type="button" variant="outline" disabled={!header.sourceQuotationNo || converting} onClick={() => void convertQuotation()}>{converting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Create from Quotation</Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-4">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4 text-blue-600" />Order information</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-12">
            <Field label="Customer" required className="md:col-span-6"><SearchableSelect value={header.customerId} onValueChange={(value) => patchHeader({ customerId: value })} options={options.customers.map((customer) => ({ value: customer.customerId, label: customer.companyName }))} placeholder="Select customer…" searchPlaceholder="Search customer…" /></Field>
            <Field label="Received date" required className="md:col-span-3"><Input type="date" value={header.receivedDate} onChange={(event) => patchHeader({ receivedDate: event.target.value })} /></Field>
            <Field label="Required date" className="md:col-span-3"><Input type="date" value={header.requiredDate} onChange={(event) => patchHeader({ requiredDate: event.target.value })} /></Field>
            <Field label="Customer PO No." className="md:col-span-4"><Input value={header.customerPONo} onChange={(event) => patchHeader({ customerPONo: event.target.value })} placeholder="Optional customer reference" /></Field>
            <Field label="Payment terms" className="md:col-span-4"><SearchableSelect value={header.paymentTermId} onValueChange={(value) => patchHeader({ paymentTermId: value })} options={options.terms.map((term) => ({ value: term.paymentTermId, label: term.name }))} placeholder="Select terms…" /></Field>
            <Field label="Assigned PIC" className="md:col-span-4"><SearchableSelect value={header.assignedToUserId} onValueChange={(value) => patchHeader({ assignedToUserId: value })} options={options.users.map((user) => ({ value: user.userId, label: user.fullName }))} placeholder="Assign PIC…" /></Field>
          </div>
          {selectedCustomer ? <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-2"><span>TIN: {selectedCustomer.tin || "—"}</span><span>Address: {selectedCustomer.address || "—"}</span></div> : null}
          <Field label="Remarks"><Textarea rows={3} value={header.remarks} onChange={(event) => patchHeader({ remarks: event.target.value })} placeholder="Order notes or delivery instructions" /></Field>
        </CardContent>
      </Card>

      {enableReferenceUploads ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-blue-600" />Reference documents</CardTitle>
            <p className="text-sm text-muted-foreground">Optional. Select a current or external quotation and/or the customer&apos;s external PO. They upload automatically when this Sales Order is created.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ReferenceFileInput label="Current / external quotation" file={referenceFiles.quotation} onChange={(file) => { setReferenceFiles((current) => ({ ...current, quotation: file })); dirty.current = true; }} />
            <ReferenceFileInput label="Customer external PO" file={referenceFiles.customerPO} onChange={(file) => { setReferenceFiles((current) => ({ ...current, customerPO: file })); dirty.current = true; }} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-4">
        <CardHeader><CardTitle className="text-base">Products / Services</CardTitle></CardHeader>
        <CardContent><LineEditor lines={lines} onChange={(next) => markDirty(() => setLines(next))} units={options.units} products={options.products} orderCategories={options.orderCategories} /></CardContent>
      </Card>

      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm text-muted-foreground">Estimated order total</p><p className="text-xs text-muted-foreground">The server recalculates and validates all amounts when saved.</p></div>
          <p className="text-2xl font-semibold tabular-nums" data-testid="order-total">{money(grandTotal)}</p>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" />Cancel</Button> : null}
        <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600" disabled={submitting || lines.length === 0}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{submitting ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, required = false, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }): React.ReactNode {
  return <div className={className}><Label className="mb-1.5 block">{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</Label>{children}</div>;
}

function ReferenceFileInput({ label, file, onChange }: { label: string; file?: File; onChange: (file?: File) => void }): React.ReactNode {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  return (
    <div className="min-w-0 space-y-2 rounded-md border border-dashed p-3">
      <Label htmlFor={inputId} className="block">{label}</Label>
      <Input ref={inputRef} id={inputId} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(event) => onChange(event.target.files?.[0])} />
      <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP, DOC, or DOCX · up to 10 MB</p>
      {file ? <div className="flex min-w-0 items-center justify-between gap-2 text-sm"><span className="truncate" title={file.name}>{file.name}</span><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remove ${label}`} onClick={() => { onChange(); if (inputRef.current) inputRef.current.value = ""; }}><X className="h-4 w-4" /></Button></div> : null}
    </div>
  );
}
