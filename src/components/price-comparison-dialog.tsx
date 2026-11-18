"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { BusinessDocumentPrintFrame, type BusinessDocumentPrintHandle } from "@/components/business-document-print-frame";
import { PriceComparisonPrintDocument } from "@/components/price-comparison-print-document";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoLoader } from "@/components/ui/logo-loader";
import { downloadPriceComparisonExcel } from "@/lib/priceComparisonExport";
import { buildPriceComparisonRows } from "@/lib/priceComparisonReport";
import supplierProductService from "@/lib/services/supplier-product.service";
import type { Company } from "@/types/company";
import type { Product } from "@/types/product";
import type { SupplierProduct } from "@/types/supplier-product";

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export function PriceComparisonDialog({ open, onOpenChange, products, companies }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  companies: Company[];
}) {
  const printFrame = useRef<BusinessDocumentPrintHandle>(null);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[] | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSupplierProducts(null);
      supplierProductService.getAll({ status: "active" })
        .then((rows) => { if (!cancelled) setSupplierProducts(rows); })
        .catch(() => {
          if (cancelled) return;
          toast.error("Failed to load supplier prices.");
          onOpenChange(false);
        });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, onOpenChange]);

  const rows = useMemo(
    () => (supplierProducts ? buildPriceComparisonRows(products, supplierProducts, companies) : []),
    [products, supplierProducts, companies],
  );
  const loading = supplierProducts === null;
  const empty = !loading && rows.length === 0;

  const handlePrint = async () => {
    try {
      await printFrame.current?.print();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to print the price comparison."));
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPriceComparisonExcel(rows);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to download the price comparison."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] flex-col sm:max-w-[80vw]">
        <DialogHeader><DialogTitle>Price Comparison</DialogTitle></DialogHeader>
        <div className="min-h-48 flex-1 overflow-hidden rounded-md border bg-muted/20">
          {loading ? (
            <div className="flex h-full items-center justify-center"><LogoLoader label="Loading supplier prices…" size={48} /></div>
          ) : empty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No active products to show.</div>
          ) : (
            <BusinessDocumentPrintFrame ref={printFrame} title="Product Price Comparison">
              <PriceComparisonPrintDocument rows={rows} />
            </BusinessDocumentPrintFrame>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={loading || empty || downloading} onClick={() => void handleDownload()}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download Excel
          </Button>
          <Button disabled={loading || empty} onClick={() => void handlePrint()}>
            <Printer className="mr-2 h-4 w-4" />Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
