// Service Reports — pure domain logic: status transitions, report-number
// formatting, signature meaningfulness (strict client-side + server-side gate)
// and consent text. Relative imports only so native-TypeScript tests can load
// this module directly.

import { inflateSync } from "node:zlib";
import type { ServiceReportStatus } from "../../types/serviceReport.ts";
import { SERVICE_REPORT_NUMBER_PREFIX } from "./constants.ts";

// ── Report numbers ─────────────────────────────────────────────

export function formatServiceReportNo(year: string, number: number): string {
  return `${SERVICE_REPORT_NUMBER_PREFIX}-${year}-${String(number).padStart(4, "0")}`;
}

export interface NextReportNumberInput {
  businessYear: string;
  lastNumber: number;
}

export function nextReportNumber(input: NextReportNumberInput): string {
  return formatServiceReportNo(input.businessYear, input.lastNumber + 1);
}

export function isValidServiceReportNo(value: string): boolean {
  const match = new RegExp(`^${SERVICE_REPORT_NUMBER_PREFIX}-(\\d{4})-(\\d{4})$`).exec(value);
  if (!match) return false;
  return Number.parseInt(match[2], 10) > 0;
}

// ── Status transitions ──────────────────────────────────────────

const TRANSITIONS: Record<ServiceReportStatus, readonly ServiceReportStatus[]> = {
  DRAFT: ["READY_FOR_ACKNOWLEDGMENT", "VOID"],
  READY_FOR_ACKNOWLEDGMENT: ["ACKNOWLEDGED", "VOID"],
  ACKNOWLEDGED: ["PDF_FAILED", "VOID"],
  PDF_FAILED: ["ACKNOWLEDGED", "VOID"],
  VOID: [],
};

export function canTransition(from: ServiceReportStatus, to: ServiceReportStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isLockedStatus(status: ServiceReportStatus): boolean {
  return (
    status === "ACKNOWLEDGED" ||
    status === "PDF_FAILED" ||
    status === "VOID"
  );
}

export function isActiveStatus(status: ServiceReportStatus): boolean {
  return status === "DRAFT" || status === "READY_FOR_ACKNOWLEDGMENT";
}

export const SERVICE_REPORT_STATUS_LABELS: Record<ServiceReportStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_ACKNOWLEDGMENT: "Ready for acknowledgment",
  ACKNOWLEDGED: "Acknowledged",
  PDF_FAILED: "PDF failed",
  VOID: "Void",
};

// ── Consent ─────────────────────────────────────────────────────

export function consentValue(confirmed: boolean): string {
  return confirmed ? "YES" : "NO";
}

export function parseConsentValue(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "yes" || v === "true" || v === "on" || v === "1";
}
// ── PNG signature analysis (server-side gate) ───────────────────
// Google Sheets/Drive never receive signature bytes; the PNG is decoded here
// only to enforce the "no empty / no accidental short marks" rule server side.

export interface SignatureAnalysis {
  ok: boolean;
  width: number;
  height: number;
  inkedPixels: number;
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
  reason?: string;
}

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Minimum dark, fully opaque pixels for a meaningful signature. */
export const MIN_INKED_PIXELS = 120;
/** A signature must span at least this fraction of the canvas diagonal. */
export const MIN_DIAGONAL_FRACTION = 0.1;
/** Absolute minimum stroke span (px) so a dot cluster is never accepted. */
export const MIN_ABS_DIAGONAL_PX = 48;

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

function parsePngHeader(buffer: Buffer): PngHeader | null {
  if (buffer.length < 8 + 25) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = Buffer.from(buffer.subarray(offset + 4, offset + 8)).toString("latin1");
    offset += 8;
    if (type === "IHDR") {
      if (length < 13 || offset + 13 > buffer.length) return null;
      return {
        width: buffer.readUInt32BE(offset),
        height: buffer.readUInt32BE(offset + 4),
        bitDepth: buffer.readUInt8(offset + 8),
        colorType: buffer.readUInt8(offset + 9),
        interlace: buffer.readUInt8(offset + 12),
      };
    }
    offset += length + 4; // data + CRC
  }
  return null;
}

