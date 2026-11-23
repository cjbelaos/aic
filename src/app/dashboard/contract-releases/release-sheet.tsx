"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  WarehouseSelect,
  approvalPrompt,
  useActiveWarehouses,
  useStockCheck,
} from "@/components/inventory/dr-stock";
import { LineSources } from "@/components/inventory/line-sources";
import { sourcesComplete, storedSources, syncSingleSource, type WarehouseSource } from "@/lib/deliverySources";
import deliveryService from "@/lib/services/delivery.service";
import productService from "@/lib/services/product.service";
import userService from "@/lib/services/user.service";
import { manilaToday } from "@/lib/contractStatus";
import type { AgreementLedger, CustomerLedger } from "@/types/contract-release";
import type {
  ContractLine,
  CreateDeliveryPayload,
  DeliveryPersonOption,
  DeliveryReceiptResponse,
} from "@/types/deliveryReceipt";
import type { Product } from "@/types/product";

interface Row {
  key: string;
  /** Empty for an extra item, which is delivered but not counted against the agreement. */
  contractItemId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  owed: number;
  quantity: number;
  /** Warehouse parts the user chose; unset = all from the default warehouse. */
  sources?: WarehouseSource[];
}

interface Props {
  customer: CustomerLedger;
  agreement: AgreementLedger;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReleased: (res: DeliveryReceiptResponse) => void;
}

