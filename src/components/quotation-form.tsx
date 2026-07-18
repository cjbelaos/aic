"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Plus, Trash2, Loader2, Send, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import productService from "@/lib/services/product.service";
import customerService from "@/lib/services/customer.service";
import customerPriceService from "@/lib/services/customer-price.service";
import quotationService from "@/lib/services/quotation.service";
import { userService } from "@/lib/services/user.service";
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";
import { CustomerPrice } from "@/types/customer-price";
import { QuotationTemplate } from "@/components/quotation-template";
import { QuotationDetail, QuotationNotation } from "@/types/quotation";

/* ── Helpers ─────────────────────────────────────────────── */

// Safe fallback uuid generator for non-HTTPS dev environments
function generateId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}

async function generateSequentialQuotationNo(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `Q-${dateStr}`;

  // Fetch today's quotations to get the count
  const quotations = await quotationService.getAll();
  const todayQuotations = quotations.filter(
    (q) => q.quotationNo && q.quotationNo.startsWith(prefix),
  );

  const sequence = String(todayQuotations.length + 1).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function customerLabel(c: Customer): string {
  return c.customerName?.trim() || `Customer #${c.id}`;
}

/* ── Constants ─────────────────────────────────────────── */

const PAYMENT_TERMS = [
  "COD",
  "50% DP, 50% Full payment upon completion",
  "Special Terms",
];
const DELIVERY_TERMS = [
  "7-15 days upon confirmation of PO",
  "30-45 days upon confirmation of order",
  "30-45 days after receiving of DP",
  "30-90 days after confirmation of order",
];
const WARRANTY_TERMS = [
  "No warranty",
  "1 month warranty",
  "3 months warranty",
  "6 months warranty",
  "12 months warranty",
  "3 Months Parts and Service",
  "6 Months Parts and Service",
  "12 Months Parts and Service",
];

export type LineItem = {
  id: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

const emptyLine = (): LineItem => ({
  id: generateId(),
  productId: "",
  quantity: 1,
  unit: "",
  unitPrice: 0,
});

export type QuotationFormPayload = {
  quotationNo: string;
  date: Date;
  validity: Date;
  customer: Customer;
  quotationDescription: string;
  items: QuotationDetail[];
  notations?: QuotationNotation[];
  subTotal: number;
  discount: number;
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  status: "DRAFT" | "SENT";
  vat: number;
  vatableAmount: number;
  grandTotal: number;
};

export function QuotationForm({
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  isSaving,
  readOnly = false,
  isViewMode = false,
}: {
  initialData?: QuotationFormPayload;
  onSubmit: (
    data: QuotationFormPayload,
    pdfBlob?: Blob,
    statusOnly?: boolean,
  ) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  readOnly?: boolean;
  isViewMode?: boolean;
}) {
  const quotationRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => initialData?.date || new Date(), [initialData]);
  const validityDate = useMemo(
    () => initialData?.validity || addDays(today, 90),
    [today, initialData],
  );

  const [quotationNo, setQuotationNo] = useState(
    initialData?.quotationNo || "",
  );

  const [loading, setLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [projectDescription, setProjectDescription] = useState(
    initialData?.quotationDescription || "",
  );
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);

  // Fix: Convert QuotationNotation[] to string[] for internal state
  const [notations, setNotations] = useState<string[]>(
    initialData?.notations && initialData.notations.length > 0
      ? initialData.notations.map((n) => n.notation || "").flat()
      : [""],
  );

  const [discount, setDiscount] = useState(initialData?.discount || 0);

  const [paymentTerms, setPaymentTerms] = useState(
    initialData?.terms || PAYMENT_TERMS[0],
  );
  const [deliveryTerms, setDeliveryTerms] = useState(
    initialData?.delivery || DELIVERY_TERMS[0],
  );
  const [warrantyTerms, setWarrantyTerms] = useState(
    initialData?.warranty || WARRANTY_TERMS[0],
  );

  const [preparedBy, setPreparedBy] = useState(initialData?.preparedBy || "");

  const subTotal = lineItems.reduce(
    (sum, row) => sum + row.quantity * row.unitPrice,
    0,
  );
  const grandTotal = Math.max(subTotal - (discount || 0), 0);
  const vat = grandTotal * (12 / 112);
  const vatableAmount = grandTotal - vat;

  const selectedProductIds = useMemo(() => {
    return lineItems.map((item) => item.productId).filter(Boolean);
  }, [lineItems]);

  useEffect(() => {
    (async () => {
      try {
        // Generate quotation number if not already set
        if (!quotationNo && !initialData?.quotationNo) {
          const generatedNo = await generateSequentialQuotationNo();
          setQuotationNo(generatedNo);
        }

        const [cRes, pRes, cpRes, uRes] = await Promise.all([
          customerService.getAll(),
          productService.getAll(),
          customerPriceService.getAll(),
          userService.getAllUsers(),
        ]);

        setCustomers(cRes ?? []);
        setProducts(pRes ?? []);
        setCustomerPrices(cpRes ?? []);

        try {
          const storedAuth = window.localStorage.getItem("auth:user");
          if (storedAuth) {
            const parsedAuth = JSON.parse(storedAuth);
            const targetUsername = parsedAuth?.userName?.trim().toLowerCase();

            if (!initialData?.preparedBy && targetUsername && uRes) {
              const matchedUser = uRes.find(
                (u) => u.username?.trim().toLowerCase() === targetUsername,
              );

              if (matchedUser) {
                setPreparedBy(
                  matchedUser.fullName || parsedAuth.userName || "",
                );
              } else {
                setPreparedBy(parsedAuth.userName || "");
              }
            }
          }
        } catch (storageErr) {
          console.error(
            "Failed to extract active user fullName identity:",
            storageErr,
          );
        }

        if (initialData && cRes) {
          const initialCustomer = cRes.find(
            (c) =>
              c.customerName?.trim() ===
              initialData.customer?.customerName?.trim(),
          );
          if (initialCustomer) {
            setCustomerId(String(initialCustomer.id));
          }
        }

        if (initialData && pRes) {
          setLineItems(
            initialData.items.map((item) => {
              const matchedProduct = pRes.find(
                (p) => p.name?.trim() === item.description?.trim(),
              );
              return {
                id: generateId(),
                productId: matchedProduct ? String(matchedProduct.id) : "",
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
              };
            }),
          );
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load quotation data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [initialData]);

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);

  const customerOptions = customers.map((c) => ({
    value: String(c.id),
    label: customerLabel(c),
  }));

  // Wrapped in useCallback to preserve hook architecture integrity
  const calculateUnitPrice = useCallback(
    (prodId: string, custId: string): number => {
      const product = products.find((p) => String(p.id) === prodId);
      if (!product) return 0;

      const customer = customers.find((c) => String(c.id) === custId);
      if (customer) {
        const match = customerPrices.find(
          (cp) =>
            (cp.customerName?.trim().toLowerCase() ===
              customer.customerName?.trim().toLowerCase() ||
              String(cp.customerId) === String(customer.id)) &&
            (cp.productCode?.trim().toLowerCase() ===
              product.code?.trim().toLowerCase() ||
              String(cp.productId) === String(product.id)),
        );

        const customPrice = match
          ? (match.customPricePerUnit ??
            match.customPriceUnit ??
            match.pricePerUnit)
          : null;
        if (customPrice !== null && customPrice !== undefined) {
          return Number(customPrice);
        }
      }

      return product.pricePerUnit ?? product.costPerUnit ?? 0;
    },
    [products, customers, customerPrices],
  );

  // Recalculate price matrix rows correctly upon customer adjustments
  useEffect(() => {
    if (!customerId || lineItems.length === 0) return;
    setLineItems((prevRows) =>
      prevRows.map((row) => {
        if (!row.productId) return row;
        return {
          ...row,
          unitPrice: calculateUnitPrice(row.productId, customerId),
        };
      }),
    );
  }, [customerId, calculateUnitPrice]);

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    if (readOnly) return;
    setLineItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const onProductSelect = (rowId: string, productId: string) => {
    if (readOnly) return;
    const product = products.find((p) => String(p.id) === productId);
    let derivedUnit = "";

    if (product?.unit) {
      if (typeof product.unit === "object") {
        derivedUnit =
          (product.unit as Record<string, any>).name ||
          (product.unit as Record<string, any>).label ||
          "";
      } else {
        derivedUnit = String(product.unit);
      }
    }

    updateLine(rowId, {
      productId,
      unit: derivedUnit,
      unitPrice: calculateUnitPrice(productId, customerId),
    });
  };

  const addNewLineItem = () => {
    if (readOnly) return;
    const hasEmptyFields = lineItems.some((item) => !item.productId);
    if (hasEmptyFields) {
      toast.error(
        "Please fill out the existing line items before creating a new row.",
      );
      return;
    }
    setLineItems((rows) => [...rows, emptyLine()]);
  };

  const handleNotationChange = (index: number, value: string) => {
    if (readOnly) return;
    setNotations((prev) => prev.map((note, i) => (i === index ? value : note)));
  };

  const addNotationRow = () => {
    if (readOnly) return;
    setNotations((prev) => [...prev, ""]);
  };

  const removeNotationRow = (index: number) => {
    if (readOnly) return;
    setNotations((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : [""],
    );
  };

  const preview = () => {
    if (!selectedCustomer) {
      toast.error("Please select a customer before previewing.");
      return;
    }

    const hasEmptyFields = lineItems.some((item) => !item.productId);
    if (hasEmptyFields) {
      toast.error(
        "Please complete or remove unselected product lines before previewing.",
      );
      return;
    }

    setIsPreviewMode(true);
  };

  const handleSaveDraft = () => {
    // Validate required fields
    if (!selectedCustomer) {
      toast.error("Please select a customer.");
      return;
    }

    const hasEmptyFields = lineItems.some((item) => !item.productId);
    if (hasEmptyFields) {
      toast.error(
        "Please complete or remove unselected product lines before saving draft.",
      );
      return;
    }

    // Create payload with DRAFT status
    const payload = getPayload("DRAFT");
    // For draft, we don't need a PDF blob
    onSubmit(payload);
  };

  const getPayload = (finalStatus: "DRAFT" | "SENT"): QuotationFormPayload => {
    // Fix: Create QuotationDetail[] with proper structure
    const itemsPayload: QuotationDetail[] = lineItems.map((item) => {
      const matchedProd = products.find((p) => String(p.id) === item.productId);
      return {
        quotationNo: quotationNo,
        description: matchedProd?.name || "Manual Entry Item",
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      };
    });

    const notationsPayload: QuotationNotation[] = notations
      .filter((n) => n.trim() !== "")
      .map((note) => ({
        quotationNo: quotationNo,
        notation: note,
      }));

    return {
      quotationNo,
      date: today,
      validity: validityDate,
      customer: selectedCustomer!,
      quotationDescription: projectDescription ?? "",
      items: itemsPayload,
      subTotal,
      discount,
      terms: paymentTerms,
      delivery: deliveryTerms,
      warranty: warrantyTerms,
      preparedBy,
      notations: notationsPayload,
      status: finalStatus,
      vat,
      vatableAmount,
      grandTotal,
    };
  };

  /**
   * Store the PDF blob from the template so we can attach it during final submission.
   */
  const [pendingPdfBlob, setPendingPdfBlob] = useState<Blob | null>(null);

  const handleFinalSubmit = (payload: QuotationFormPayload, pdfBlob: Blob) => {
    // Transform the template payload to match QuotationFormPayload
    const transformedPayload: QuotationFormPayload = {
      quotationNo: payload.quotationNo,
      date: new Date(payload.date),
      validity: new Date(payload.validity),
      customer: payload.customer,
      quotationDescription: payload.quotationDescription,
      items: payload.items.map((item: any) => ({
        quotationNo: payload.quotationNo,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice || item.pricePerUnit,
      })),
      notations: payload.notations || [],
      subTotal: payload.subTotal,
      discount: payload.discount,
      terms: payload.terms,
      delivery: payload.delivery,
      warranty: payload.warranty,
      preparedBy: payload.preparedBy,
      status: payload.status,
      vat: payload.vat,
      vatableAmount: payload.vatableAmount,
      grandTotal: payload.grandTotal,
    };

    // Store the PDF blob for the parent to use
    setPendingPdfBlob(pdfBlob);

    // If in view mode, we only want to update status, not all data
    if (isViewMode && initialData?.quotationNo) {
      // Pass true as the third argument for statusOnly
      onSubmit(transformedPayload, pdfBlob, true);
    } else {
      onSubmit(transformedPayload, pdfBlob);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Ensure items structure maps to exactly what your QuotationTemplate maps over
  if (isPreviewMode && selectedCustomer) {
    const compiledItems = lineItems.map((item) => {
      const matchedProd = products.find((p) => String(p.id) === item.productId);
      return {
        quotationNo: quotationNo,
        description: matchedProd?.name || "Manual Entry Item",
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
      };
    });

    return (
      <QuotationTemplate
        ref={quotationRef}
        quotationNo={quotationNo}
        date={formatDisplayDate(today)}
        validity={formatDisplayDate(validityDate)}
        customer={selectedCustomer}
        projectDescription={projectDescription}
        paymentTerms={paymentTerms}
        deliveryTerms={deliveryTerms}
        warrantyTerms={warrantyTerms}
        items={compiledItems}
        notations={notations.filter((n) => n.trim() !== "")}
        subTotal={subTotal}
        discount={discount}
        vatableAmount={vatableAmount}
        vat={vat}
        grandTotal={grandTotal}
        preparedBy={preparedBy}
        onBack={() => setIsPreviewMode(false)}
        onConfirmSave={handleFinalSubmit}
        isSaving={isSaving}
      />
    );
  }

  // Read-only view: show data in a clean non-interactive layout
  if (readOnly) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Metadata Block - Read Only */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Quotation Details</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label>Client Name</Label>
                <Input
                  value={selectedCustomer?.customerName ?? ""}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={selectedCustomer?.address ?? ""}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input
                  value={selectedCustomer?.contactPerson ?? ""}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input
                  value={selectedCustomer?.email ?? ""}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Input
                  value={formatDisplayDate(today)}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <Label>Quotation No.</Label>
                <Input
                  value={String(quotationNo)}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <Label>Quotation Validity</Label>
                <Input
                  value={formatDisplayDate(validityDate)}
                  className="mt-1 bg-muted/40"
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <Label>Description</Label>
            <Input
              value={projectDescription}
              className="mt-1 bg-muted/40 font-semibold uppercase"
              readOnly
              disabled
            />
          </div>
        </div>

        {/* Line Items Block - Read Only */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Line Items</h2>
          <Table className="border text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Product Description</TableHead>
                <TableHead className="w-[15%] text-center">Qty</TableHead>
                <TableHead className="w-[15%] text-center">Unit</TableHead>
                <TableHead className="w-[15%] text-right">Price/Unit</TableHead>
                <TableHead className="w-[15%] text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((row) => {
                const matchedProd = products.find(
                  (p) => String(p.id) === row.productId,
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {matchedProd?.name || "Manual Entry Item"}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.unit || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(row.quantity * row.unitPrice)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Notations Block - Read Only */}
        {notations.filter((n) => n.trim() !== "").length > 0 && (
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Notations</h2>
            <ol className="list-decimal pl-4 text-sm text-slate-600 space-y-1">
              {notations
                .filter((n) => n.trim() !== "")
                .map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
            </ol>
          </div>
        )}

        {/* Footer Terms & Summary - Read Only */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-semibold mb-2">Terms & Signature</h2>
            <div>
              <Label>Terms of Payment</Label>
              <Input
                value={paymentTerms}
                className="mt-1 bg-muted/40"
                readOnly
                disabled
              />
            </div>
            <div>
              <Label>Delivery</Label>
              <Input
                value={deliveryTerms}
                className="mt-1 bg-muted/40"
                readOnly
                disabled
              />
            </div>
            <div>
              <Label>Warranty</Label>
              <Input
                value={warrantyTerms}
                className="mt-1 bg-muted/40"
                readOnly
                disabled
              />
            </div>
            <div>
              <Label>Prepared By</Label>
              <Input
                value={preparedBy}
                className="mt-1 bg-muted/40"
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-4">Summary</h2>
              <div className="space-y-3 text-sm">
                <TotalRow label="Sub Total" value={formatCurrency(subTotal)} />
                {discount > 0 && (
                  <TotalRow
                    label="Discount"
                    value={`-${formatCurrency(discount)}`}
                  />
                )}
                <TotalRow
                  label="Grand Total Vat Inc."
                  value={formatCurrency(grandTotal)}
                  bold
                />
                <TotalRow label="Vat" value={formatCurrency(vat)} italic />
                <TotalRow
                  label="Vatable Amount"
                  value={formatCurrency(vatableAmount)}
                  italic
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              {onDelete && (
                <Button
                  variant="destructive"
                  onClick={onDelete}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Metadata Block */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">
          Quotation Metadata & Customer
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Client Name</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={customerId}
                  onValueChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select customer"
                  searchPlaceholder="Search customers..."
                  disabled={isSaving || readOnly}
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={selectedCustomer?.address ?? ""}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input
                value={selectedCustomer?.contactPerson ?? ""}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                value={selectedCustomer?.email ?? ""}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input
                value={formatDisplayDate(today)}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
            <div>
              <Label>Quotation No.</Label>
              <Input
                value={String(quotationNo)}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
            <div>
              <Label>Quotation Validity</Label>
              <Input
                value={formatDisplayDate(validityDate)}
                className="mt-1 bg-muted/40 cursor-not-allowed"
                disabled
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Label>Description</Label>
          <Input
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="PORTABLE RO PARTS"
            className="font-semibold uppercase"
            disabled={isSaving || readOnly}
          />
        </div>
      </div>

      {/* Line Items Block */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Line Items</h2>
        <Table className="border text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Product Description</TableHead>
              <TableHead className="w-[15%] text-center">Qty</TableHead>
              <TableHead className="w-[15%] text-center">Unit</TableHead>
              <TableHead className="w-[15%] text-right">Price/Unit</TableHead>
              <TableHead className="w-[5%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((row) => {
              const individualProductOptions = products
                .filter(
                  (p) =>
                    String(p.id) === row.productId ||
                    !selectedProductIds.includes(String(p.id)),
                )
                .map((p) => ({
                  value: String(p.id),
                  label: p.name?.trim() || "Unnamed Product",
                }));

              return (
                <TableRow key={row.id}>
                  <TableCell className="p-1 align-top">
                    <SearchableSelect
                      value={row.productId}
                      onValueChange={(v) => onProductSelect(row.id, v)}
                      options={individualProductOptions}
                      placeholder="Select product"
                      searchPlaceholder="Search products..."
                      className="h-8 border-0 text-xs shadow-none"
                      disabled={isSaving || readOnly}
                    />
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        updateLine(row.id, {
                          quantity: Number(e.target.value) || 0,
                        })
                      }
                      className="h-8 w-16 border-0 text-center text-xs shadow-none mx-auto"
                      disabled={isSaving || readOnly}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    {row.unit || "—"}
                  </TableCell>
                  <TableCell className="text-right px-2 font-medium">
                    {formatCurrency(row.unitPrice)}
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() =>
                        setLineItems((rows) =>
                          rows.length > 1
                            ? rows.filter((r) => r.id !== row.id)
                            : rows,
                        )
                      }
                      disabled={isSaving || readOnly}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={addNewLineItem}
          disabled={isSaving || readOnly}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add New Line Item Row
        </Button>
      </div>

      {/* Notations Block */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Notations</h2>
        <div className="space-y-2">
          {notations.map((note, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground w-6 text-center">
                {index + 1}.
              </span>
              <Input
                value={note}
                onChange={(e) => handleNotationChange(index, e.target.value)}
                placeholder="Enter additional notification details or contract parameters..."
                className="h-9 text-xs"
                disabled={isSaving || readOnly}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive shrink-0"
                onClick={() => removeNotationRow(index)}
                disabled={isSaving || readOnly}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={addNotationRow}
          disabled={isSaving || readOnly}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Notation Row
        </Button>
      </div>

      {/* Footer Terms & Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold mb-2">Terms & Signature</h2>
          <TermsSelect
            label="Terms of Payment"
            value={paymentTerms}
            onChange={setPaymentTerms}
            options={PAYMENT_TERMS}
            disabled={isSaving || readOnly}
          />
          <TermsSelect
            label="Delivery"
            value={deliveryTerms}
            onChange={setDeliveryTerms}
            options={DELIVERY_TERMS}
            disabled={isSaving || readOnly}
          />
          <TermsSelect
            label="Warranty"
            value={warrantyTerms}
            onChange={setWarrantyTerms}
            options={WARRANTY_TERMS}
            disabled={isSaving || readOnly}
          />
          <div>
            <Label>Prepared By</Label>
            <Input
              value={preparedBy}
              className="mt-1 bg-muted/40 cursor-not-allowed"
              disabled={true}
              readOnly
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-4">Summary</h2>
            <div className="space-y-3 text-sm">
              <TotalRow label="Sub Total" value={formatCurrency(subTotal)} />
              <div className="flex items-center justify-between gap-4">
                <span>Discount</span>
                <Input
                  type="number"
                  min={0}
                  value={discount || ""}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="h-8 w-32 text-right"
                  disabled={isSaving || readOnly}
                />
              </div>
              <TotalRow
                label="Grand Total Vat Inc."
                value={formatCurrency(grandTotal)}
                bold
              />
              <TotalRow label="Vat" value={formatCurrency(vat)} italic />
              <TotalRow
                label="Vatable Amount"
                value={formatCurrency(vatableAmount)}
                italic
              />
            </div>
          </div>

          {!readOnly && (
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                Cancel
              </Button>

              {/* Save Draft button - Green outline */}
              <Button
                onClick={handleSaveDraft}
                disabled={isSaving}
                variant="outline"
                className="gap-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="h-4 w-4" />
                Save Draft
              </Button>

              {/* Preview button - Green solid */}
              <Button
                onClick={preview}
                disabled={isSaving}
                className="gap-2 text-white bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  italic,
}: {
  label: string;
  value: string;
  bold?: boolean;
  italic?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${bold ? "font-bold" : ""} ${italic ? "italic" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TermsSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
