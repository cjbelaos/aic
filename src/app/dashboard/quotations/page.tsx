"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { Plus, Trash2, Loader2, Save, Send } from "lucide-react";
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
import { Customer } from "@/types/customer";
import { Product } from "@/types/product";

/* ── Helpers ─────────────────────────────────────────────── */

function toExcelSerial(date: Date): number {
  const epoch = new Date(1899, 11, 30);
  const wholeDays = Math.floor((date.getTime() - epoch.getTime()) / 86400000);
  const timeFraction =
    (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) /
    86400;
  return Number((wholeDays + timeFraction).toFixed(5));
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
  return c.companyName?.trim() || c.customerName?.trim() || `Customer #${c.id}`;
}

/* ── Constants ─────────────────────────────────────────── */

const PAYMENT_TERMS = ["COD", "30 Days", "50% Downpayment", "Upon Delivery"];
const DELIVERY_TERMS = [
  "7-15 Days upon confirmation of PO",
  "3-5 Days",
  "Pick-up",
];
const WARRANTY_TERMS = [
  "No warranty for consumable Parts/Supplies",
  "1 Year Limited Warranty",
  "6 Months Limited Warranty",
];

type LineItem = {
  id: string;
  productId: string;
  notation: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
};

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  productId: "",
  notation: "",
  quantity: 1,
  unit: "",
  pricePerUnit: 0,
});

/* ── Page ────────────────────────────────────────────────── */

