import crypto from "crypto";

export function nfUuid(): string {
  return crypto.randomUUID();
}
