/**
 * Technician monthly earnings-vs-expenses report types.
 *
 * Attribution rule for Service Invoices (SR):
 * 1. Use the SI's own deliveredById when present.
 * 2. Otherwise, when the SI has a linked DR, use that DR's deliveredById
 *    (internal delivery only; external DRs carry no internal user).
 * 3. When neither exists, the SI is excluded from earnings entirely.
 */

export interface TechnicianEarningDetail {
  kind: "sr_with_dr" | "sr_without_dr" | "fti" | "liquidation";
  /** invoiceNo / FTI controlNo / liquidationId. */
  refNo: string;
  date: string;
  companyName?: string;
  drNumber?: number;
  amount: number;
}

export interface TechnicianEarningRow {
  userId: string;
  fullName: string;
  srWithDrTotal: number;
  srWithDrCount: number;
  srWithoutDrTotal: number;
  srWithoutDrCount: number;
  srTotal: number;
  ftiTotal: number;
  ftiCount: number;
  /** Expense ground truth: liquidation receipt items + FTI detail expenses for the month. */
  liquidationTotal: number;
  liquidationCount: number;
  /** srTotal - liquidationTotal (FTI is shown as reference only to avoid double counting). */
  net: number;
  details: TechnicianEarningDetail[];
}

export interface TechnicianMonthlySeries {
  month: number;
  srWithDr: number;
  srWithDrCount: number;
  srWithoutDr: number;
  srWithoutDrCount: number;
  srTotal: number;
  fti: number;
  ftiCount: number;
  liquidation: number;
  liquidationCount: number;
  net: number;
}

export interface TechnicianEarningsResponse {
  period: { year: number; month: number | null; startDate: string; endDate: string };
  monthly: TechnicianMonthlySeries[];
  department: { departmentId: number; name: string };
  totals: {
    srWithDr: number;
    srWithDrCount: number;
    srWithoutDr: number;
    srWithoutDrCount: number;
    srTotal: number;
    fti: number;
    liquidation: number;
    net: number;
  };
  technicians: TechnicianEarningRow[];
  excluded: {
    noDelivererCount: number;
    noDelivererTotal: number;
    outsideDeptCount: number;
    outsideDeptTotal: number;
  };
}