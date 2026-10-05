"use client";
import { Textarea } from "@/components/ui/textarea";
import { DiscountInput } from "@/components/discount-input";
import { defaultDiscount, type DiscountSettings } from "@/lib/discounts";

import {
  isDraftQuotationReference,
  quotationNumberLabel,
} from "@/lib/quotationReference";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { ReactNode, Ref } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Eye,
  Save,
  ChevronUp,
  ChevronDown,
  Package,
  Wrench,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  /** Saved or manually entered prices must survive customer/catalog refreshes. */
  priceIsManual?: boolean;
  id: string;
  /** Product lines reference the catalog; service lines are described manually. */
  kind: QuotationLineKind;
  productId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes?: string;
  discountSettings?: DiscountSettings;
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
  discountSettings?: DiscountSettings;
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
  const [discountSettings, setDiscountSettings] = useState(
    initialData?.discountSettings ??
      defaultDiscount(initialData?.discount ?? 0),
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

  // Convert QuotationNotation[] to string[] for internal state
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

  /** Turns on inline error highlighting after the first failed save attempt. */
  const [showErrors, setShowErrors] = useState(false);
  /** Lines whose optional notes box has been opened (lines with saved notes always show it). */
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  const customerRef = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const notationInputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  const approverOptions = useMemo(
    () =>
      approverCandidates.map((u) => ({
        value: u.username,
        label: u.fullName || u.username,
      })),
    [approverCandidates],
  );

  const singleTotalMode = isSingleTotalPricing(pricingMode);
  let discountError = "";
  let totals;
  try {
    totals = quotationTotals(pricingMode, {
      lineItems,
      singleTotalPrice,
      discount,
      discountSettings,
      shippingFee,
    });
    if (singleTotalMode && discountSettings.mode === "PER_ITEM")
      discountError = "Use overall discounts when quoting one total price.";
  } catch (error) {
    discountError =
      error instanceof Error ? error.message : "Invalid discount.";
    totals = quotationTotals(pricingMode, {
      lineItems,
      singleTotalPrice,
      shippingFee,
    });
  }
  const subTotal = totals.subtotal;
  const appliedDiscount = totals.discount;
  const grandTotal = totals.grandTotal;
  const vat = totals.vat;
  const vatableAmount = totals.vatableAmount;

  const selectedProductIds = useMemo(() => {
    return lineItems.map((item) => item.productId).filter(Boolean);
  }, [lineItems]);

  useEffect(() => {
    (async () => {
      try {
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
                priceIsManual: true,
                notes: item.notes || "",
                discountSettings: item.discountSettings,
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

  // Customer pricing seeds a product selection; persisted/manual prices are never
  // recalculated by an effect when catalog data or customer data loads.
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
      priceIsManual: false,
    });
  };

  const addNewLineItem = (kind: QuotationLineKind) => {
    if (readOnly) return;
    const hasEmptyFields = lineItems.some((item) => !lineIsComplete(item));
    if (hasEmptyFields) {
      setShowErrors(true);
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
    if (readOnly || next === pricingMode) return;
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
    // Focus the new row once it has rendered.
    setTimeout(() => {
      const refs = notationInputRefs.current;
      refs[refs.length - 1]?.focus();
    }, 0);
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
    if (discountError) return discountError;
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

  const scrollToField = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /** One validation path for every save action; highlights and scrolls to the first problem. */
  const validateBeforeSave = (): boolean => {
    if (!selectedCustomer) {
      setShowErrors(true);
      toast.error("Please select a customer.");
      scrollToField(customerRef);
      return false;
    }

    if (!projectDescription || projectDescription.trim() === "") {
      setShowErrors(true);
      toast.error("Please enter a quotation description.");
      scrollToField(descriptionRef);
      return false;
    }

    const validationError = quotationValidationError();
    if (validationError) {
      setShowErrors(true);
      toast.error(validationError);
      scrollToField(itemsRef);
      return false;
    }
    return true;
  };

  const handleSaveAndPreview = () => {
    if (!validateBeforeSave()) return;
    onSubmit(getPayload("SAVED"));
  };

  const handleSaveDraft = (numbered = false) => {
    if (!validateBeforeSave()) return;
    const payload = getPayload(
      numbered || !isDraftQuotationReference(quotationNo) ? "SAVED" : "DRAFT",
    );
    // For draft, we don't need a PDF blob
    onSubmit(payload);
  };

  const getPayload = (
    finalStatus: "DRAFT" | "SAVED" | "SENT",
  ): QuotationFormPayload => {
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
        notes: item.notes,
        discountSettings:
          discountSettings.mode === "PER_ITEM"
            ? item.discountSettings
            : undefined,
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
      discount: appliedDiscount,
      discountSettings,
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
      <div
        className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading quotation…</p>
      </div>
    );
  }

  const isDraft = isDraftQuotationReference(quotationNo);
  const filledNotations = notations.filter((n) => n.trim() !== "");

  /* ── Read-only view ─────────────────────────────────────── */
  if (readOnly) {
    return (
      <div className="w-full max-w-[1440px] space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <SectionCard title="Quotation details">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <InfoField
                  label="Quotation No."
                  value={quotationNumberLabel(quotationNo)}
                />
                <InfoField label="Date" value={formatDisplayDate(today)} />
                <InfoField
                  label="Valid until"
                  value={formatDisplayDate(validityDate)}
                />
                <InfoField label="Prepared by" value={preparedBy} />
              </dl>
              <div className="mt-5 border-t pt-5">
                <InfoField
                  label="Description"
                  value={projectDescription}
                  valueClassName="font-semibold uppercase"
                />
              </div>
            </SectionCard>

            <SectionCard title="Customer">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <InfoField
                  label="Client name"
                  value={selectedCustomer?.companyName}
                />
                <InfoField
                  label="Contact person"
                  value={selectedCustomer?.contactPerson}
                />
                <InfoField label="Address" value={selectedCustomer?.address} />
                <InfoField label="Email" value={selectedCustomer?.email} />
              </dl>
            </SectionCard>

            <SectionCard
              title="Line items"
              description={
                singleTotalMode
                  ? `${SINGLE_TOTAL_PRICING_LABEL}: lines are listed by description and the job is quoted as one combined total.`
                  : PER_LINE_PRICING_LABEL
              }
            >
              <ul className="space-y-2 sm:hidden">
                {lineItems.map((row, i) => {
                  const matchedProd = products.find(
                    (p) => String(p.id) === row.productId,
                  );
                  const name =
                    row.kind === "PRODUCT"
                      ? matchedProd?.name ||
                        row.description ||
                        "Unnamed product"
                      : row.description;
                  return (
                    <li key={row.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-medium">
                          {i + 1}. {name}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {row.kind === "PRODUCT" ? "Product" : "Service"}
                        </span>
                      </div>
                      {row.notes && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                          {row.notes}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {row.quantity} {row.unit}
                          {singleTotalMode
                            ? ""
                            : ` × ${formatCurrency(row.unitPrice)}`}
                        </span>
                        {!singleTotalMode && (
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatCurrency(row.quantity * row.unitPrice)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto rounded-md border sm:block">
                <Table className="min-w-[560px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[10%]">Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[10%] text-center">Qty</TableHead>
                      <TableHead className="w-[12%] text-center">
                        Unit
                      </TableHead>
                      {singleTotalMode ? null : (
                        <>
                          <TableHead className="w-[16%] text-right">
                            Price/Unit
                          </TableHead>
                          <TableHead className="w-[16%] text-right">
                            Amount
                          </TableHead>
                        </>
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
                          <TableCell className="align-top text-muted-foreground">
                            {row.kind === "PRODUCT" ? "Product" : "Service"}
                          </TableCell>
                          <TableCell className="align-top font-medium">
                            {row.kind === "PRODUCT"
                              ? matchedProd?.name ||
                                row.description ||
                                "Unnamed product"
                              : row.description}
                            {row.notes && (
                              <div className="mt-1 whitespace-pre-wrap text-xs font-normal text-muted-foreground">
                                {row.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center align-top">
                            {row.quantity}
                          </TableCell>
                          <TableCell className="text-center align-top">
                            {row.unit || "—"}
                          </TableCell>
                          {singleTotalMode ? null : (
                            <>
                              <TableCell className="text-right align-top tabular-nums">
                                {formatCurrency(row.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right align-top font-medium tabular-nums">
                                {formatCurrency(row.quantity * row.unitPrice)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            {filledNotations.length > 0 && (
              <SectionCard title="Notations">
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {filledNotations.map((note, idx) => (
                    <li key={idx} className="break-words leading-relaxed">
                      {note}
                    </li>
                  ))}
                </ol>
              </SectionCard>
            )}

            <SectionCard title="Terms">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <InfoField label="Terms of payment" value={paymentTerms} />
                <InfoField label="Delivery" value={deliveryTerms} />
                <InfoField label="Warranty" value={warrantyTerms} />
                <InfoField label="Approved by" value={approvedBy} />
              </dl>
            </SectionCard>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <SectionCard title="Summary">
              <TotalsBreakdown
                singleTotalMode={singleTotalMode}
                singleTotalPrice={singleTotalPrice}
                subTotal={subTotal}
                shippingFee={shippingFee}
                appliedDiscount={appliedDiscount}
                grandTotal={grandTotal}
                vat={vat}
                vatableAmount={vatableAmount}
              />
            </SectionCard>
            <div className="flex justify-end gap-2">
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
          </aside>
        </div>
      </div>
    );
  }

  /* ── Edit view ──────────────────────────────────────────── */
  const customerMissing = showErrors && !selectedCustomer;
  const descriptionMissing = showErrors && !projectDescription.trim();

  const secondaryActions = (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
        Cancel
      </Button>
      <Button
        onClick={() => handleSaveDraft(false)}
        disabled={isSaving}
        variant="outline"
        className="gap-2"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isDraft ? "Save draft" : "Save"}
      </Button>
      {isDraft && (
        <Button
          onClick={() => handleSaveDraft(true)}
          disabled={isSaving}
          variant="outline"
        >
          Save with number
        </Button>
      )}
    </>
  );

  return (
    <div className="w-full max-w-[1440px] space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ── Left column: the quotation content ── */}
        <div className="min-w-0 space-y-6">
          {/* Details & customer */}
          <SectionCard
            title="Quotation & customer"
            description="Pick the customer and describe the job."
          >
            <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-muted/50 p-3 sm:grid-cols-4">
              <MetaItem
                label="Quotation no."
                value={quotationNumberLabel(quotationNo)}
              />
              <MetaItem label="Date" value={formatDisplayDate(today)} />
              <MetaItem
                label="Valid until"
                value={formatDisplayDate(validityDate)}
              />
              <MetaItem label="Prepared by" value={preparedBy || "—"} />
            </dl>

            <div className="space-y-5">
              <div ref={customerRef}>
                <RequiredLabel>Client name</RequiredLabel>
                <div
                  className={cn(
                    "mt-1 rounded-md",
                    customerMissing && "ring-2 ring-destructive/60",
                  )}
                >
                  <SearchableSelect
                    value={customerId}
                    onValueChange={(value) => {
                      setCustomerId(value);
                      setLineItems((rows) =>
                        rows.map((row) =>
                          row.productId && !row.priceIsManual
                            ? {
                                ...row,
                                unitPrice: calculateUnitPrice(
                                  row.productId,
                                  value,
                                ),
                              }
                            : row,
                        ),
                      );
                    }}
                    options={customerOptions}
                    placeholder="Select customer"
                    searchPlaceholder="Search customers..."
                    disabled={isSaving || readOnly}
                  />
                </div>
                {customerMissing && (
                  <FieldError>Select a customer to continue.</FieldError>
                )}
              </div>

              {selectedCustomer ? (
                <dl className="grid gap-x-8 gap-y-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                  <InfoField label="Address" value={selectedCustomer.address} />
                  <InfoField
                    label="Contact person"
                    value={selectedCustomer.contactPerson}
                  />
                  <InfoField label="Email" value={selectedCustomer.email} />
                </dl>
              ) : (
                <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  Customer address and contact appear here once you pick a
                  customer.
                </p>
              )}

              <div ref={descriptionRef}>
                <RequiredLabel>Description</RequiredLabel>
                <Input
                  value={projectDescription}
                  onChange={(e) =>
                    setProjectDescription(upperText(e.target.value))
                  }
                  placeholder="e.g. Portable RO parts"
                  className={cn(
                    "mt-1 font-semibold uppercase placeholder:font-normal placeholder:normal-case",
                    descriptionMissing &&
                      "border-destructive focus-visible:ring-destructive/40",
                  )}
                  aria-invalid={descriptionMissing || undefined}
                  disabled={isSaving || readOnly}
                />
                {descriptionMissing && (
                  <FieldError>
                    Add a short description of what is being quoted.
                  </FieldError>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Line items */}
          <SectionCard
            title="Line items"
            required
            innerRef={itemsRef}
            description="Add the products and services being quoted."
          >
            {/* Pricing mode: explicit, and switching never discards descriptions or prices. */}
            <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pricing mode</p>
                <p className="text-xs text-muted-foreground">
                  {singleTotalMode
                    ? "Lines are listed by description. One combined price is entered once and shown as a single total."
                    : "Every line is priced individually."}
                </p>
              </div>
              <div
                role="group"
                aria-label="Pricing mode"
                className="flex w-full shrink-0 rounded-md border bg-background p-0.5 sm:inline-flex sm:w-auto"
              >
                <SegmentButton
                  active={pricingMode === "PER_LINE"}
                  onClick={() => changePricingMode("PER_LINE")}
                  disabled={isSaving || readOnly}
                >
                  {PER_LINE_PRICING_LABEL}
                </SegmentButton>
                <SegmentButton
                  active={pricingMode === "SINGLE_TOTAL"}
                  onClick={() => changePricingMode("SINGLE_TOTAL")}
                  disabled={isSaving || readOnly}
                >
                  {SINGLE_TOTAL_PRICING_LABEL}
                </SegmentButton>
              </div>
            </div>

            {pricingNotice ? (
              <div
                role="status"
                className="mb-4 flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-2.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{pricingNotice}</span>
                <button
                  type="button"
                  onClick={() => setPricingNotice("")}
                  aria-label="Dismiss notice"
                  className="-m-1 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {singleTotalMode ? (
              <div className="mb-4 rounded-lg border bg-background p-3">
                <Label htmlFor="quotation-single-total">
                  {SINGLE_TOTAL_PRICE_LABEL} (PHP)
                </Label>
                <Input
                  id="quotation-single-total"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={singleTotalPrice || ""}
                  placeholder="0.00"
                  className={cn(
                    "mt-2 sm:max-w-xs",
                    showErrors &&
                      singleTotalPrice <= 0 &&
                      "border-destructive focus-visible:ring-destructive/40",
                  )}
                  disabled={isSaving || readOnly}
                  onChange={(e) =>
                    setSingleTotalPrice(
                      Math.max(0, Number(e.target.value) || 0),
                    )
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Entered once for the whole job. No per-line price is displayed
                  or derived from this total.
                </p>
              </div>
            ) : null}

            <ul className="space-y-3">
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
                const lineInvalid = showErrors && !lineIsComplete(row);
                const lineAmount = row.quantity * row.unitPrice;

                return (
                  <li
                    key={row.id}
                    className={cn(
                      "rounded-lg border bg-background p-3 sm:p-4",
                      lineInvalid && "border-destructive/70",
                    )}
                  >
                    {/* Row header: index, type switch, reorder/remove */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div
                          role="group"
                          aria-label={`Type of line ${index + 1}`}
                          className="inline-flex rounded-md border bg-muted/40 p-0.5"
                        >
                          <SegmentButton
                            active={row.kind === "PRODUCT"}
                            onClick={() => switchLineKind(row.id, "PRODUCT")}
                            disabled={isSaving || readOnly}
                            small
                          >
                            <Package className="mr-1 h-3.5 w-3.5" />
                            Product
                          </SegmentButton>
                          <SegmentButton
                            active={row.kind === "SERVICE"}
                            onClick={() => switchLineKind(row.id, "SERVICE")}
                            disabled={isSaving || readOnly}
                            small
                          >
                            <Wrench className="mr-1 h-3.5 w-3.5" />
                            Service
                          </SegmentButton>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 sm:h-8 sm:w-8"
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
                          className="h-9 w-9 sm:h-8 sm:w-8"
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
                          className="h-9 w-9 text-destructive hover:text-destructive sm:h-8 sm:w-8"
                          title="Remove line"
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() =>
                            setLineItems((rows) =>
                              rows.length > 1
                                ? rows.filter((r) => r.id !== row.id)
                                : rows,
                            )
                          }
                          disabled={
                            lineItems.length <= 1 || isSaving || readOnly
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-6 gap-3 md:grid-cols-12">
                      <div className="col-span-6 md:col-span-12">
                        <Label className="text-xs text-muted-foreground">
                          {row.kind === "PRODUCT" ? "Product" : "Service"}
                        </Label>
                        <div className="mt-1">
                          {row.kind === "PRODUCT" ? (
                            <SearchableSelect
                              value={row.productId}
                              onValueChange={(v) => onProductSelect(row.id, v)}
                              options={individualProductOptions}
                              placeholder="Select product"
                              searchPlaceholder="Search products..."
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
                              className="uppercase"
                              aria-label={`Service description line ${index + 1}`}
                              aria-invalid={lineInvalid || undefined}
                              disabled={isSaving || readOnly}
                            />
                          )}
                        </div>
                        {lineInvalid && (
                          <FieldError>
                            {row.kind === "PRODUCT"
                              ? "Choose a catalog product, or switch this line to Service."
                              : "Describe the service or repair work."}
                          </FieldError>
                        )}
                      </div>

                      <div
                        className={cn(
                          "col-span-2",
                          singleTotalMode ? "md:col-span-6" : "md:col-span-3",
                        )}
                      >
                        <Label
                          className="text-xs text-muted-foreground"
                          htmlFor={`qty-${row.id}`}
                        >
                          Qty
                        </Label>
                        <Input
                          id={`qty-${row.id}`}
                          type="number"
                          inputMode="decimal"
                          min={1}
                          value={row.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            updateLine(row.id, {
                              quantity: Number(e.target.value) || 0,
                            })
                          }
                          className="mt-1"
                          disabled={isSaving || readOnly}
                        />
                      </div>
                      <div
                        className={cn(
                          "col-span-2",
                          singleTotalMode ? "md:col-span-6" : "md:col-span-3",
                        )}
                      >
                        <Label
                          className="text-xs text-muted-foreground"
                          htmlFor={`unit-${row.id}`}
                        >
                          Unit
                        </Label>
                        <Input
                          id={`unit-${row.id}`}
                          value={row.unit}
                          onChange={(e) =>
                            updateLine(row.id, {
                              unit: upperText(e.target.value),
                            })
                          }
                          placeholder="PCS"
                          className="mt-1 uppercase"
                          disabled={isSaving || readOnly}
                        />
                      </div>
                      {singleTotalMode ? null : (
                        <>
                          <div className="col-span-2 md:col-span-3">
                            <Label
                              className="text-xs text-muted-foreground"
                              htmlFor={`price-${row.id}`}
                            >
                              Price / unit
                            </Label>
                            <Input
                              id={`price-${row.id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={row.unitPrice || ""}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                updateLine(row.id, {
                                  priceIsManual: true,
                                  unitPrice: Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  ),
                                })
                              }
                              placeholder="0.00"
                              className="mt-1 text-right"
                              disabled={isSaving || readOnly}
                            />
                          </div>
                          <div className="col-span-6 flex items-end justify-between rounded-md bg-muted/40 px-3 py-2 md:col-span-3 md:flex-col md:items-end md:justify-end md:bg-transparent md:p-0 md:pb-2">
                            <span className="text-xs text-muted-foreground">
                              Amount
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {formatCurrency(lineAmount)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {row.notes || openNotes.has(row.id) ? (
                      <Textarea
                        aria-label={`Item notes line ${index + 1}`}
                        value={row.notes || ""}
                        onChange={(e) =>
                          updateLine(row.id, { notes: e.target.value })
                        }
                        placeholder="Notes / scope of work (multiple lines)"
                        className="mt-3 min-h-16 text-sm"
                        disabled={isSaving || readOnly}
                        autoFocus={!row.notes}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setOpenNotes((prev) => new Set(prev).add(row.id))
                        }
                        disabled={isSaving || readOnly}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add notes
                      </Button>
                    )}
                    {discountSettings.mode === "PER_ITEM" &&
                      !singleTotalMode && (
                        <div className="mt-3 space-y-1.5 rounded-md bg-muted/30 p-2.5">
                          <Label className="text-xs text-muted-foreground">
                            Line discount
                          </Label>
                          <DiscountInput
                            value={row.discountSettings ?? defaultDiscount()}
                            onChange={(value) =>
                              updateLine(row.id, { discountSettings: value })
                            }
                            showScope
                            disabled={isSaving || readOnly}
                          />
                        </div>
                      )}
                  </li>
                );
              })}
            </ul>

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
          </SectionCard>

          {/* Notations */}
          <SectionCard
            title="Notations"
            description="Extra conditions or remarks printed on the quotation. Press Enter to add another."
          >
            <ol className="space-y-2">
              {notations.map((note, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Input
                    ref={(el) => {
                      notationInputRefs.current[index] = el;
                    }}
                    value={note}
                    onChange={(e) =>
                      handleNotationChange(index, e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (note.trim()) addNotationRow();
                      }
                    }}
                    placeholder="Add a remark or condition…"
                    aria-label={`Notation ${index + 1}`}
                    className="h-9 text-sm uppercase placeholder:normal-case"
                    disabled={isSaving || readOnly}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Remove notation ${index + 1}`}
                    title="Remove notation"
                    onClick={() => removeNotationRow(index)}
                    disabled={
                      (notations.length === 1 && !note) || isSaving || readOnly
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={addNotationRow}
              disabled={isSaving || readOnly}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add notation
            </Button>
          </SectionCard>

          {/* Terms & signature */}
          <SectionCard title="Terms & signature">
            <div className="grid gap-4 sm:grid-cols-2">
              <TermsSelect
                label="Terms of payment"
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
                label="Warranty"
                value={warrantyTerms}
                onChange={setWarrantyTerms}
                options={WARRANTY_TERMS}
                disabled={isSaving || readOnly}
              />
              <TermsSelect
                label="Delivery"
                className="sm:col-span-2"
                value={deliveryTerms}
                onChange={setDeliveryTerms}
                options={DELIVERY_TERMS}
                disabled={isSaving || readOnly}
              />
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="font-semibold">Approved by</Label>
                <SearchableSelect
                  value={approvedByUsername}
                  onValueChange={setApprovedByUsername}
                  options={approverOptions}
                  placeholder="Select approver..."
                  searchPlaceholder="Search people..."
                  disabled={isSaving || readOnly}
                />
                <p className="text-xs text-muted-foreground">
                  {approverOptions.length === 0
                    ? "No eligible approvers found."
                    : "Your department or an executive."}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right column: summary (sticky on large screens) ── */}
        <aside className="lg:sticky lg:top-4">
          <SectionCard title="Summary">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="quotation-shipping-fee">
                  Shipping fee (PHP, optional)
                </Label>
                <Input
                  id="quotation-shipping-fee"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={shippingFee || ""}
                  placeholder="0.00"
                  disabled={isSaving || readOnly}
                  onChange={(e) =>
                    setShippingFee(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Discount</Label>
                {discountError && (
                  <p role="alert" className="text-sm text-destructive">
                    {discountError}
                  </p>
                )}
                <DiscountInput
                  value={discountSettings}
                  onChange={(next) => {
                    setDiscountSettings(next);
                    setDiscount(0);
                    if (next.mode === "OVERALL")
                      setLineItems((rows) =>
                        rows.map((row) => ({
                          ...row,
                          discountSettings: undefined,
                        })),
                      );
                  }}
                  showMode
                  disabled={isSaving || readOnly}
                />
              </div>

              <div className="border-t pt-4">
                <TotalsBreakdown
                  singleTotalMode={singleTotalMode}
                  singleTotalPrice={singleTotalPrice}
                  subTotal={subTotal}
                  shippingFee={shippingFee}
                  appliedDiscount={appliedDiscount}
                  grandTotal={grandTotal}
                  vat={vat}
                  vatableAmount={vatableAmount}
                  alwaysShowDiscount
                />
              </div>
            </div>
          </SectionCard>
        </aside>
      </div>

      {/* Phones: secondary actions sit at the end of the form, full width */}
      <div className="grid gap-2 sm:hidden [&>button]:w-full">
        {secondaryActions}
      </div>

      {/* Sticky bar: running total + the primary action (all actions from sm up) */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Grand total (VAT inc.)
            </p>
            <p className="truncate text-lg font-bold tabular-nums leading-tight">
              {formatCurrency(grandTotal)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              {secondaryActions}
            </div>
            <Button
              onClick={handleSaveAndPreview}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Save &amp; preview
            </Button>
          </div>
        </div>
        {isDraft && (
          <p className="mt-2 hidden text-xs text-muted-foreground sm:block">
            Drafts stay unnumbered until you choose Save with number.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Presentational helpers ──────────────────────────────── */

function SectionCard({
  title,
  description,
  required,
  children,
  innerRef,
}: {
  title: string;
  description?: string;
  required?: boolean;
  children: ReactNode;
  innerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <section
      ref={innerRef}
      className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold leading-tight">
          {title}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function InfoField({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value?: string | null;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm", valueClassName)}>
        {value && String(value).trim() ? value : "—"}
      </dd>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {children}
    </p>
  );
}

function SegmentButton({
  active,
  onClick,
  disabled,
  small,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-[5px] sm:flex-none font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TotalsBreakdown({
  singleTotalMode,
  singleTotalPrice,
  subTotal,
  shippingFee,
  appliedDiscount,
  grandTotal,
  vat,
  vatableAmount,
  alwaysShowDiscount,
}: {
  singleTotalMode: boolean;
  singleTotalPrice: number;
  subTotal: number;
  shippingFee: number;
  appliedDiscount: number;
  grandTotal: number;
  vat: number;
  vatableAmount: number;
  alwaysShowDiscount?: boolean;
}) {
  return (
    <div className="space-y-2.5 text-sm">
      {singleTotalMode ? (
        <TotalRow
          label={SINGLE_TOTAL_PRICE_LABEL}
          value={formatCurrency(singleTotalPrice)}
        />
      ) : (
        <TotalRow label="Sub total" value={formatCurrency(subTotal)} />
      )}
      {shippingFee > 0 && (
        <TotalRow label="Shipping fee" value={formatCurrency(shippingFee)} />
      )}
      {(appliedDiscount > 0 || alwaysShowDiscount) && (
        <TotalRow
          label="Less discount"
          value={`-${formatCurrency(appliedDiscount)}`}
        />
      )}
      <div className="border-t pt-2.5">
        <TotalRow
          label="Grand total (VAT inc.)"
          value={formatCurrency(grandTotal)}
          bold
        />
      </div>
      <TotalRow label="VAT" value={formatCurrency(vat)} muted />
      <TotalRow
        label="Vatable amount"
        value={formatCurrency(vatableAmount)}
        muted
      />
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        bold && "text-lg font-bold",
        muted && "text-xs text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TermsSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
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
