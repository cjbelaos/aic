// Immutable identity and business-date helpers for the Service Reports module.
// Pure module — safe for native-TypeScript tests.

import { randomUUID, randomBytes } from "node:crypto";

export function newUuid(): string {
  if (typeof randomUUID === "function") {
    try {
      return randomUUID();
    } catch {
      // fall through to the byte-based UUID v4 builder
    }
  }
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Validates an ISO business date (YYYY-MM-DD) and returns its year. */
export function businessDateYear(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("A valid ISO business date (YYYY-MM-DD) is required.");
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("A valid ISO business date (YYYY-MM-DD) is required.");
  }
  return date.slice(0, 4);
}

/** Asia/Manila business date for a UTC instant, as YYYY-MM-DD. */
export function manilaBusinessDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

export function isoToDateKey(iso: string): string {
  return iso.slice(0, 10);
}