"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileStack, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { invoiceTotals } from "@/lib/serviceInvoiceDiscounts";
import {
  blocksSave,
  duplicateNumbers,
  rowStatus,
  type BatchInvoiceInfo,
  type BatchRowStatus,
} from "@/lib/scannedInvoiceBatch";
import type { ServiceInvoiceSummary } from "@/types/serviceInvoice";

type SaveState = "idle" | "saving" | "saved" | "failed";

interface BatchRow {
  pageIndex: number;
  thumbnailUrl: string;
  numberCropUrl: string;
  invoiceNo: string;
  skipped: boolean;
  saveState: SaveState;
  error?: string;
}

const STATUS_LABELS: Record<BatchRowStatus, string> = {
  match: "Match",
  replaces_scan: "Replaces scan",
  inactive: "Cancelled/Void",
  not_found: "Not found",
  unread: "Unread",
  duplicate: "Duplicate",
  skipped: "Skipped",
};

const STATUS_CLASSES: Record<BatchRowStatus, string> = {
  match: "border-green-600 text-green-700 dark:text-green-400",
  replaces_scan: "border-amber-500 text-amber-700 dark:text-amber-400",
  inactive: "border-amber-500 text-amber-700 dark:text-amber-400",
  not_found: "border-red-600 text-red-700 dark:text-red-400",
  unread: "border-red-600 text-red-700 dark:text-red-400",
  duplicate: "border-red-600 text-red-700 dark:text-red-400",
  skipped: "text-muted-foreground",
};

