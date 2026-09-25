"use client";

import {
  isDraftQuotationReference,
  quotationNumberLabel,
} from "@/lib/quotationReference";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Send,
  Eye,
  ChevronUp,
  ChevronDown,
  Package,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredLabel } from "@/components/ui/required-label";
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
import companyService from "@/lib/services/company.service";
import customerPriceService from "@/lib/services/customer-price.service";
import paymentTermService from "@/lib/services/payment-term.service";
import { userService } from "@/lib/services/user.service";
import { positionService } from "@/lib/services/position.service";
import { QuotationCustomer } from "@/lib/services/quotation.service";
import companyContactService from "@/lib/services/companyContact.service";
import { isExecutivePositionTitle } from "@/lib/positionUtils";
import { Product } from "@/types/product";
import type { PaymentTerm } from "@/types/paymentTerm";
import { CustomerPrice } from "@/types/customer-price";
import type { PublicUser } from "@/types/user";
import type { Position } from "@/types/position";
import { QuotationDetail, QuotationNotation } from "@/types/quotation";
import {
  PER_LINE_PRICING_LABEL,
  SINGLE_TOTAL_PRICING_LABEL,
  SINGLE_TOTAL_PRICE_LABEL,
  isSingleTotalPricing,
  normalizeQuotationPricingMode,
  planPricingModeSwitch,
  quotationLineKind,
  quotationTotals,
  singleTotalPriceFromRecord,
} from "@/lib/quotationPricing";
import type {
  QuotationLineKind,
  QuotationPricingMode,
} from "@/types/quotation";
import { upperText, upperTextList } from "@/lib/quotationText";
import { getDriveImageUrl } from "@/lib/signatureUpload";

/* ── Helpers ─────────────────────────────────────────────── */

// Safe fallback uuid generator for non-HTTPS dev environments
function generateId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
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

function customerLabel(c: QuotationCustomer): string {
  return c.companyName?.trim() || `Customer #${c.id}`;
}

/* ── Constants ─────────────────────────────────────────── */

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
  /** Product lines reference the catalog; service lines are described manually. */
  kind: QuotationLineKind;
  productId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

const emptyLine = (kind: QuotationLineKind = "PRODUCT"): LineItem => ({
  id: generateId(),
  kind,
  productId: "",
  description: "",
  quantity: 1,
  unit: "",
  unitPrice: 0,
});

/** A line is complete when a product line has a product and a service line a description. */
function lineIsComplete(row: LineItem): boolean {
  return row.kind === "PRODUCT"
    ? Boolean(row.productId)
    : Boolean(row.description.trim());
}

