/**
 * File names for scanned copies in Drive: `{DR|SR|SI}-{MM}-{DD}-{YYYY}-{No.}-{Customer}.{ext}`.
 * Dependency-free so the rename script can load it too.
 */

export type ScannedCopyPrefix = "DR" | "SR" | "SI";

/** Reads a stored sheet date (`YYYY-MM-DD…` or `M/D/YYYY`) into zero-padded parts. */
export function scanDateParts(stored: string): { mm: string; dd: string; yyyy: string } | null {
  const value = String(stored ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const [yyyy, month, day] = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : [];
  if (!yyyy) return null;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { mm: String(m).padStart(2, "0"), dd: String(d).padStart(2, "0"), yyyy };
}

/** Keeps the text as written; only characters that break file names become spaces. */
export function sanitizeFileNamePart(value: string): string {
  return String(value ?? "").replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

const EXTENSIONS: Record<string, string> = { pdf: ".pdf", jpg: ".jpg", jpeg: ".jpg", png: ".png", webp: ".webp" };
const MIME_EXTENSIONS: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export function scanExtension(fileName: string, mimeType?: string): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(String(fileName ?? ""))?.[1]?.toLowerCase();
  return (fromName && EXTENSIONS[fromName]) || (mimeType && MIME_EXTENSIONS[mimeType]) || ".pdf";
}

/** Today's date in Manila (UTC+8, no DST) as `YYYY-MM-DD`. */
export function manilaIsoDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Builds the name; a record without a usable date is named with `today` (Manila) and flagged. */
export function scannedCopyFileName(input: {
  prefix: ScannedCopyPrefix;
  date: string;
  number: string;
  customer: string;
  extension: string;
  today?: string;
}): { name: string; usedToday: boolean } {
  const parts = scanDateParts(input.date);
  const date = parts ?? scanDateParts(input.today ?? manilaIsoDate())!;
  const customer = sanitizeFileNamePart(input.customer);
  const base = [input.prefix, date.mm, date.dd, date.yyyy, sanitizeFileNamePart(input.number), customer].filter(Boolean).join("-");
  return { name: `${base}${input.extension}`, usedToday: !parts };
}

/** `X.pdf` → `X (replaced 2026-11-28).pdf`. */
export function replacedFileName(name: string, isoDate: string): string {
  const match = /^(.*?)(\.[a-z0-9]{1,5})?$/i.exec(name)!;
  return `${match[1]} (replaced ${isoDate})${match[2] ?? ""}`;
}

export function isReplacedFileName(name: string): boolean {
  return /\(replaced \d{4}-\d{2}-\d{2}\)(\.[a-z0-9]{1,5})?$/i.test(name);
}

export function driveFileIdFromLink(link: string): string | null {
  const value = String(link ?? "");
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(value)) return null;
  return /\/d\/([a-zA-Z0-9_-]+)/.exec(value)?.[1] ?? /[?&]id=([a-zA-Z0-9_-]+)/.exec(value)?.[1] ?? null;
}