export default function QuotationGeneratorPage() {
  const today = useMemo(() => new Date(), []);
  const validityDate = useMemo(() => addDays(today, 90), [today]);
  const quotationNo = useMemo(() => toExcelSerial(today), [today]);

  const reportTemplateRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [discount, setDiscount] = useState(0);

  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS[0]);
  const [deliveryTerms, setDeliveryTerms] = useState(DELIVERY_TERMS[0]);
  const [warrantyTerms, setWarrantyTerms] = useState(WARRANTY_TERMS[0]);

  const [preparedBy, setPreparedBy] = useState("Von Jeric Carmona");
  const [approvedBy, setApprovedBy] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          customerService.getAll(),
          productService.getAll(),
        ]);

        setCustomers(cRes ?? []);
        setProducts(pRes ?? []);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load quotation data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedCustomer = customers.find((c) => String(c.id) === customerId);

  const customerOptions = customers.map((c) => ({
    value: String(c.id),
    label: customerLabel(c),
  }));

  const productOptions = products.map((p) => ({
    value: String(p.id),
    label: p.productName?.trim(),
  }));

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    setLineItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const onProductSelect = (rowId: string, productId: string) => {
    const product = products.find((p) => String(p.id) === productId);
    updateLine(rowId, {
      productId,
      unit:
        typeof product?.unit === "object" && product?.unit !== null
          ? (product.unit as any).name || (product.unit as any).label || ""
          : product?.unit || "",
      pricePerUnit: product?.pricePerUnit ?? product?.costPerUnit ?? 0,
    });
  };

  const subTotal = lineItems.reduce(
    (sum, row) => sum + row.quantity * row.pricePerUnit,
    0,
  );
  const grandTotal = Math.max(subTotal - (discount || 0), 0);
  const vat = grandTotal * (12 / 112);
  const vatableAmount = grandTotal - vat;

  // 🔥 PDF GENERATION LOGIC
  const handleSave = async () => {
    if (!customerId) {
      toast.error("Please select a customer before exporting.");
      return;
    }

    const toastId = toast.loading("Generating quotation PDF...");
    setIsPrinting(true);

    try {
      // 1. Sequentially load rendering dependencies directly
      const html2canvasPro = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const element = reportTemplateRef.current;
      if (!element) {
        toast.error("Quotation template element not found.");
        return;
      }

      const cleanClientName = customerLabel(selectedCustomer!)
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const filename = `quotation_${quotationNo}_${cleanClientName}.pdf`;

      // Allow DOM layout to settle into printing mode styles
      await new Promise((resolve) => setTimeout(resolve, 350));

      // 2. Render canvas using the pro engine version that parses lab()
      const canvas = await html2canvasPro(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // 3. Initialize Letter document context manually
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "in",
        format: "letter",
      });

      const imgWidth = 7.5; // 8.5" width - 0.5" margins on each side
      const pageHeight = 11.0;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0.5; // Top margin initialization
      const marginLeft = 0.5;

      // Add image data onto page bounds
      pdf.addImage(imgData, "JPEG", marginLeft, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 1.0; // Account for top/bottom margin offset

      // Multi-page tracking handling
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + 0.5;
        pdf.addPage();
        pdf.addImage(
          imgData,
          "JPEG",
          marginLeft,
          position,
          imgWidth,
          imgHeight,
        );
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
      toast.success("Quotation saved and downloaded successfully!", {
        id: toastId,
      });
    } catch (error) {
      console.error("PDF Generation error:", error);
      toast.error("Failed to generate PDF.", { id: toastId });
    } finally {
      setIsPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Container Ref captured by html2pdf wrapper */}
      <div
        ref={reportTemplateRef}
        className={`mx-auto max-w-5xl space-y-0 bg-white text-black shadow-lg print:shadow-none p-2 ${isPrinting ? "pdf-mode" : ""}`}
      >
        {/* ── 1. HEADER ─────────────────────────────────────── */}
        <div className="relative overflow-hidden border-b-4 border-blue-700 bg-gradient-to-r from-sky-100 via-blue-50 to-sky-100 px-8 py-6">
          <div className="flex items-start gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-white">
              <Image
                src="/logo.png"
                alt="Company Logo"
                width={64}
                height={64}
                className="object-contain"
              />
            </div>
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-bold tracking-wide text-blue-800 drop-shadow-sm">
                AERICH INNOVATION CORP.
              </h1>
              <p className="mt-1 text-sm">
                BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay,
                Cabuyao City, Laguna
              </p>
              <p className="text-sm">
                Email Address: aerichinnovationcorp@gmail.com
              </p>
              <p className="text-sm">Contact No.: 09171832745, 09399063645</p>
            </div>
            <div className="hidden w-20 shrink-0 sm:block" />
          </div>
        </div>

        <div className="px-8 py-6">
          {/* ── 2. CLIENT + METADATA ───────────────────────── */}
          <div className="grid gap-6 border-b border-blue-700 pb-6 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <Field label="Client Name">
                {isPrinting ? (
                  <span className="min-h-9 px-1 py-2 font-medium">
                    {selectedCustomer ? customerLabel(selectedCustomer) : "—"}
                  </span>
                ) : (
                  <SearchableSelect
                    value={customerId}
                    onValueChange={setCustomerId}
                    options={customerOptions}
                    placeholder="Select customer"
                    searchPlaceholder="Search customers..."
                  />
                )}
              </Field>
              <Field label="Address" value={selectedCustomer?.address ?? ""} />
              <Field
                label="Contact Person"
                value={selectedCustomer?.contactPerson ?? ""}
              />
              <Field
                label="Email Address"
                value={selectedCustomer?.email ?? ""}
              />
            </div>

            <div className="space-y-3 text-sm">
              <Field label="Date" value={formatDisplayDate(today)} />
              <Field label="Quotation No." value={String(quotationNo)} />
              <Field
                label="Quotation Validity"
                value={formatDisplayDate(validityDate)}
              />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Label className="text-sm font-semibold">Description</Label>
            {isPrinting ? (
              <div className="p-2 border-b font-semibold uppercase text-sm text-blue-900">
                {projectDescription || "PORTABLE RO Parts"}
              </div>
            ) : (
              <Input
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="PORTABLE RO Parts"
                className="border-blue-300 font-semibold uppercase"
              />
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              Dear Ma&apos;am/Sir,
              <br />
              <br />
              We are pleased to submit our best price proposal for the
              above-mentioned project and thank you for this opportunity to be
              of service. The details of our offer are described below.
            </p>
          </div>

          {/* ── 3. LINE ITEMS TABLE ────────────────────────── */}
          <div className="mt-6">
            <Table className="border border-black text-xs">
              <TableHeader>
                <TableRow className="bg-blue-700 hover:bg-blue-700">
                  {[
                    "Product Description",
                    "Notation",
                    "QTY",
                    "UNIT",
                    "PRICE/UNIT",
                    "AMOUNT",
                    ...(isPrinting ? [] : [""]),
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className="border border-black px-2 py-2 text-center font-bold text-white"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((row) => {
                  const amount = row.quantity * row.pricePerUnit;
                  const matchedProd = products.find(
                    (p) => String(p.id) === row.productId,
                  );

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="border border-black p-1 align-top font-medium">
                        {isPrinting ? (
                          <div className="px-2 py-1.5">
                            {matchedProd?.productName || "—"}
                          </div>
                        ) : (
                          <SearchableSelect
                            value={row.productId}
                            onValueChange={(v) => onProductSelect(row.id, v)}
                            options={productOptions}
                            placeholder="Select product"
                            searchPlaceholder="Search products..."
                            className="h-8 border-0 text-xs shadow-none"
                          />
                        )}
                      </TableCell>
                      <TableCell className="border border-black p-1 align-top">
                        {isPrinting ? (
                          <div className="px-2 py-1.5 text-muted-foreground">
                            {row.notation || ""}
                          </div>
                        ) : (
                          <Input
                            value={row.notation}
                            onChange={(e) =>
                              updateLine(row.id, { notation: e.target.value })
                            }
                            placeholder="Optional notes..."
                            className="h-8 border-0 text-xs shadow-none"
                          />
                        )}
                      </TableCell>
                      <TableCell className="border border-black p-1 text-center">
                        {isPrinting ? (
                          row.quantity
                        ) : (
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
                          />
                        )}
                      </TableCell>
                      <TableCell className="border border-black px-2 text-center">
                        {row.unit || "—"}
                      </TableCell>
                      <TableCell className="border border-black px-2 text-right">
                        {row.pricePerUnit.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="border border-black px-2 text-right font-medium">
                        {formatCurrency(amount)}
                      </TableCell>

                      {!isPrinting && (
                        <TableCell className="border border-black p-1 text-center print:hidden">
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
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {!isPrinting && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 print:hidden"
                onClick={() => setLineItems((rows) => [...rows, emptyLine()])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add New Line Item Row
              </Button>
            )}
          </div>

          {/* ── 4. TOTALS ──────────────────────────────────── */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-sm space-y-2 text-sm">
              <TotalRow label="Sub Total" value={formatCurrency(subTotal)} />
              <div className="flex items-center justify-between gap-4">
                <span>Less Discount</span>
                {isPrinting ? (
                  <span className="font-medium pr-1">
                    {formatCurrency(discount)}
                  </span>
                ) : (
                  <Input
                    type="number"
                    min={0}
                    value={discount || ""}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    className="h-8 w-32 text-right"
                  />
                )}
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

          {/* ── 5. TERMS ───────────────────────────────────── */}
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {isPrinting ? (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 block">
                    Terms of Payment
                  </span>
                  <div className="p-2 border rounded bg-gray-50 text-xs">
                    {paymentTerms}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 block">
                    Delivery
                  </span>
                  <div className="p-2 border rounded bg-gray-50 text-xs">
                    {deliveryTerms}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 block">
                    Warranty
                  </span>
                  <div className="p-2 border rounded bg-gray-50 text-xs">
                    {warrantyTerms}
                  </div>
                </div>
              </>
            ) : (
              <>
                <TermsSelect
                  label="Terms of Payment"
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  options={PAYMENT_TERMS}
                />
                <TermsSelect
                  label="Delivery"
                  value={deliveryTerms}
                  onChange={setDeliveryTerms}
                  options={DELIVERY_TERMS}
                />
                <TermsSelect
                  label="Warranty"
                  value={warrantyTerms}
                  onChange={setWarrantyTerms}
                  options={WARRANTY_TERMS}
                />
              </>
            )}
          </div>

          {/* ── 6. SIGNATURES ──────────────────────────────── */}
          <div className="mt-10 grid gap-8 border-t pt-8 md:grid-cols-3">
            <SignatureBlock
              title="Prepared by:"
              value={preparedBy}
              onChange={setPreparedBy}
              caption="Signature over printed name"
              isPrinting={isPrinting}
            />
            <SignatureBlock
              title="Approved by:"
              value={approvedBy}
              onChange={setApprovedBy}
              caption="Signature over printed name"
              isPrinting={isPrinting}
            />
            <div className="space-y-6">
              <p className="text-sm font-semibold">Conforme by:</p>
              <div className="h-16 border-b border-black" />
              <div className="mt-2 h-9" />{" "}
              {/* Visual spacer balancing input elements */}
              <p className="text-xs text-muted-foreground">
                Signature over Printed Name / Date
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent action triggers removed from target canvas element */}
      <div className="mx-auto max-w-5xl flex justify-end gap-2 px-8 pb-8">
        <Button
          onClick={handleSave}
          className="gap-2 bg-blue-700 hover:bg-blue-800"
        >
          <Save className="h-4 w-4" />
          Save PDF
        </Button>
        <Button variant="outline" className="gap-2">
          <Send className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  );
}

/* ── Small sub-components ────────────────────────────────── */

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="font-semibold">{label}</span>
      {children ?? (
        <span className="min-h-9 rounded border border-input px-3 py-2 bg-white">
          {value || "—"}
        </span>
      )}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange}>
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

function SignatureBlock({
  title,
  value,
  onChange,
  caption,
  isPrinting,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  caption: string;
  isPrinting: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold">{title}</p>
      <div className="h-16 border-b border-black" />
      {isPrinting ? (
        <div className="text-center font-medium h-9 pt-2 border-b border-transparent">
          {value || "—"}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-0 border-b border-black rounded-none px-0 text-center shadow-none focus-visible:ring-0 bg-transparent h-9"
        />
      )}
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
