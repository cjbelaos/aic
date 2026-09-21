// Service Reports — deterministic hashing and command receipts.
// Receipts make mutations idempotent: a client retry with the same commandId
// replays the stored result instead of executing twice. Pure module.

import { createHash } from "node:crypto";
import type { ServiceReportCommandReceipt } from "../../types/serviceReport.ts";

/** Deterministic canonical JSON: sorted keys, compact separators. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256HexString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256HexBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function payloadHash(payload: unknown): string {
  return sha256HexString(canonicalJson(payload));
}

/** Stable hash covering the actor, operation, parent id and parsed input. */
export function requestIntentHash(
  operation: string,
  actorUserId: string,
  reportId: string | null,
  input: unknown,
): string {
  return sha256HexString(canonicalJson({ operation, actorUserId, reportId, input }));
}

export interface NewReceiptInput {
  commandId: string;
  commandType: string;
  serviceReportId: string;
  resultVersion: number;
  result: unknown;
  committedAt: string;
  actorUserId: string;
  payloadHash: string;
}

export function buildReceipt(input: NewReceiptInput): ServiceReportCommandReceipt {
  return {
    commandId: input.commandId,
    payloadHash: input.payloadHash,
    commandType: input.commandType,
    serviceReportId: input.serviceReportId,
    resultVersion: input.resultVersion,
    resultJson: JSON.stringify(input.result),
    committedAt: input.committedAt,
    actorUserId: input.actorUserId,
  };
}