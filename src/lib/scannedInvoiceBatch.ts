/**
 * Rules for splitting a scanned batch of Service Invoices: where the red invoice
 * number sits, how to isolate and parse it, and whether each page may be saved.
 * Pure and dependency-free so it runs in the browser and in Node tests.
 */

/** Area of the page (fractions of width/height) holding the red "No. ####". */
export const NUMBER_CROP = { x0: 0.77, y0: 0.07, x1: 0.95, y1: 0.16 } as const;

export function isRedInk(r: number, g: number, b: number): boolean {
  return r > 150 && g < 120 && b < 120;
}

/** RGBA in → RGBA out: red pixels black, everything else white. */
export function redInkMask(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const value = isRedInk(data[i], data[i + 1], data[i + 2]) ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = value;
    out[i + 3] = 255;
  }
  return out;
}

/** The longest 3–6 digit run in the OCR text, or null. */
export function pickInvoiceNumber(ocrText: string): string | null {
  const runs = ocrText.match(/\d{3,6}/g);
  if (!runs) return null;
  return runs.reduce((best, run) => (run.length > best.length ? run : best));
}

export type BatchRowStatus =
  | "match"
  | "replaces_scan"
  | "inactive"
  | "not_found"
  | "unread"
  | "duplicate"
  | "skipped";

export interface BatchInvoiceInfo {
  invoiceNo: string;
  companyName: string;
  total: number;
  status: string;
  hasScan: boolean;
}

const INACTIVE_STATUSES = new Set(["cancelled", "void"]);

export function rowStatus(
  invoiceNo: string,
  skipped: boolean,
  invoice: BatchInvoiceInfo | undefined,
  duplicate: boolean,
): BatchRowStatus {
  if (skipped) return "skipped";
  if (!invoiceNo.trim()) return "unread";
  if (duplicate) return "duplicate";
  if (!invoice) return "not_found";
  if (INACTIVE_STATUSES.has(invoice.status)) return "inactive";
  if (invoice.hasScan) return "replaces_scan";
  return "match";
}

export function blocksSave(status: BatchRowStatus): boolean {
  return status === "not_found" || status === "unread" || status === "duplicate";
}

/** Invoice numbers that appear on more than one page (blanks ignored). */
export function duplicateNumbers(numbers: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of numbers) {
    const number = raw.trim();
    if (!number) continue;
    if (seen.has(number)) duplicates.add(number);
    seen.add(number);
  }
  return duplicates;
}
