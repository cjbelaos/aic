"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import productService from "@/lib/services/product.service";
import productReplacementService, { type ReplacementPreview } from "@/lib/services/product-replacement.service";
import type { ProductUsage, UsageDocumentType } from "@/lib/productReplacement/types";
import type { Product } from "@/types/product";

const DOCUMENT_LABELS: Record<UsageDocumentType, string> = {
  contract: "Customer Contracts",
  salesOrder: "Sales Orders",
  purchaseRequest: "Purchase Requests",
  quotation: "Quotations",
  purchaseOrder: "Purchase Orders",
  customerPrice: "Customer Prices",
  supplierProduct: "Supplier Products",
};

export interface ReplacementSource {
  productId: string;
  code: string;
  name: string;
  /** Already inactive (backlog clean-up): replacing does not deactivate anything new. */
  inactive?: boolean;
}

interface Props {
  open: boolean;
  source: ReplacementSource | null;
  onClose: () => void;
  /** Called after a replacement finished (completed or partial). */
  onDone?: () => void;
  /** When given, offers deactivating without a replacement (the old Delete behaviour). */
  onDeactivateOnly?: () => Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: string } } }).response;
  return response?.data?.error || (error instanceof Error ? error.message : fallback);
}

function UsageGroups({ usages, showReason }: { usages: ProductUsage[]; showReason?: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<UsageDocumentType, ProductUsage[]>();
    for (const usage of usages) map.set(usage.documentType, [...(map.get(usage.documentType) ?? []), usage]);
    return [...map.entries()];
  }, [usages]);
  return (
    <ul className="space-y-1.5 text-sm">
      {groups.map(([type, list]) => (
        <li key={type}>
          <span className="font-medium">{DOCUMENT_LABELS[type]}</span>
          <ul className="ml-4 list-disc text-muted-foreground">
            {list.map((usage, index) => (
              <li key={`${usage.documentId}-${usage.lineLabel}-${index}`}>
                {usage.documentNo}{usage.lineLabel && type !== "customerPrice" ? ` · ${usage.lineLabel}` : ""}
                {showReason && usage.reason ? <span className="text-amber-700 dark:text-amber-400"> — {usage.reason}</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ProductReplacementDialog(props: Props) {
  // Mounting the body only while open resets its state for every product.
  return (
    <Dialog open={props.open} onOpenChange={(value) => { if (!value) props.onClose(); }}>
      {props.open && props.source ? <ReplacementBody key={props.source.productId} {...props} source={props.source} /> : null}
    </Dialog>
  );
}

function ReplacementBody({ source, onClose, onDone, onDeactivateOnly }: Props & { source: ReplacementSource }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [targetId, setTargetId] = useState("");
  const [preview, setPreview] = useState<ReplacementPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    productService.getAll().then(setProducts).catch(() => setProducts([]));
  }, []);

  const latestTarget = useRef("");
  const selectTarget = (id: string) => {
    setTargetId(id); setPreview(null); setError("");
    latestTarget.current = id;
    if (!id) return;
    setLoadingPreview(true);
    productReplacementService.preview(source.productId, id)
      .then((result) => { if (latestTarget.current === id) setPreview(result); })
      .catch((err) => { if (latestTarget.current === id) setError(errorMessage(err, "Failed to load the preview.")); })
      .finally(() => { if (latestTarget.current === id) setLoadingPreview(false); });
  };

  const options = useMemo(() => products
    .filter((p) => p.status !== "inactive" && (p.productId ?? p.id) !== source.productId)
    .map((p) => ({ value: p.productId ?? p.id, label: `${p.name} (${p.code})` })), [products, source.productId]);

  const close = () => { if (!working) onClose(); };

  const replace = async () => {
    if (!targetId) return;
    setWorking(true); setError("");
    try {
      const result = await productReplacementService.replace(source.productId, targetId);
      if (result.status === "completed") {
        const listed = result.skipped.length ? ` ${result.skipped.length} left for review.` : "";
        toast.success(`Replaced ${source.code} on ${result.applied} line(s).${listed}`);
      } else {
        toast.warning(`Replacement only partly finished (${result.applied} applied): ${result.error ?? "see the bell for what is left"}`, { duration: 15000 });
      }
      onDone?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Failed to replace the product."));
    } finally {
      setWorking(false);
    }
  };

  const deactivateOnly = async () => {
    if (!onDeactivateOnly) return;
    setWorking(true);
    try { await onDeactivateOnly(); onClose(); } finally { setWorking(false); }
  };

  const nothingToDo = preview && !preview.changes.length && !preview.skipped.length && !preview.conflicts.length;

  return (
      <DialogContent onInteractOutside={(event) => { if (working) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source.inactive ? "Replace inactive product" : "Delete product"}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{source.code}</span> {source.name}.{" "}
            {source.inactive
              ? "Pick the product that replaces it on in-progress documents."
              : "If this is a duplicate, pick the product it duplicates so in-progress documents switch to it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Replaced by</Label>
          <SearchableSelect value={targetId} onValueChange={selectTarget} options={options} placeholder="Select the product to keep" disabled={working} />
        </div>

        {loadingPreview && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking documents…</p>}

        {preview && !loadingPreview && (
          <div className="space-y-4 rounded-md border p-3">
            <p className="text-sm">
              <span className="font-mono">{preview.from.productCode}</span> → <span className="font-mono">{preview.to.productCode}</span> {preview.to.productName}
            </p>
            {nothingToDo && <p className="text-sm text-muted-foreground">No in-progress documents use this product.</p>}
            {preview.changes.length > 0 && (
              <section><h3 className="mb-1 text-sm font-semibold">Will update ({preview.changes.length})</h3><UsageGroups usages={preview.changes} /></section>
            )}
            {preview.skipped.length > 0 && (
              <section><h3 className="mb-1 text-sm font-semibold">Skipped — needs your review ({preview.skipped.length})</h3><UsageGroups usages={preview.skipped} showReason /></section>
            )}
            {preview.conflicts.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold">Price conflicts ({preview.conflicts.length})</h3>
                <p className="mb-1 text-xs text-muted-foreground">These already have an entry on {preview.to.productCode}. That entry is kept and the duplicate&apos;s is deactivated.</p>
                <UsageGroups usages={preview.conflicts} />
              </section>
            )}
            <p className="text-xs text-muted-foreground">Prices, quantities and descriptions on swapped lines stay as they are. Delivered, invoiced and sent documents are not changed.</p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={working}>Cancel</Button>
          {onDeactivateOnly && !source.inactive && (
            <Button variant="outline" className="text-destructive" onClick={deactivateOnly} disabled={working || Boolean(targetId)}>
              Delete without replacing
            </Button>
          )}
          <Button onClick={replace} disabled={working || !preview || loadingPreview}>
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {source.inactive ? "Replace" : "Replace & delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}
