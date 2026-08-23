"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash2, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import contractService from "@/lib/services/contract.service";
import deliveryService from "@/lib/services/delivery.service";
import userService from "@/lib/services/user.service";
import { DeliveryReceiptPreviewModal } from "@/components/delivery-receipt-preview-modal";
import { DeliveryReceiptResponse } from "@/types/delivery";

interface LineItem {
  productCode: string;
  unit: string;
  description: string;
  quantity: number;
}

export default function DeliveryReleasePage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<string[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [poNo, setPoNo] = useState("");
  const [trNo, setTrNo] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [comments, setComments] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [drResult, setDrResult] = useState<DeliveryReceiptResponse | null>(null);

  useEffect(() => {
    Promise.all([
      companyService.getAll(),
      productService.getAll(),
      deliveryService.getDrivers(),
    ]).then(([cData, pData, dData]) => {
      setCompanies(Array.isArray(cData) ? cData : []);
      setProducts(Array.isArray(pData) ? pData : []);
      setDrivers(Array.isArray(dData) ? dData : []);
    });

    // Auto-populate Prepared By from logged-in user (resolved via API)
    (async () => {
      try {
        const raw = window.localStorage.getItem("auth:user");
        if (raw) {
          const parsed = JSON.parse(raw);
          const username = parsed.userName || "";
          if (username) {
            const fullName = await userService.getFullnameByUserName(username);
            setPreparedBy(fullName);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch contract entitlements & usage when company changes
  useEffect(() => {
    if (!selectedCompany) {
      setContracts([]);
      return;
    }
    contractService.getEntitlementsByCustomer(selectedCompany).then((res) => {
      setContracts(res);
    });
  }, [selectedCompany]);

  const companyOptions = useMemo(
    () =>
      companies.map((c) => ({ value: c.companyId, label: c.companyName })),
    [companies],
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({ value: p.code, label: `${p.code} - ${p.name}` })),
    [products],
  );

  const driverOptions = useMemo(
    () => drivers.map((d) => ({ value: d, label: d })),
    [drivers],
  );

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { productCode: "", unit: "PC", description: "", quantity: 1 },
    ]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    if (field === "productCode") {
      const prod = products.find((p) => p.code === value);
      updated[index] = {
        ...updated[index],
        productCode: value,
        unit: prod?.unitCode || "PC",
        description: prod?.name || prod?.description || "",
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleSaveAndPrint = async () => {
    if (!preparedBy.trim()) {
      toast.error("Prepared by is required.");
      return;
    }
    if (!deliveredBy.trim()) {
      toast.error("Delivered by is required.");
      return;
    }
    if (!selectedCompany || lineItems.length === 0) {
      toast.error("Please select a customer and add at least one product.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        companyId: selectedCompany,
        date: deliveryDate,
        poNo,
        trNo,
        preparedBy,
        deliveredBy,
        comments,
        items: lineItems,
      };

      const res = await deliveryService.createAndPopulateSheet(payload);
      toast.success("Delivery receipt recorded!");
      setDrResult(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to process delivery receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      {/* Left 2 Columns: Delivery Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Create Delivery Receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 space-y-1.5 w-full">
              <Label>
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                value={selectedCompany}
                onValueChange={setSelectedCompany}
                options={companyOptions}
                placeholder="Select Customer"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PO NO.</Label>
              <Input
                value={poNo}
                onChange={(e) => setPoNo(e.target.value)}
                placeholder="e.g. PO-10293"
              />
            </div>
            <div className="space-y-2">
              <Label>TR#</Label>
              <Input
                value={trNo}
                onChange={(e) => setTrNo(e.target.value)}
                placeholder="e.g. TR-8841"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-base font-semibold">Products / Consumables</Label>
              <Button size="sm" variant="outline" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {lineItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <div className="flex-1 min-w-[200px]">
                  <SearchableSelect
                    value={item.productCode}
                    onValueChange={(v) => updateLineItem(idx, "productCode", v)}
                    options={productOptions}
                    placeholder="Select Product"
                  />
                </div>
                <Input
                  className="w-20 shrink-0"
                  value={item.unit}
                  readOnly
                  placeholder="Unit"
                />
                <Input
                  className="w-24 shrink-0"
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    updateLineItem(
                      idx,
                      "quantity",
                      parseInt(e.target.value) || 1,
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive shrink-0"
                  onClick={() => removeLineItem(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Prepared By <span className="text-destructive">*</span>
              </Label>
              <Input
                value={preparedBy}
                readOnly
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5 w-full">
              <Label>
                Delivered By <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                value={deliveredBy}
                onValueChange={setDeliveredBy}
                options={driverOptions}
                placeholder="Select Personnel"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Comments / Special Instructions</Label>
            <Textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="e.g. MONTHLY PMS FOR THE MONTH OF AUGUST"
              />
          </div>

          <Button
            onClick={handleSaveAndPrint}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Save & Print Delivery Receipt
          </Button>
        </CardContent>
      </Card>

      {/* Right Column: Contract Entitlement Tracker */}
      <Card>
        <CardHeader>
          <CardTitle>Contract Entitlements</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedCompany ? (
            <p className="text-sm text-muted-foreground">
              Select a customer to view active consumable entitlements.
            </p>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active contract found for this customer.
            </p>
          ) : (
            <div className="space-y-3">
              {contracts.map((c, i) => (
                <div
                  key={i}
                  className="p-3 border rounded-lg space-y-1 bg-muted/40 text-sm"
                >
                  <div className="font-semibold text-primary">
                    {c.productName}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Entitled: {c.entitledQty} {c.unit} / {c.frequency}
                    </span>
                    <span>Released: {c.releasedThisPeriod}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    <DeliveryReceiptPreviewModal
      dr={drResult}
      open={!!drResult}
      onOpenChange={(v) => {
        if (!v) setDrResult(null);
      }}
    />
  </>
  );
}