/** Releases one agreement's owed items on a single printed DR (no Sales Order). */
export function ReleaseSheet({ customer, agreement, open, onOpenChange, onReleased }: Props) {
  const warehouses = useActiveWarehouses();
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<DeliveryPersonOption[]>([]);
  const [preparedBy, setPreparedBy] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [date, setDate] = useState(manilaToday);
  const [remarks, setRemarks] = useState("");
  // The page mounts this sheet per agreement, so the rows start from what is owed.
  const [rows, setRows] = useState<Row[]>(() =>
    agreement.items
      .filter((item) => item.owedNow > 0)
      .map((item) => ({
        key: item.contractItemId,
        contractItemId: item.contractItemId,
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        owed: item.owedNow,
        quantity: item.owedNow,
      })),
  );
  const [saving, setSaving] = useState(false);
  // Set synchronously so a second click queued before re-render cannot make a second DR.
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    productService.getAll().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => setProducts([]));
    deliveryService.getDrivers().then(setDrivers).catch(() => setDrivers([]));
    try {
      const raw = window.localStorage.getItem("auth:user");
      const username = raw ? JSON.parse(raw).userName || "" : "";
      if (username) userService.getFullnameByUserName(username).then(setPreparedBy).catch(() => {});
    } catch {
      // ignore
    }
  }, [open]);


  const productById = (row: Row) =>
    row.productId || products.find((p) => p.code.toLowerCase() === row.productCode.toLowerCase())?.id || "";
  const productName = (id: string) => products.find((p) => p.id === id)?.name || rows.find((r) => r.productId === id)?.productName || id;
  const warehouseName = (id: string) => warehouses.find((w) => w.warehouseId === id)?.name || id;

  const partsOf = (r: Row) => syncSingleSource(r.sources, r.quantity, warehouseId);
  // Stock is checked per warehouse part, not per row.
  const stockLines = useMemo(
    () => rows
      .filter((r) => r.productCode && r.quantity > 0)
      .flatMap((r) => partsOf(r).map((part) => ({ warehouseId: part.warehouseId, productId: productById(r), productCode: r.productCode, quantity: part.quantity }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products, warehouseId],
  );
  const stock = useStockCheck({ lines: stockLines, enabled: open });

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.code, label: p.name ? `${p.name} (${p.code})` : p.code, hidden: p.status === "inactive" })),
    [products],
  );

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addExtra = () =>
    setRows((rs) => [
      ...rs,
      { key: `extra-${Date.now()}`, contractItemId: "", productId: "", productCode: "", productName: "", unit: "", owed: 0, quantity: 1 },
    ]);

  const pickExtraProduct = (key: string, code: string) => {
    const p = products.find((x) => x.code === code);
    update(key, { productCode: code, productId: p?.id || "", productName: p?.name || code, unit: p?.unit?.code || "PC" });
  };

  const submit = async () => {
    if (savingRef.current) return;
    const driver = drivers.find((d) => d.value === deliveredBy);
    if (!warehouseId) return void toast.error("Default warehouse is required.");
    if (!driver) return void toast.error("Delivered by is required.");
    if (!preparedBy.trim()) return void toast.error("Could not find your name for Prepared By. Sign in again.");
    const lines = rows.filter((r) => r.productCode && r.quantity > 0);
    if (!lines.length) return void toast.error("Add at least one item with a quantity.");
    if (lines.some((r) => !Number.isInteger(r.quantity))) return void toast.error("Quantities must be whole numbers.");

    if (!sourcesComplete(lines.map((r) => ({ quantity: r.quantity, sources: partsOf(r) })))) {
      return void toast.error("Warehouse quantities must add up to each line's quantity.");
    }
    const approvalText = approvalPrompt(stock.check, stock.level, warehouseName, productName);
    if (approvalText && !window.confirm(approvalText)) return;

    const contractLines: ContractLine[] = [];
    lines.forEach((r, index) => {
      if (r.contractItemId) contractLines.push({ contractItemId: r.contractItemId, quantity: r.quantity, deliveryLineIndex: index });
    });
    const payload: CreateDeliveryPayload = {
      companyId: customer.companyId,
      date,
      poNo: agreement.agreementType === "PO" ? agreement.poNumber : "",
      preparedBy,
      deliveredBy: driver.label,
      deliveredById: driver.userId,
      deliveredByType: driver.type,
      deliveredByOptionId: driver.deliveryOptionId,
      comments: remarks,
      items: lines.map((r) => ({
        productId: productById(r) || undefined,
        productCode: r.productCode,
        unit: r.unit || "PC",
        description: r.productName,
        quantity: r.quantity,
        serialNumbers: [],
        sources: partsOf(r),
      })),
      status: "printed",
      warehouseId,
      contractLines,
    };

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await deliveryService.createAndPopulateSheet(payload);
      if (res.contractReleaseError) toast.error(res.contractReleaseError);
      if (res.status === "pending_approval") {
        toast.success("Sent for approval. It will count once a manager approves it.");
      } else {
        toast.success(`DR #${res.drNumber} created.`);
      }
      onOpenChange(false);
      onReleased(res);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e.response?.data?.error || e.message || "Failed to create the delivery receipt.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Release · {agreement.contractId}</SheetTitle>
          <SheetDescription>
            {customer.companyName}
            {agreement.agreementType === "PO" && agreement.poNumber ? ` · PO ${agreement.poNumber}` : ""}
            {agreement.description ? ` · ${agreement.description}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
          <div className="space-y-2">
            <Label>
              Delivered By <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              value={deliveredBy}
              onValueChange={setDeliveredBy}
              options={drivers.map((d) => ({ value: d.value, label: d.label }))}
              placeholder="Select driver"
              searchPlaceholder="Search drivers..."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="release-date">Date</Label>
              <Input id="release-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Prepared By</Label>
              <Input value={preparedBy} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="release-remarks">Remarks</Label>
            <Textarea id="release-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          <div className="space-y-3">
            <Label>Items</Label>
            {rows.map((r) => (
              <div key={r.key} className="space-y-1 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {r.contractItemId ? (
                      <>
                        <p className="truncate text-sm font-medium">{r.productName}</p>
                        <p className="text-xs text-muted-foreground">owed {r.owed}{r.unit ? ` ${r.unit}` : ""}</p>
                      </>
                    ) : (
                      <SearchableSelect
                        value={r.productCode}
                        onValueChange={(code) => pickExtraProduct(r.key, code)}
                        options={productOptions}
                        placeholder="Extra item (not counted)"
                        searchPlaceholder="Search products..."
                      />
                    )}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="w-20"
                    value={Number.isFinite(r.quantity) ? r.quantity : ""}
                    onChange={(e) => update(r.key, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                    aria-label={`Quantity for ${r.productName || "extra item"}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {r.contractItemId && r.quantity > r.owed && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    More than owed ({r.owed}). The extra {r.quantity - r.owed} will not pay future periods.
                  </p>
                )}
                {r.productCode && (
                  <LineSources
                    value={partsOf(r)}
                    onChange={(next) => update(r.key, { sources: storedSources(next, warehouseId) })}
                    quantity={r.quantity}
                    warehouses={warehouses}
                    check={stock.check}
                    productId={productById(r)}
                    productName={r.productName}
                  />
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addExtra}>
              <Plus className="mr-1 h-4 w-4" /> Add extra item
            </Button>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Release
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