export type QuotationFormPayload = {
  quotationNo: string;
  date: Date;
  validity: Date;
  customer: QuotationCustomer;
  quotationDescription: string;
  items: QuotationDetail[];
  notations?: QuotationNotation[];
  subTotal: number;
  discount: number;
  shippingFee?: number;
  paymentTermId?: string;
  terms: string;
  delivery: string;
  warranty: string;
  preparedBy: string;
  approvedBy: string;
  status: "DRAFT" | "SAVED" | "SENT";
  vat: number;
  vatableAmount: number;
  grandTotal: number;
  /** Pricing mode of the quotation ("PER_LINE" when the record predates it). */
  pricingMode: QuotationPricingMode;
  /** One combined price for the whole job (SINGLE_TOTAL mode only). */
  singleTotalPrice?: number;
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

  const [quotationNo] = useState(initialData?.quotationNo || "");

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<QuotationCustomer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerPrices, setCustomerPrices] = useState<CustomerPrice[]>([]);
  const [paymentTermOptions, setPaymentTermOptions] = useState<PaymentTerm[]>(
    [],
  );

  const [customerId, setCustomerId] = useState("");
  // Free-text quotation fields are always uppercase (typed or pasted).
  const [projectDescription, setProjectDescription] = useState(
    upperText(initialData?.quotationDescription ?? ""),
  );
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);

  /**
   * Pricing mode + the single combined price. Both are explicit user choices;
   * the mode defaults to the historical per-line pricing for older records.
   */
  const [pricingMode, setPricingMode] = useState<QuotationPricingMode>(
    normalizeQuotationPricingMode(initialData?.pricingMode),
  );
  const [singleTotalPrice, setSingleTotalPrice] = useState(
    initialData ? singleTotalPriceFromRecord(initialData) : 0,
  );
  const [pricingNotice, setPricingNotice] = useState("");

  // Fix: Convert QuotationNotation[] to string[] for internal state
  const [notations, setNotations] = useState<string[]>(
    initialData?.notations && initialData.notations.length > 0
      ? upperTextList(initialData.notations.map((n) => n.notation || ""))
      : [""],
  );

  const [shippingFee, setShippingFee] = useState(initialData?.shippingFee || 0);
  const [discount, setDiscount] = useState(initialData?.discount || 0);

  const [paymentTerms, setPaymentTerms] = useState(initialData?.terms || "");
  const [deliveryTerms, setDeliveryTerms] = useState(
    initialData?.delivery || DELIVERY_TERMS[0],
  );
  const [warrantyTerms, setWarrantyTerms] = useState(
    initialData?.warranty || WARRANTY_TERMS[0],
  );

  const [preparedBy, setPreparedBy] = useState(initialData?.preparedBy || "");
  const [allUsers, setAllUsers] = useState<PublicUser[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [approvedByUsername, setApprovedByUsername] = useState("");
  const [currentUserDepartmentId, setCurrentUserDepartmentId] = useState<
    number | null
  >(null);
  const [preparedBySignatureUrl, setPreparedBySignatureUrl] = useState<
    string | undefined
  >(undefined);
  const [approvedBySignatureUrl, setApprovedBySignatureUrl] = useState<
    string | undefined
  >(undefined);

  // Derive the approvedBy display name from the selected username
  const approvedBy = useMemo(() => {
    const user = allUsers.find(
      (u) => u.username.toLowerCase() === approvedByUsername.toLowerCase(),
    );
    return user?.fullName || approvedByUsername;
  }, [allUsers, approvedByUsername]);

  // Only users in the same department as the current user may be selected as
  // the approver, plus executives (General Manager, CFO, COO, CEO) who may
  // approve for anyone regardless of department.
  const sameDeptUsers = useMemo(() => {
    if (currentUserDepartmentId == null || currentUserDepartmentId === 0) {
      return allUsers;
    }
    return allUsers.filter((u) => u.departmentId === currentUserDepartmentId);
  }, [allUsers, currentUserDepartmentId]);

  // Executive positions may approve for any user regardless of department.
  const executiveUsernames = useMemo(() => {
    const names = new Set<string>();
    const posTitles = new Map<number, string>();
    for (const p of positions) posTitles.set(p.positionId, p.positionTitle);
    for (const u of allUsers) {
      const title = u.positionId ? posTitles.get(u.positionId) : undefined;
      if (isExecutivePositionTitle(title)) names.add(u.username);
    }
    return names;
  }, [positions, allUsers]);

  // Approver candidates = same-department users + executives (no duplicates).
  const approverCandidates = useMemo(() => {
    const seen = new Set<string>();
    const list: PublicUser[] = [];
    for (const u of sameDeptUsers) {
      if (!seen.has(u.username)) {
        seen.add(u.username);
        list.push(u);
      }
    }
    for (const u of allUsers) {
      if (executiveUsernames.has(u.username) && !seen.has(u.username)) {
        seen.add(u.username);
        list.push(u);
      }
    }
    return list;
  }, [sameDeptUsers, allUsers, executiveUsernames]);

  const singleTotalMode = isSingleTotalPricing(pricingMode);
  const totals = quotationTotals(pricingMode, {
    lineItems,
    singleTotalPrice,
    discount,
    shippingFee,
  });
  const subTotal = totals.subtotal;
  const grandTotal = totals.grandTotal;
  const vat = totals.vat;
  const vatableAmount = totals.vatableAmount;

  const selectedProductIds = useMemo(() => {
    return lineItems.map((item) => item.productId).filter(Boolean);
  }, [lineItems]);

  useEffect(() => {
    (async () => {
      try {
        // Generate quotation number if not already set
        const [cRes, pRes, cpRes, uRes, posRes, contactRes, termsRes] =
          await Promise.all([
            companyService.getAll(),
            productService.getAll(),
            customerPriceService.getAll(),
            userService.getAllUsers(),
            positionService.getAll(),
            companyContactService.getAll(),
            paymentTermService.getAll(),
          ]);

        const customerCompanies = (cRes ?? []).filter(
          (c) => c.companyType === "Customer" || c.companyType === "Both",
        );
        const mappedCustomers: QuotationCustomer[] = customerCompanies.map(
          (company) => {
            const contacts = (contactRes ?? []).filter(
              (contact) => contact.companyId === company.companyId,
            );
            const primaryContact =
              contacts.find((contact) => contact.isPrimary) || contacts[0];
            return {
              ...company,
              contactPerson: primaryContact?.fullName,
              email: primaryContact?.email,
            };
          },
        );

        setCustomers(mappedCustomers);
        setProducts(pRes ?? []);
        setCustomerPrices(cpRes ?? []);
        setPaymentTermOptions(
          (termsRes ?? []).filter((term) => term.status === "Active"),
        );
        setAllUsers(uRes ?? []);
        setPositions(posRes ?? []);

        try {
          const storedAuth = window.localStorage.getItem("auth:user");
          if (storedAuth) {
            const parsedAuth = JSON.parse(storedAuth);
            const targetUsername = parsedAuth?.userName?.trim().toLowerCase();

            const matchedUser = targetUsername
              ? uRes?.find(
                  (u) => u.username?.trim().toLowerCase() === targetUsername,
                )
              : undefined;

            if (!initialData?.preparedBy && targetUsername && uRes) {
              if (matchedUser) {
                setPreparedBy(
                  matchedUser.fullName || parsedAuth.userName || "",
                );
              } else {
                setPreparedBy(parsedAuth.userName || "");
              }
            }

            // Resolve the current user's department so the approver list can
            // be restricted to same-department users only.
            const storedDeptId =
              typeof parsedAuth?.departmentId === "number"
                ? parsedAuth.departmentId
                : null;
            const resolvedDeptId =
              storedDeptId != null && storedDeptId > 0
                ? storedDeptId
                : matchedUser && matchedUser.departmentId > 0
                  ? matchedUser.departmentId
                  : null;
            setCurrentUserDepartmentId(resolvedDeptId);
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
              c.companyName?.trim() ===
              initialData.customer?.companyName?.trim(),
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
              const productId =
                item.productId ||
                (matchedProduct
                  ? String(matchedProduct.productId || matchedProduct.id)
                  : "");
              return {
                id: generateId(),
                kind: quotationLineKind({ productId }),
                productId,
                description: matchedProduct
                  ? ""
                  : upperText(item.description || ""),
                quantity: item.quantity,
                unit: upperText(item.unit || ""),
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
            (cp.companyName?.trim().toLowerCase() ===
              customer.companyName?.trim().toLowerCase() ||
              String(cp.companyId) === String(customer.id)) &&
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

  // Recalculate price matrix rows correctly upon customer adjustments. This is
  // the historical behaviour and never changes a total in single-total mode.
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

  /**
   * Switches one line between a catalog product and a manually described service
   * (service and repair work share the Service kind). The catalog reference is
   * dropped when the line becomes a service; the description, quantity, unit and
   * price the user already entered are retained in both directions.
   */
  const switchLineKind = (rowId: string, kind: QuotationLineKind) => {
    if (readOnly) return;
    setLineItems((rows) =>
      rows.map((row) => {
        if (row.id !== rowId || row.kind === kind) return row;
        if (kind === "SERVICE") {
          const product = products.find((p) => String(p.id) === row.productId);
          return {
            ...row,
            kind,
            productId: "",
            // Keep a useful starting description instead of losing the product name.
            description:
              row.description.trim() || upperText(product?.name?.trim() || ""),
          };
        }
        return { ...row, kind };
      }),
    );
  };

  /** Reorders a line with the arrow controls (mixed product/service lists). */
  const moveLine = (index: number, direction: -1 | 1) => {
    if (readOnly) return;
    setLineItems((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
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
      kind: "PRODUCT",
      productId,
      unit: derivedUnit,
      unitPrice: calculateUnitPrice(productId, customerId),
    });
  };

  const addNewLineItem = (kind: QuotationLineKind) => {
    if (readOnly) return;
    const hasEmptyFields = lineItems.some((item) => !lineIsComplete(item));
    if (hasEmptyFields) {
      toast.error(
        "Please complete the existing line items before creating a new row.",
      );
      return;
    }
    setLineItems((rows) => [...rows, emptyLine(kind)]);
  };

  /**
   * Safe pricing-mode switching: descriptions and per-line prices stay in state
   * (and stay persisted on the lines), the combined price is seeded from the line
   * sum only when none was entered, and the reason is explained to the user.
   */
  const changePricingMode = (next: QuotationPricingMode) => {
    if (readOnly) return;
    const result = planPricingModeSwitch({
      from: pricingMode,
      to: next,
      lineItems,
      singleTotalPrice,
    });
    setPricingMode(result.mode);
    setSingleTotalPrice(result.singleTotalPrice);
    setPricingNotice(result.note);
  };

  const handleNotationChange = (index: number, value: string) => {
    if (readOnly) return;
    setNotations((prev) =>
      prev.map((note, i) => (i === index ? upperText(value) : note)),
    );
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

  /**
   * Line and pricing validation shared by preview, draft save and numbered save.
   * Product lines need a catalog product; service lines need a description; a
   * single-total quotation needs its one combined price.
   */
  const quotationValidationError = (): string => {
    const incompleteIndex = lineItems.findIndex(
      (item) => !lineIsComplete(item),
    );
    if (incompleteIndex >= 0) {
      return lineItems[incompleteIndex].kind === "PRODUCT"
        ? `Line ${incompleteIndex + 1} needs a catalog product, or switch that line to Service and describe the work.`
        : `Line ${incompleteIndex + 1} needs a description of the service or repair work.`;
    }
    if (isSingleTotalPricing(pricingMode) && singleTotalPrice <= 0) {
      return "Enter the total price for the whole job before saving a single total price quotation.";
    }
    return "";
  };

  const handleSaveAndPreview = () => {
    if (!selectedCustomer) {
      toast.error("Please select a customer before previewing.");
      return;
    }

    if (!projectDescription || projectDescription.trim() === "") {
      toast.error("Please enter a quotation description before previewing.");
      return;
    }

    const validationError = quotationValidationError();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = getPayload("SAVED");
    onSubmit(payload);
  };

  const customerRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);

  const scrollToField = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSaveDraft = (numbered = false) => {
    // Validate required fields with scroll-to-field
    if (!selectedCustomer) {
      toast.error("Please select a customer.");
      scrollToField(customerRef);
      return;
    }

    if (!projectDescription || projectDescription.trim() === "") {
      toast.error("Please enter a quotation description.");
      scrollToField(descriptionRef);
      return;
    }

    const validationError = quotationValidationError();
    if (validationError) {
      toast.error(validationError);
      scrollToField(itemsRef);
      return;
    }

    // Create payload with DRAFT status
    const payload = getPayload(
      numbered || !isDraftQuotationReference(quotationNo) ? "SAVED" : "DRAFT",
    );
    // For draft, we don't need a PDF blob
    onSubmit(payload);
  };

  const getPayload = (
    finalStatus: "DRAFT" | "SAVED" | "SENT",
  ): QuotationFormPayload => {
    // Fix: Create QuotationDetail[] with proper structure
    const itemsPayload: QuotationDetail[] = lineItems.map((item) => {
      const matchedProd = products.find((p) => String(p.id) === item.productId);
      const isProductLine = item.kind === "PRODUCT" && Boolean(matchedProd);
      // User-entered text is uppercased; a catalogue product name snapshot is
      // kept exactly as the catalogue stores it (it is not a typed input).
      const description = item.description.trim()
        ? upperText(item.description.trim())
        : matchedProd?.name || "";
      return {
        quotationNo: quotationNo,
        // Service lines persist without a product reference; the description is
        // the line's identity, so no product record is required for them.
        productId: isProductLine
          ? matchedProd?.productId || item.productId
          : undefined,
        productCodeSnapshot: isProductLine
          ? matchedProd?.code || undefined
          : undefined,
        description,
        quantity: item.quantity,
        unit: upperText(item.unit),
        unitPrice: item.unitPrice,
      };
    });

    const notationsPayload: QuotationNotation[] = notations
      .filter((n) => n.trim() !== "")
      .map((note) => ({
        quotationNo: quotationNo,
        notation: upperText(note),
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
      shippingFee,
      paymentTermId:
        paymentTermOptions.find((term) => term.name === paymentTerms)
          ?.paymentTermId ||
        initialData?.paymentTermId ||
        "",
      terms: paymentTerms,
      delivery: deliveryTerms,
      warranty: warrantyTerms,
      preparedBy,
      approvedBy,
      notations: notationsPayload,
      status: finalStatus,
      vat,
      vatableAmount,
      grandTotal,
      pricingMode,
      singleTotalPrice: isSingleTotalPricing(pricingMode)
        ? singleTotalPrice
        : 0,
    };
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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
                  value={selectedCustomer?.companyName ?? ""}
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
                  value={quotationNumberLabel(quotationNo)}
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
          <p className="mb-3 text-xs text-muted-foreground">
            {singleTotalMode
              ? `${SINGLE_TOTAL_PRICING_LABEL} · all lines are shown by description; the job is quoted as one combined total.`
              : PER_LINE_PRICING_LABEL}
          </p>
          <div className="overflow-x-auto">
            <Table className="border text-xs min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12%]">Type</TableHead>
                  <TableHead className="w-[48%]">Description</TableHead>
                  <TableHead className="w-[12%] text-center">Qty</TableHead>
                  <TableHead className="w-[12%] text-center">Unit</TableHead>
                  {singleTotalMode ? null : (
                    <TableHead className="w-[16%] text-right">
                      Price/Unit
                    </TableHead>
                  )}
                  {singleTotalMode ? null : (
                    <TableHead className="w-[16%] text-right">Amount</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((row) => {
                  const matchedProd = products.find(
                    (p) => String(p.id) === row.productId,
                  );
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.kind === "PRODUCT" ? "Product" : "Service"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.kind === "PRODUCT"
                          ? matchedProd?.name ||
                            row.description ||
                            "Unnamed product"
                          : row.description}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.quantity}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.unit || "—"}
                      </TableCell>
                      {singleTotalMode ? null : (
                        <TableCell className="text-right">
                          {formatCurrency(row.unitPrice)}
                        </TableCell>
                      )}
                      {singleTotalMode ? null : (
                        <TableCell className="text-right font-medium">
                          {formatCurrency(row.quantity * row.unitPrice)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Notations Block - Read Only */}
        {notations.filter((n) => n.trim() !== "").length > 0 && (
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Notations</h2>
            <ol className="list-decimal pl-5 text-sm text-slate-200 space-y-2">
              {notations
                .filter((n) => n.trim() !== "")
                .map((note, idx) => (
                  <li
                    key={idx}
                    className="break-words leading-relaxed text-white"
                  >
                    {note}
                  </li>
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
                {singleTotalMode ? (
                  <TotalRow
                    label={SINGLE_TOTAL_PRICE_LABEL}
                    value={formatCurrency(singleTotalPrice)}
                  />
                ) : (
                  <TotalRow
                    label="Sub Total"
                    value={formatCurrency(subTotal)}
                  />
                )}
                {shippingFee > 0 && (
                  <TotalRow
                    label="Shipping Fee"
                    value={formatCurrency(shippingFee)}
                  />
                )}
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
            <div ref={customerRef}>
              <RequiredLabel>Client Name</RequiredLabel>
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
                value={quotationNumberLabel(quotationNo)}
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

        <div className="mt-6 space-y-2" ref={descriptionRef}>
          <RequiredLabel>Description</RequiredLabel>
          <Input
            value={projectDescription}
            onChange={(e) => setProjectDescription(upperText(e.target.value))}
            placeholder="PORTABLE RO PARTS"
            className="font-semibold uppercase"
            disabled={isSaving || readOnly}
          />
        </div>
      </div>

      {/* Line Items Block */}
      <div ref={itemsRef} className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          Line Items <span className="text-red-500">*</span>
        </h2>

        {/* Pricing mode: explicit, and switching never discards descriptions or prices. */}
        <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Pricing mode</p>
            <p className="text-xs text-muted-foreground">
              {singleTotalMode
                ? "Every product and service is listed by description; one combined price is entered once and shown as a single total."
                : "Every line is priced individually, exactly as before."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={pricingMode === "PER_LINE" ? "default" : "outline"}
              aria-pressed={pricingMode === "PER_LINE"}
              onClick={() => changePricingMode("PER_LINE")}
              disabled={isSaving || readOnly}
            >
              {PER_LINE_PRICING_LABEL}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pricingMode === "SINGLE_TOTAL" ? "default" : "outline"}
              aria-pressed={pricingMode === "SINGLE_TOTAL"}
              onClick={() => changePricingMode("SINGLE_TOTAL")}
              disabled={isSaving || readOnly}
            >
              {SINGLE_TOTAL_PRICING_LABEL}
            </Button>
          </div>
        </div>
        {pricingNotice ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-blue-300 bg-blue-50 p-2 text-xs text-blue-900"
          >
            {pricingNotice}
          </p>
        ) : null}
        {singleTotalMode ? (
          <div className="mb-4 rounded-lg border bg-background p-3">
            <Label htmlFor="quotation-single-total">
              {SINGLE_TOTAL_PRICE_LABEL} (PHP)
            </Label>
            <Input
              id="quotation-single-total"
              type="number"
              min="0"
              step="0.01"
              value={singleTotalPrice || ""}
              placeholder="0.00"
              className="mt-2 sm:max-w-xs"
              disabled={isSaving || readOnly}
              onChange={(e) =>
                setSingleTotalPrice(Math.max(0, Number(e.target.value) || 0))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Entered once for the whole job. No per-line price is displayed or
              derived from this total.
            </p>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table className="border text-xs min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[12%]">Type</TableHead>
                <TableHead className="w-[38%]">Description</TableHead>
                <TableHead className="w-[10%] text-center">Qty</TableHead>
                <TableHead className="w-[10%] text-center">Unit</TableHead>
                {singleTotalMode ? null : (
                  <TableHead className="w-[14%] text-right">
                    Price/Unit
                  </TableHead>
                )}
                <TableHead className="w-[16%] text-center">Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((row, index) => {
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
                      <Select
                        value={row.kind}
                        onValueChange={(value) =>
                          switchLineKind(
                            row.id,
                            value === "SERVICE" ? "SERVICE" : "PRODUCT",
                          )
                        }
                        disabled={isSaving || readOnly}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PRODUCT">Product</SelectItem>
                          <SelectItem value="SERVICE">Service</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1 align-top">
                      {row.kind === "PRODUCT" ? (
                        <SearchableSelect
                          value={row.productId}
                          onValueChange={(v) => onProductSelect(row.id, v)}
                          options={individualProductOptions}
                          placeholder="Select product"
                          searchPlaceholder="Search products..."
                          className="h-8 border-0 text-xs shadow-none"
                          disabled={isSaving || readOnly}
                        />
                      ) : (
                        <Input
                          value={row.description}
                          onChange={(e) =>
                            updateLine(row.id, {
                              description: upperText(e.target.value),
                            })
                          }
                          placeholder="Describe the service or repair work…"
                          className="h-8 text-xs uppercase"
                          aria-label={`Service description line ${index + 1}`}
                          disabled={isSaving || readOnly}
                        />
                      )}
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
                    <TableCell className="p-1 text-center">
                      <Input
                        value={row.unit}
                        onChange={(e) =>
                          updateLine(row.id, {
                            unit: upperText(e.target.value),
                          })
                        }
                        placeholder="unit"
                        className="h-8 w-20 border-0 text-center text-xs uppercase shadow-none mx-auto"
                        disabled={isSaving || readOnly}
                      />
                    </TableCell>
                    {singleTotalMode ? null : (
                      <TableCell className="p-1 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.unitPrice || ""}
                          onChange={(e) =>
                            updateLine(row.id, {
                              unitPrice: Math.max(
                                0,
                                Number(e.target.value) || 0,
                              ),
                            })
                          }
                          placeholder="0.00"
                          aria-label={`Unit price line ${index + 1}`}
                          className="h-8 w-24 border-0 text-right text-xs shadow-none ml-auto"
                          disabled={isSaving || readOnly}
                        />
                      </TableCell>
                    )}
                    <TableCell className="p-1">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Move line up"
                          aria-label={`Move line ${index + 1} up`}
                          onClick={() => moveLine(index, -1)}
                          disabled={index === 0 || isSaving || readOnly}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Move line down"
                          aria-label={`Move line ${index + 1} down`}
                          onClick={() => moveLine(index, 1)}
                          disabled={
                            index === lineItems.length - 1 ||
                            isSaving ||
                            readOnly
                          }
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title="Remove line"
                          aria-label={`Remove line ${index + 1}`}
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addNewLineItem("PRODUCT")}
            disabled={isSaving || readOnly}
          >
            <Package className="mr-1 h-4 w-4" />
            Add product line
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addNewLineItem("SERVICE")}
            disabled={isSaving || readOnly}
          >
            <Wrench className="mr-1 h-4 w-4" />
            Add service line
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <Label htmlFor="quotation-shipping-fee">
          Shipping Fee (PHP, optional)
        </Label>
        <Input
          id="quotation-shipping-fee"
          type="number"
          min="0"
          step="0.01"
          value={shippingFee || ""}
          placeholder="0.00"
          className="mt-2 sm:max-w-xs"
          disabled={isSaving || readOnly}
          onChange={(e) =>
            setShippingFee(Math.max(0, Number(e.target.value) || 0))
          }
        />
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
                className="h-9 text-xs uppercase"
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
            options={[
              ...new Set([
                paymentTerms,
                ...paymentTermOptions.map((term) => term.name),
              ]),
            ].filter(Boolean)}
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
          <div>
            <Label>Approved By</Label>
            <Select
              value={approvedByUsername}
              onValueChange={setApprovedByUsername}
              disabled={isSaving || readOnly}
            >
              <SelectTrigger className="w-full bg-white mt-1">
                <SelectValue placeholder="Select approver..." />
              </SelectTrigger>
              <SelectContent>
                {approverCandidates.map((u) => (
                  <SelectItem key={u.username} value={u.username}>
                    {u.fullName || u.username}
                  </SelectItem>
                ))}
                {approverCandidates.length === 0 && (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No eligible approvers found.
                  </div>
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Users in the same department as you, plus executives (General
              Manager, CFO, COO, CEO), are shown.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-4">Summary</h2>
            <div className="space-y-3 text-sm">
              {singleTotalMode ? (
                <div className="flex items-center justify-between gap-4">
                  <span>{SINGLE_TOTAL_PRICE_LABEL}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={singleTotalPrice || ""}
                    onChange={(e) =>
                      setSingleTotalPrice(
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                    aria-label={SINGLE_TOTAL_PRICE_LABEL}
                    className="h-8 w-36 text-right"
                    disabled={isSaving || readOnly}
                  />
                </div>
              ) : (
                <TotalRow label="Sub Total" value={formatCurrency(subTotal)} />
              )}
              {shippingFee > 0 && (
                <TotalRow
                  label="Shipping Fee"
                  value={formatCurrency(shippingFee)}
                />
              )}
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
            <div className="mt-6 space-y-3">
              <p className="text-xs text-muted-foreground text-right">
                Save assigns a quotation number. Save Draft keeps it unnumbered.
                Download PDF from the saved quotation's printable preview.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>

                {/* Save Draft button - Green outline */}
                <Button
                  onClick={() => handleSaveDraft(false)}
                  disabled={isSaving}
                  variant="outline"
                  className="gap-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Plus className="h-4 w-4" />
                  {isDraftQuotationReference(quotationNo)
                    ? "Save Draft"
                    : "Save"}
                </Button>

                {isDraftQuotationReference(quotationNo) && (
                  <Button
                    onClick={() => handleSaveDraft(true)}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                )}

                {/* Save & Preview button - Green solid */}
                <Button
                  onClick={handleSaveAndPreview}
                  disabled={isSaving}
                  className="gap-2 text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Eye className="h-4 w-4" />
                  Save & Preview
                </Button>
              </div>
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
