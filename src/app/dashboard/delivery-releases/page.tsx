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
  const [deliveredBy, setDeliveredBy] = useState("");
  const [comments, setComments] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
      companies.map((c) => ({ value: c.companyName, label: c.companyName })),
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
        companyName: selectedCompany,
        date: deliveryDate,
        poNo,
        trNo,
        deliveredBy,
        comments,
        items: lineItems,
      };

      // 1. Write to DeliveryReceipts & update Google Sheets Template
      const res = await deliveryService.createAndPopulateSheet(payload);
      toast.success("Delivery receipt recorded!");

      // 2. Open print window / export URL from Google Sheets API
      if (res.printUrl) {
        window.open(res.printUrl, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process delivery receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      {/* Left 2 Columns: Delivery Form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Create Delivery Receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Customer Name *</Label>
              <SearchableSelect
                value={selectedCompany}
                onValueChange={setSelectedCompany}
                options={companyOptions}
                placeholder="Select Customer"
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div>
              <Label>PO NO.</Label>
              <Input
                value={poNo}
                onChange={(e) => setPoNo(e.target.value)}
                placeholder="e.g. PO-10293"
              />
            </div>
            <div>
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
              <Label className="font-semibold">Products / Consumables</Label>
              <Button size="sm" variant="outline" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {lineItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <div className="w-1/2">
                  <SearchableSelect
                    value={item.productCode}
                    onValueChange={(v) => updateLineItem(idx, "productCode", v)}
                    options={productOptions}
                    placeholder="Select Product"
                  />
                </div>
                <Input
                  className="w-20"
                  value={item.unit}
                  readOnly
                  placeholder="Unit"
                />
                <Input
                  className="w-24"
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
                  className="text-destructive"
                  onClick={() => removeLineItem(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Delivered By *</Label>
              <SearchableSelect
                value={deliveredBy}
                onValueChange={setDeliveredBy}
                options={driverOptions}
                placeholder="Select Personnel"
              />
            </div>
            <div>
              <Label>Comments / Special Instructions</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="e.g. MONTHLY PMS FOR THE MONTH OF AUGUST"
              />
            </div>
          </div>

          <Button
            onClick={handleSaveAndPrint}
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
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
  );
}
