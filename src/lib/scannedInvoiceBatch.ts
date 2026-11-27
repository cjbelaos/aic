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

/** RGBA in → RGBA out: dark (printed black) pixels black, everything else white. */
export function darkInkMask(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] < DARK_INK_MAX && data[i + 1] < DARK_INK_MAX && data[i + 2] < DARK_INK_MAX ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = value;
    out[i + 3] = 255;
  }
  return out;
}

const DARK_INK_MAX = 110;

/** How a scanned document type is read: where its number is, what ink it's printed in, and how pages are named. */
export interface ScanProfile {
  crop: { x0: number; y0: number; x1: number; y1: number };
  ink: "red" | "dark";
  filePrefix: "SI" | "DR";
  /** Record statuses flagged "Not active" on the check screen. */
  inactiveStatuses: readonly string[];
}

export const SERVICE_INVOICE_PROFILE: ScanProfile = {
  crop: NUMBER_CROP,
  ink: "red",
  filePrefix: "SI",
  inactiveStatuses: ["draft", "cancelled", "void"],
};

/** The black "DR ####" under "DELIVERY RECEIPT", top right of the generated DR form. */
export const DELIVERY_RECEIPT_PROFILE: ScanProfile = {
  crop: { x0: 0.8, y0: 0.065, x1: 0.97, y1: 0.1 },
  ink: "dark",
  filePrefix: "DR",
  inactiveStatuses: ["draft", "pending_approval", "rejected", "cancelled", "deleted"],
};

export function inkMask(profile: ScanProfile, data: Uint8ClampedArray): Uint8ClampedArray {
  return profile.ink === "red" ? redInkMask(data) : darkInkMask(data);
}

/** The longest 3–6 digit run in the OCR text, or null. */
export function pickInvoiceNumber(ocrText: string): string | null {
  const runs = ocrText.match(/\d{3,6}/g);
  if (!runs) return null;
  return runs.reduce((best, run) => (run.length > best.length ? run : best));
}

/** Below this Tesseract confidence a read is flagged. Correct reads on the 2026-11-25 sample scored 75–96. */
export const MIN_CONFIDENCE = 80;

/** Most common digit count among the numbers read in a batch, or null when none were read. */
export function typicalDigitLength(numbers: (string | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const number of numbers) if (number) counts.set(number.length, (counts.get(number.length) ?? 0) + 1);
  let best: number | null = null;
  for (const [length, count] of counts) if (best === null || count > counts.get(best)!) best = length;
  return best;
}

/** A read worth a second look: low OCR confidence, or a digit count unlike the rest of the batch. */
export function isUncertainRead(detectedNo: string | null, confidence: number, typicalLength: number | null): boolean {
  if (!detectedNo) return false;
  return confidence < MIN_CONFIDENCE || (typicalLength !== null && detectedNo.length !== typicalLength);
}

export type BatchRowStatus =
  | "match"
  | "check_number"
  | "replaces_scan"
  | "inactive"
  | "not_found"
  | "unread"
  | "duplicate"
  | "skipped";

export interface BatchInvoiceInfo {
  invoiceNo: string;
  companyName: string;
  /** Second line of the System column, e.g. "₱18,000.00 · created" or "2026-11-10 · completed". */
  detail: string;
  status: string;
  hasScan: boolean;
}

export function rowStatus(
  invoiceNo: string,
  skipped: boolean,
  invoice: BatchInvoiceInfo | undefined,
  duplicate: boolean,
  uncertain = false,
  inactiveStatuses: readonly string[] = SERVICE_INVOICE_PROFILE.inactiveStatuses,
): BatchRowStatus {
  if (skipped) return "skipped";
  if (!invoiceNo.trim()) return "unread";
  if (duplicate) return "duplicate";
  if (!invoice) return "not_found";
  if (uncertain) return "check_number";
  if (inactiveStatuses.includes(invoice.status.trim().toLowerCase())) return "inactive";
  if (invoice.hasScan) return "replaces_scan";
  return "match";
}

export function blocksSave(status: BatchRowStatus): boolean {
  return status === "not_found" || status === "unread" || status === "duplicate";
}

/** A page for an invoice that already has a scan is left out of saving until Replace is ticked. */
export function isHeldBack(invoice: BatchInvoiceInfo | undefined, replace: boolean): boolean {
  return Boolean(invoice?.hasScan) && !replace;
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
