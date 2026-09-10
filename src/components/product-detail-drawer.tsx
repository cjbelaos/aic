"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import supplierProductService from "@/lib/services/supplier-product-v2.service";
import customerPriceService from "@/lib/services/customer-price.service";
import companyService from "@/lib/services/company.service";
import type { Product } from "@/types/product";
import type { SupplierProductV2 } from "@/types/supplier-product";
import type { CustomerPrice } from "@/types/customer-price";
import type { Company } from "@/types/company";

export function ProductDetailDrawer({ product, open, onOpenChange }: { product: Product | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [offerings, setOfferings] = useState<SupplierProductV2[]>([]);
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !product?.productId) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.all([
        supplierProductService.getAll({ productId: product.productId }),
        customerPriceService.getAll(),
        companyService.getAll(),
      ]).then(([supplierRows, customerRows, companyRows]) => {
        setOfferings(supplierRows);
        setPrices(customerRows.filter((price) => String(price.productId) === product.productId || price.productCode === product.code));
        setCompanies(Array.isArray(companyRows) ? companyRows : []);
      }).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, product?.productId, product?.code]);

  const companyName = (id: string) => companies.find((company) => company.companyId === id)?.companyName ?? id;
  const currency = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

  return <Drawer open={open} onOpenChange={onOpenChange} direction="right">
    <DrawerContent className="w-full sm:max-w-xl overflow-y-auto">
      <DrawerHeader>
        <DrawerTitle>{product?.name}</DrawerTitle>
        <DrawerDescription>{product?.code} - {product?.category.name} - {product?.unit.name}</DrawerDescription>
      </DrawerHeader>
      {product && <div className="space-y-6 px-4 pb-6">
        <div className="rounded-lg border p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground">Default selling price</p><p className="font-semibold">{currency(product.defaultSellingPrice ?? product.pricePerUnit)}</p></div>
          <Badge variant="secondary">{product.supplierCount ?? offerings.length} suppliers</Badge>
        </div>
        <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Supplier offerings</h3><Button asChild size="sm" variant="outline"><Link href={`/dashboard/supplier-products?productId=${encodeURIComponent(product.productId ?? "")}`}>Manage <ExternalLink className="ml-1 h-3.5 w-3.5" /></Link></Button></div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : offerings.length ? <div className="rounded-lg border divide-y">{offerings.map((offering) => <div key={offering.supplierProductId} className="p-3 flex justify-between gap-3"><div><p className="font-medium">{offering.supplierProductName}</p><p className="text-xs text-muted-foreground">{companyName(offering.supplierId)}{offering.supplierProductCode ? ` - ${offering.supplierProductCode}` : ""}</p></div><div className="text-right"><p className="font-medium">{currency(offering.costPerUnit)}</p>{offering.isPreferredSupplier && <Badge className="mt-1" variant="secondary">Preferred</Badge>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No supplier offerings yet.</p>}</section>
        <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Customer prices</h3><Button asChild size="sm" variant="outline"><Link href="/dashboard/customer-prices">Manage <ExternalLink className="ml-1 h-3.5 w-3.5" /></Link></Button></div>
          {loading ? null : prices.length ? <div className="rounded-lg border divide-y">{prices.map((price) => <div key={price.id} className="p-3 flex justify-between"><div><p className="font-medium">{price.companyName}</p><p className="text-xs text-muted-foreground">{price.customerProductName || product.name}</p></div><p className="font-medium">{currency(price.pricePerUnit)}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No customer-specific prices yet.</p>}</section>
      </div>}
    </DrawerContent>
  </Drawer>;
}
