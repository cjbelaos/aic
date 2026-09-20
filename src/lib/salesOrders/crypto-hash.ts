// Hashes for command envelopes, payloads and destination conflict checks.
// Uses only node:crypto so native-TypeScript tests can import it directly.

import { createHash } from "node:crypto";

/** Deterministic canonical JSON: sorted keys, compact separators. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Stable payload hash for idempotency receipts and destination hashes. */
export function payloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}