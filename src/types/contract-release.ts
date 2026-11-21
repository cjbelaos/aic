import { FrequencyType } from "./contract";

export interface ContractRelease {
  id: string; // REL-0001
  contractItemId: string; // CTI-0001
  contractId: string; // CTR-0001 (denormalized)
  periodYear: number; // 2026
  periodMonth: number; // 1 (1-12)
  periodQuarter: number; // 1 (1-4)
  frequency: FrequencyType; // "Monthly" | "Quarterly"
  releaseDate: string; // "2026-01-10"
  quantity: number; // 3
  releasedBy: string; // "john.doe"
  remarks?: string; // "Partial delivery"
  status: "Completed" | "Pending" | "Cancelled" | "Deleted";
  drNumber?: number; // Linked Delivery Receipt number (e.g., 3620)
}

export interface ContractPeriodSummary {
  periodId: string; // PER-CTI-0001-2026-01
  contractItemId: string; // CTI-0001
  contractId: string; // CTR-0001
  productCode: string; // SU-SALT50-0464
  periodYear: number; // 2026
  periodMonth: number; // 1
  periodQuarter: number; // 1
  frequency: FrequencyType; // "Monthly"
  entitledQty: number; // 7
  releasedQty: number; // 7
  releaseCount: number; // 3
  firstReleaseDate?: string; // "2026-01-05"
  lastReleaseDate?: string; // "2026-01-28"
  status: "Completed" | "Partial" | "Overdue" | "Pending";
  daysToComplete?: number; // 23
  periodStart: string; // "2026-01-01"
  periodEnd: string; // "2026-01-31"
}

export interface LedgerPeriod extends ContractPeriodSummary {
  shortfall: number;
}

export interface ItemLedger {
  contractItemId: string;
  contractId: string;
  productCode: string;
  productId: string;
  frequency: string;
  entitledQty: number;
  periods: LedgerPeriod[]; // oldest first
  owedNow: number; // sum of shortfall over all generated periods
  openPeriods: number; // periods with shortfall > 0
  oldestOpen: string; // "YYYY-MM" of oldest open period, "" if none
  extraQty: number;
}