/** Decodes a PNG as produced by <canvas>.toBlob("image/png") (RGBA/RGB, 8-bit). */
export function analyseSignaturePng(buffer: Buffer): SignatureAnalysis {
  const header = parsePngHeader(buffer);
  if (!header) return { ok: false, width: 0, height: 0, inkedPixels: 0, reason: "Not a valid PNG file." };
  if (header.bitDepth !== 8 || (header.colorType !== 6 && header.colorType !== 2) || header.interlace !== 0) {
    return { ok: false, width: header.width, height: header.height, inkedPixels: 0, reason: "Unsupported PNG format; expected 8-bit RGBA/RGB, non-interlaced." };
  }
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;

  // Concatenate IDAT payloads and inflate once.
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = Buffer.from(buffer.subarray(offset + 4, offset + 8)).toString("latin1");
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length + 4;
  }
  if (idat.length === 0) return { ok: false, width: header.width, height: header.height, inkedPixels: 0, reason: "PNG has no image data." };
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return { ok: false, width: header.width, height: header.height, inkedPixels: 0, reason: "PNG image data could not be decoded." };
  }

  const rowLength = header.width * bytesPerPixel;
  const expected = (rowLength + 1) * header.height;
  if (raw.length < expected) return { ok: false, width: header.width, height: header.height, inkedPixels: 0, reason: "PNG payload is truncated." };

  const previous = Buffer.alloc(rowLength);
  let inkedPixels = 0;
  let minX = header.width, minY = header.height, maxX = -1, maxY = -1;

  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (rowLength + 1)];
    const rowStart = y * (rowLength + 1) + 1;
    const current = Buffer.alloc(rowLength);
    for (let x = 0; x < rowLength; x++) {
      const rawByte = raw[rowStart + x];
      let value = rawByte;
      if (filter === 1) {
        value = (rawByte + (x >= bytesPerPixel ? current[x - bytesPerPixel] : 0)) & 0xff;
      } else if (filter === 2) {
        value = (rawByte + previous[x]) & 0xff;
      } else if (filter === 3) {
        const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
        const above = previous[x];
        value = (rawByte + ((left + above) >> 1)) & 0xff;
      } else if (filter === 4) {
        const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
        const above = previous[x];
        const upperLeft = (x >= bytesPerPixel) ? previous[x - bytesPerPixel] : 0;
        value = (rawByte + paethPredictor(left, above, upperLeft)) & 0xff;
      }
      current[x] = value;
    }
    current.copy(previous);

    for (let x = 0; x < header.width; x++) {
      const px = x * bytesPerPixel;
      const r = current[px];
      const g = current[px + 1];
      const b = current[px + 2];
      const alpha = bytesPerPixel === 4 ? current[px + 3] : 255;
      const isInk = alpha >= 128 && (r + g + b) / 3 < 110;
      if (isInk) {
        inkedPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkedPixels === 0) {
    return { ok: true, width: header.width, height: header.height, inkedPixels: 0, reason: "Empty signature (no ink detected)." };
  }
  return {
    ok: true,
    width: header.width,
    height: header.height,
    inkedPixels,
    bbox: { minX, minY, maxX, maxY },
  };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
export interface SignatureVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Rejects an empty canvas, a canvas that only contains a few accidental dots,
 * or a non-decodable image. Used by both the client pad (pre-upload) and the
 * acknowledgment route (authoritative).
 */
export function verifyMeaningfulSignature(analysis: SignatureAnalysis): SignatureVerdict {
  if (!analysis.ok) return { ok: false, reason: analysis.reason ?? "Invalid signature image." };
  if (analysis.inkedPixels === 0) return { ok: false, reason: "Signature is empty. Please draw your signature." };
  if (analysis.inkedPixels < MIN_INKED_PIXELS) {
    return { ok: false, reason: "Signature is too short. Please draw your full signature." };
  }
  if (!analysis.bbox) return { ok: false, reason: "Signature could not be measured." };
  const strokeSpan = Math.hypot(
    analysis.bbox.maxX - analysis.bbox.minX,
    analysis.bbox.maxY - analysis.bbox.minY,
  );
  const canvasDiagonal = Math.hypot(analysis.width, analysis.height);
  const minimum = Math.max(canvasDiagonal * MIN_DIAGONAL_FRACTION, MIN_ABS_DIAGONAL_PX);
  if (strokeSpan < minimum) {
    return { ok: false, reason: "Signature is too short. Please draw your full signature." };
  }
  return { ok: true, reason: "" };
}