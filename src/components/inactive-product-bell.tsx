"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProductReplacementDialog, type ReplacementSource } from "@/components/product-replacement-dialog";
import productReplacementService, { isStoredUserAdmin } from "@/lib/services/product-replacement.service";
import type { ProductUsage } from "@/lib/productReplacement/types";

const noop = () => () => undefined;

/** Admin-only header bell: in-progress documents that still use an inactive product. */
export function InactiveProductBell() {
  const isAdmin = useSyncExternalStore(noop, isStoredUserAdmin, () => false);
  const [usages, setUsages] = useState<ProductUsage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [replaceSource, setReplaceSource] = useState<ReplacementSource | null>(null);

  const refresh = useCallback(() => productReplacementService.usages()
    .then((list) => { setUsages(list); setFailed(false); })
    .catch(() => setFailed(true)), []);

  useEffect(() => { if (isAdmin) void refresh(); }, [isAdmin, refresh]);

  const groups = useMemo(() => {
    const map = new Map<string, { productId: string; productCode: string; productName: string; usages: ProductUsage[] }>();
    for (const usage of usages ?? []) {
      const group = map.get(usage.productId) ?? { productId: usage.productId, productCode: usage.productCode, productName: usage.productName, usages: [] };
      group.usages.push(usage);
      map.set(usage.productId, group);
    }
    return [...map.values()];
  }, [usages]);

  const documentCount = useMemo(() => new Set((usages ?? []).map((u) => `${u.documentType}:${u.documentId}`)).size, [usages]);

  if (!isAdmin) return null;

  return (
    <>
      <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) void refresh(); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={documentCount ? `${documentCount} documents use inactive products` : "Inactive product notifications"}>
            <Bell className="h-4 w-4" />
            {documentCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                {documentCount > 99 ? "99+" : documentCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Documents using inactive products</p>
            <p className="text-xs text-muted-foreground">Replace the product or update each document. Items clear once fixed.</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
            {usages === null && !failed && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking documents…</p>}
            {failed && <p className="text-sm text-destructive">Could not load the list. Try again in a moment.</p>}
            {usages !== null && !groups.length && <p className="text-sm text-muted-foreground">No documents use inactive products.</p>}
            <ul className="space-y-4">
              {groups.map((group) => (
                <li key={group.productId}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium"><span className="font-mono">{group.productCode || group.productId}</span> {group.productName}</p>
                    <Button
                      size="sm" variant="outline" className="h-7 shrink-0"
                      onClick={() => { setOpen(false); setReplaceSource({ productId: group.productId, code: group.productCode, name: group.productName, inactive: true }); }}
                    >
                      Replace…
                    </Button>
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {group.usages.map((usage, index) => (
                      <li key={`${usage.documentType}-${usage.documentId}-${usage.lineLabel}-${index}`} className="flex flex-wrap gap-x-1">
                        <Link href={usage.href} className="underline-offset-2 hover:underline" onClick={() => setOpen(false)}>{usage.documentNo}</Link>
                        {usage.lineLabel && usage.documentType !== "customerPrice" ? <span className="text-muted-foreground">· {usage.lineLabel}</span> : null}
                        {usage.reason ? <span className="text-amber-700 dark:text-amber-400">— {usage.reason}</span> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
      <ProductReplacementDialog
        open={Boolean(replaceSource)}
        source={replaceSource}
        onClose={() => setReplaceSource(null)}
        onDone={() => { void refresh(); }}
      />
    </>
  );
}
