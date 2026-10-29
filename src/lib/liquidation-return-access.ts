import { isAdminUser } from "@/lib/auth/session";
import { getPositions } from "@/lib/positionSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import { getLiquidationReturnAmount } from "@/lib/liquidation-returns";
import type { Liquidation } from "@/types/liquidation";
import type { SessionUser } from "@/types/user";

export async function getReturnAccess(session: SessionUser) {
  const [positions, mappings] = await Promise.all([
    getPositions(), getUserApprovers("LIQUIDATION"),
  ]);
  const title = positions.find(p => p.positionId === session.positionId)?.positionTitle
    .trim().toLowerCase().replace(/[\s-]+/g, " ");
  return {
    userId: session.userId,
    isAdmin: isAdminUser(session),
    isCfo: title === "cfo" || title === "chief financial officer",
    requesterIds: new Set(mappings.filter(m => m.approverUserId === session.userId).map(m => m.requesterUserId)),
  };
}

type ReturnAccess = Awaited<ReturnType<typeof getReturnAccess>>;

export function canViewReturn(liquidation: Liquidation, access: ReturnAccess): boolean {
  return access.isAdmin || access.isCfo || liquidation.userId === access.userId ||
    liquidation.approvedByUserId === access.userId || access.requesterIds.has(liquidation.userId);
}

export function withReturnAccess<T extends Liquidation>(liquidation: T, access: ReturnAccess): T {
  const visible = canViewReturn(liquidation, access);
  const result = { ...liquidation, canViewReturn: visible,
    canRecordReturn: !liquidation.returnAmountUnavailable && liquidation.userId === access.userId && liquidation.status.toUpperCase() === "APPROVED" &&
      getLiquidationReturnAmount(liquidation) > 0 };
  if (!visible) {
    delete result.returnDate;
    delete result.returnEvidenceFileId;
    delete result.returnEvidenceName;
    delete result.returnUpdatedBy;
    delete result.returnUpdatedAt;
  }
  return result;
}
