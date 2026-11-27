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
  isHeldBack,
  rowStatus,
  type BatchInvoiceInfo,
  type BatchRowStatus,
} from "@/lib/scannedInvoiceBatch";
import type { PageExtractor } from "@/lib/scannedInvoicePageExtractor";
import type { ServiceInvoiceSummary } from "@/types/serviceInvoice";

type SaveState = "idle" | "saving" | "saved" | "failed";

interface LoadedFile {
  extractPage: PageExtractor;
  dispose: () => void;
}

interface BatchRow {
  fileId: number;
  fileName: string;
  pageIndex: number;
  thumbnailUrl: string;
  previewUrl: string;
  numberCropUrl: string;
  invoiceNo: string;
  /** OCR was unsure; cleared once someone edits the number. */
  uncertain: boolean;
  skipped: boolean;
  /** Invoice already has a scan: saved only when this is ticked. */
  replace: boolean;
  saveState: SaveState;
  error?: string;
}

const STATUS_LABELS: Record<BatchRowStatus, string> = {
  match: "Match",
  check_number: "Check number",
  replaces_scan: "Replaces scan",
  inactive: "Not active",
  not_found: "Not found",
  unread: "Unread",
  duplicate: "Duplicate",
  skipped: "Skipped",
};

const STATUS_CLASSES: Record<BatchRowStatus, string> = {
  match: "border-green-600 text-green-700 dark:text-green-400",
  check_number: "border-amber-500 text-amber-700 dark:text-amber-400",
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
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [progress, setProgress] = useState<{ file: number; files: number; done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const filesRef = useRef(new Map<number, LoadedFile>());
  const nextFileIdRef = useRef(1);
  const mountedRef = useRef(true);
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

  // Saved rows stay counted for duplicates: the page is still part of this batch.
  const heldBack = rows.map(
    (row) => !row.skipped && row.saveState !== "saved" && isHeldBack(invoiceInfo.get(row.invoiceNo.trim()), row.replace),
  );
  const duplicates = duplicateNumbers(
    rows.filter((row, index) => !row.skipped && !heldBack[index]).map((row) => row.invoiceNo),
  );

  const statuses = rows.map((row) => {
    const number = row.invoiceNo.trim();
    return rowStatus(number, row.skipped, invoiceInfo.get(number), duplicates.has(number), row.uncertain);
  });
  const pendingIndexes = rows
    .map((row, index) => index)
    .filter((index) => !rows[index].skipped && !heldBack[index] && rows[index].saveState !== "saved");
  const blocked = pendingIndexes.some((index) => blocksSave(statuses[index]));
  const heldBackCount = heldBack.filter(Boolean).length;
  const reading = progress !== null;
  const progressText = !progress
    ? ""
    : !progress.total
      ? "Loading PDF reader…"
      : `${progress.files > 1 ? `Reading file ${progress.file} of ${progress.files} · page` : "Reading page"} ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`;

  const disposeFiles = () => {
    for (const file of filesRef.current.values()) file.dispose();
    filesRef.current.clear();
  };

  const reset = () => {
    disposeFiles();
    setRows([]);
    setProgress(null);
  };

  useEffect(() => {
    mountedRef.current = true;
    const files = filesRef.current;
    return () => {
      mountedRef.current = false;
      for (const file of files.values()) file.dispose();
      files.clear();
    };
  }, []);

  // Closing the tab mid-save would leave some pages uploaded and some not.
  useEffect(() => {
    if (!saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const handleOpenChange = (next: boolean) => {
    if (saving || reading) return; // keep the dialog open while work is running
    if (!next) reset();
    onOpenChange(next);
  };

  /** Reads each PDF in turn and appends its pages; rows already on screen are kept as they are. */
  const handleFiles = async (selected: File[]) => {
    if (!selected.length) return;
    const pdfs = selected.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    const ignored = selected.length - pdfs.length;
    if (ignored) toast.error(`${ignored} file${ignored === 1 ? " is" : "s are"} not a PDF and ${ignored === 1 ? "was" : "were"} left out.`);
    if (!pdfs.length) return;
    setProgress({ file: 1, files: pdfs.length, done: 0, total: 0 });
    let analyze: typeof import("@/lib/scannedInvoiceBatchPdf").analyzeScannedPdf;
    try {
      analyze = (await import("@/lib/scannedInvoiceBatchPdf")).analyzeScannedPdf;
    } catch (error) {
      console.error("Could not load the PDF reader:", error);
      if (!mountedRef.current) return;
      toast.error(`Could not load the PDF reader: ${errorMessage(error)}`);
      setProgress(null);
      return;
    }
    for (const [i, file] of pdfs.entries()) {
      if (!mountedRef.current) return;
      setProgress({ file: i + 1, files: pdfs.length, done: 0, total: 0 });
      let result: Awaited<ReturnType<typeof analyze>>;
      try {
        result = await analyze(file, (done, total) => {
          if (mountedRef.current) setProgress({ file: i + 1, files: pdfs.length, done, total });
        });
      } catch (error) {
        console.error(`Could not read ${file.name}:`, error);
        if (mountedRef.current) toast.error(`Could not read ${file.name}: ${errorMessage(error)}`);
        continue; // the other files still load
      }
      if (!mountedRef.current) {
        result.dispose(); // the page was left while reading
        return;
      }
      const fileId = nextFileIdRef.current++;
      filesRef.current.set(fileId, { extractPage: result.extractPage, dispose: result.dispose });
      const newRows: BatchRow[] = result.pages.map((page) => ({
        fileId,
        fileName: file.name,
        pageIndex: page.pageIndex,
        thumbnailUrl: page.thumbnailUrl,
        previewUrl: page.previewUrl,
        numberCropUrl: page.numberCropUrl,
        invoiceNo: page.detectedNo ?? "",
        uncertain: page.uncertain,
        skipped: false,
        replace: false,
        saveState: "idle",
      }));
      setRows((current) => [...current, ...newRows]);
    }
    if (mountedRef.current) setProgress(null);
  };

  const updateRow = (index: number, patch: Partial<BatchRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveRow = async (index: number): Promise<boolean> => {
    const row = rows[index];
    const extractPage = filesRef.current.get(row.fileId)?.extractPage;
    if (!extractPage) return false;
    const invoiceNo = row.invoiceNo.trim();
    updateRow(index, { saveState: "saving", error: undefined });
    try {
      await upload(invoiceNo, await extractPage(row.pageIndex, invoiceNo));
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
            Choose one or more PDFs of scanned Service Invoices. Each page is matched to its invoice number. Check every row, then save.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12">
            {reading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm text-muted-foreground">{progressText}</p>
              </>
            ) : (
              <>
                <FileStack className="h-8 w-8 text-muted-foreground" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Choose scanned PDFs
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="p-2">File · Page</th>
                  <th className="p-2">Scan</th>
                  <th className="p-2">Invoice No.</th>
                  <th className="p-2">System</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Replace?</th>
                  <th className="p-2">Skip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const status = statuses[index];
                  const info = invoiceInfo.get(row.invoiceNo.trim());
                  const locked = row.saveState === "saved" || row.saveState === "saving" || saving;
                  return (
                    <tr key={`${row.fileId}-${row.pageIndex}`} className="border-b align-middle last:border-0">
                      <td className="p-2">
                        <div className="max-w-44 truncate" title={row.fileName}>{row.fileName}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">p{row.pageIndex + 1}</div>
                      </td>
                      <td className="p-2">
                        <a href={row.previewUrl} target="_blank" rel="noopener noreferrer" title="Open full page">
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
                            onChange={(event) => updateRow(index, { invoiceNo: event.target.value.replace(/\D/g, ""), uncertain: false })}
                            disabled={locked}
                            inputMode="numeric"
                            aria-label={`Invoice number for page ${row.pageIndex + 1} of ${row.fileName}`}
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
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="destructive" title={row.error}>Failed</Badge>
                            {/* After the number is edited, show why Retry may now be unavailable. */}
                            {(blocksSave(status) || row.skipped) && (
                              <Badge variant="outline" className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={saving || row.skipped || heldBack[index] || blocksSave(status)} onClick={() => void saveMany([index])}>
                              <RotateCcw className="mr-1 h-3 w-3" />Retry
                            </Button>
                          </div>
                        ) : heldBack[index] ? (
                          <Badge variant="outline" className="text-muted-foreground">Already scanned</Badge>
                        ) : (
                          <Badge variant="outline" className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
                        )}
                        {row.saveState === "failed" && row.error && <div className="mt-1 max-w-48 text-xs text-red-600">{row.error}</div>}
                      </td>
                      <td className="p-2">
                        {info?.hasScan && row.saveState !== "saved" && (
                          <Checkbox
                            checked={row.replace}
                            disabled={locked || row.skipped}
                            onCheckedChange={(checked) => updateRow(index, { replace: checked === true })}
                            aria-label={`Replace the existing scan with page ${row.pageIndex + 1} of ${row.fileName}`}
                          />
                        )}
                      </td>
                      <td className="p-2">
                        <Checkbox
                          checked={row.skipped}
                          disabled={locked}
                          onCheckedChange={(checked) => updateRow(index, { skipped: checked === true })}
                          aria-label={`Skip page ${row.pageIndex + 1} of ${row.fileName}`}
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
            {rows.length > 0 &&
              (reading
                ? progressText
                : blocked
                  ? "Fix or skip the rows marked in red to save."
                  : heldBackCount
                    ? `${heldBackCount} already scanned. Tick Replace to re-upload.`
                    : "Rows with Replace ticked overwrite the existing scanned copy.")}
          </p>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = "";
                void handleFiles(selected);
              }}
            />
            {rows.length > 0 && (
              <Button variant="outline" disabled={saving || reading} onClick={() => fileInputRef.current?.click()}>
                {reading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add more PDFs
              </Button>
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