function peso(value: number) {
  return value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function errorMessage(error: unknown) {
  const err = error as { response?: { data?: { error?: string } }; message?: string };
  return err?.response?.data?.error || err?.message || "Upload failed.";
}

export function BulkScanUploadDialog({
  open,
  onOpenChange,
  invoices,
  upload,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: ServiceInvoiceSummary[];
  upload: (invoiceNo: string, file: File) => Promise<{ fileLink: string }>;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const disposeRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invoiceInfo = useMemo(() => {
    const map = new Map<string, BatchInvoiceInfo>();
    for (const invoice of invoices) {
      map.set(invoice.invoiceNo, {
        invoiceNo: invoice.invoiceNo,
        companyName: invoice.companyName,
        total: invoiceTotals(invoice).grandTotal,
        status: invoice.status,
        hasScan: invoice.scannedStatus === "scanned",
      });
    }
    return map;
  }, [invoices]);

  const duplicates = useMemo(
    () => duplicateNumbers(rows.filter((row) => !row.skipped).map((row) => row.invoiceNo)),
    [rows],
  );

  const statuses = rows.map((row) => {
    const number = row.invoiceNo.trim();
    return rowStatus(number, row.skipped, invoiceInfo.get(number), duplicates.has(number));
  });
  const pendingIndexes = rows
    .map((row, index) => index)
    .filter((index) => !rows[index].skipped && rows[index].saveState !== "saved");
  const blocked = pendingIndexes.some((index) => blocksSave(statuses[index]));
  const reading = progress !== null && rows.length === 0;

  const reset = () => {
    disposeRef.current?.();
    disposeRef.current = null;
    setFile(null);
    setRows([]);
    setProgress(null);
  };

  useEffect(() => () => disposeRef.current?.(), []);

  const handleOpenChange = (next: boolean) => {
    if (saving || reading) return; // keep the dialog open while work is running
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (selected: File | undefined) => {
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      toast.error("Choose a PDF file.");
      return;
    }
    reset();
    setFile(selected);
    setProgress({ done: 0, total: 0 });
    try {
      const { analyzeScannedPdf } = await import("@/lib/scannedInvoiceBatchPdf");
      const result = await analyzeScannedPdf(selected, (done, total) => setProgress({ done, total }));
      disposeRef.current = result.dispose;
      setRows(
        result.pages.map((page) => ({
          pageIndex: page.pageIndex,
          thumbnailUrl: page.thumbnailUrl,
          numberCropUrl: page.numberCropUrl,
          invoiceNo: page.detectedNo ?? "",
          skipped: false,
          saveState: "idle",
        })),
      );
    } catch (error) {
      console.error("Could not read scanned batch:", error);
      toast.error(`Could not read the PDF: ${errorMessage(error)}`);
      reset();
    }
  };

  const updateRow = (index: number, patch: Partial<BatchRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveRow = async (index: number): Promise<boolean> => {
    if (!file) return false;
    const row = rows[index];
    const invoiceNo = row.invoiceNo.trim();
    updateRow(index, { saveState: "saving", error: undefined });
    try {
      const { extractPagePdf } = await import("@/lib/scannedInvoiceBatchPdf");
      await upload(invoiceNo, await extractPagePdf(file, row.pageIndex, invoiceNo));
      updateRow(index, { saveState: "saved" });
      return true;
    } catch (error) {
      updateRow(index, { saveState: "failed", error: errorMessage(error) });
      return false;
    }
  };

  const saveMany = async (indexes: number[]) => {
    setSaving(true);
    let saved = 0;
    for (const index of indexes) if (await saveRow(index)) saved++;
    setSaving(false);
    const failed = indexes.length - saved;
    if (failed) toast.error(`${saved} scan${saved === 1 ? "" : "s"} saved, ${failed} failed.`);
    else toast.success(`${saved} scan${saved === 1 ? "" : "s"} saved.`);
    if (saved) onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col" showCloseButton={!saving && !reading}>
        <DialogHeader>
          <DialogTitle>Bulk upload scans</DialogTitle>
          <DialogDescription>
            Choose one PDF of scanned Service Invoices. Each page is matched to its invoice number. Check every row, then save.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12">
            {reading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {progress.total ? `Reading page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Loading PDF reader…"}
                </p>
              </>
            ) : (
              <>
                <FileStack className="h-8 w-8 text-muted-foreground" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Choose scanned PDF
                </Button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = "";
                void handleFile(selected);
              }}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="p-2">Page</th>
                  <th className="p-2">Scan</th>
                  <th className="p-2">Invoice No.</th>
                  <th className="p-2">System</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Skip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const status = statuses[index];
                  const info = invoiceInfo.get(row.invoiceNo.trim());
                  const locked = row.saveState === "saved" || row.saveState === "saving" || saving;
                  return (
                    <tr key={row.pageIndex} className="border-b align-middle last:border-0">
                      <td className="p-2 tabular-nums">{row.pageIndex + 1}</td>
                      <td className="p-2">
                        <a href={row.thumbnailUrl} target="_blank" rel="noopener noreferrer" title="Open full page">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                          <img src={row.thumbnailUrl} alt={`Page ${row.pageIndex + 1}`} className="h-20 w-auto rounded border" />
                        </a>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                          <img src={row.numberCropUrl} alt="Invoice number on the scan" className="h-10 w-auto rounded border bg-white" />
                          <Input
                            value={row.invoiceNo}
                            onChange={(event) => updateRow(index, { invoiceNo: event.target.value.replace(/\D/g, "") })}
                            disabled={locked}
                            inputMode="numeric"
                            aria-label={`Invoice number for page ${row.pageIndex + 1}`}
                            className="h-8 w-24 tabular-nums"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        {info ? (
                          <div>
                            <div className="font-medium">{info.companyName}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {peso(info.total)} · {info.status}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {row.saveState === "saved" ? (
                          <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">Saved</Badge>
                        ) : row.saveState === "saving" ? (
                          <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Saving</Badge>
                        ) : row.saveState === "failed" ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="destructive" title={row.error}>Failed</Badge>
                            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={saving || blocksSave(status)} onClick={() => void saveMany([index])}>
                              <RotateCcw className="mr-1 h-3 w-3" />Retry
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
                        )}
                        {row.saveState === "failed" && row.error && <div className="mt-1 max-w-48 text-xs text-red-600">{row.error}</div>}
                      </td>
                      <td className="p-2">
                        <Checkbox
                          checked={row.skipped}
                          disabled={locked}
                          onCheckedChange={(checked) => updateRow(index, { skipped: checked === true })}
                          aria-label={`Skip page ${row.pageIndex + 1}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {rows.length > 0 && (blocked ? "Fix or skip the rows marked in red to save." : "A new scan replaces any existing scanned copy.")}
          </p>
          <div className="flex gap-2">
            {rows.length > 0 && !saving && (
              <Button variant="outline" onClick={reset}>Choose another PDF</Button>
            )}
            <Button
              onClick={() => void saveMany(pendingIndexes)}
              disabled={saving || reading || blocked || pendingIndexes.length === 0}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save all{pendingIndexes.length ? ` (${pendingIndexes.length})` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
