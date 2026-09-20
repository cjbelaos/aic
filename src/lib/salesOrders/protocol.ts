// Command envelope protocol: server signs constrained mutation commands; the
// Apps Script gateway verifies signature, timestamp, command ID and allowed
// operation before it performs any write under its lock. Secrets live only in
// server env / Script Properties — never in the browser.

import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, payloadHash } from "./crypto-hash.ts";

export const COMMAND_PROTOCOL_VERSION = 1;
export const COMMAND_DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export interface CommandEnvelope {
  version: typeof COMMAND_PROTOCOL_VERSION;
  commandId: string;
  commandType: string;
  salesOrderId: string | null;
  expectedVersion: number | null;
  actorUserId: string;
  issuedAt: string;
  payloadHash: string;
  signature: string;
}

export interface UnsignedCommand {
  commandId: string;
  commandType: string;
  salesOrderId: string | null;
  expectedVersion: number | null;
  actorUserId: string;
  issuedAt: string;
  payload: unknown;
}

export function signCommand(secret: string, command: UnsignedCommand): CommandEnvelope {
  const envelope: Omit<CommandEnvelope, "signature"> = {
    version: COMMAND_PROTOCOL_VERSION,
    commandId: command.commandId,
    commandType: command.commandType,
    salesOrderId: command.salesOrderId,
    expectedVersion: command.expectedVersion,
    actorUserId: command.actorUserId,
    issuedAt: command.issuedAt,
    payloadHash: payloadHash(command.payload),
  };
  const signature = hmac(secret, canonicalize(envelope));
  return { ...envelope, signature };
}

/** Verifies signature, freshness window and that the command ID is present. */
export function verifyCommand(
  secret: string,
  envelope: CommandEnvelope,
  options: { maxAgeMs?: number; now?: Date } = {},
): boolean {
  if (envelope.version !== COMMAND_PROTOCOL_VERSION) return false;
  if (!envelope.commandId || !envelope.commandType) return false;
  if (!envelope.payloadHash) return false;
  const signable: Omit<CommandEnvelope, "signature"> = {
    version: envelope.version,
    commandId: envelope.commandId,
    commandType: envelope.commandType,
    salesOrderId: envelope.salesOrderId,
    expectedVersion: envelope.expectedVersion,
    actorUserId: envelope.actorUserId,
    issuedAt: envelope.issuedAt,
    payloadHash: envelope.payloadHash,
  };
  const expected = hmac(secret, canonicalize(signable));
  if (expected.length !== envelope.signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(envelope.signature, "utf8"))) return false;
  const issuedAt = Date.parse(envelope.issuedAt);
  if (Number.isNaN(issuedAt)) return false;
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? COMMAND_DEFAULT_MAX_AGE_MS;
  const age = now.getTime() - issuedAt;
  if (age < -COMMAND_DEFAULT_MAX_AGE_MS || age > maxAgeMs) return false;
  return true;
}

function canonicalize(envelope: Omit<CommandEnvelope, "signature">): string {
  return canonicalJson({
    version: envelope.version,
    commandId: envelope.commandId,
    commandType: envelope.commandType,
    salesOrderId: envelope.salesOrderId,
    expectedVersion: envelope.expectedVersion,
    actorUserId: envelope.actorUserId,
    issuedAt: envelope.issuedAt,
    payloadHash: envelope.payloadHash,
  });
}

function hmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}