import { createHash } from "node:crypto";
import type { FTIRequestFull } from "@/types/fti";

export function ftiRevision(full: FTIRequestFull): string {
  return createHash("sha256").update(JSON.stringify({
    controlNo: full.controlNo, userId: full.userId, status: full.status,
    totalAmount: full.totalAmount, details: full.details,
    approvedByUserId: full.approvedByUserId, approvedDate: full.approvedDate,
  })).digest("hex");
}
