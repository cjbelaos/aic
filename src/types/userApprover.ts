export interface UserApprover {
  configId: string;
  departmentId: number;
  requesterUserId: string;
  approverUserId: string;
  approvalLevel: number;
  /**
   * Which module this mapping applies to:
   *  - "FTI"          → Field Travel Itinerary approvals only
   *  - "LIQUIDATION"  → Liquidation approvals only
   *  - "*" (or empty) → applies to all modules (backward-compatible)
   */
  approvalType: string;
}
