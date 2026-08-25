import { FrequencyType } from "../../types/contract";

interface PeriodInfo {
  year: number;
  month: number;
  quarter: number;
  periodStart: Date;
  periodEnd: Date;
}

export function getPeriodInfo(
  date: Date,
  frequency: FrequencyType,
): PeriodInfo {
  const year = date.getFullYear();
  const actualMonth = date.getMonth() + 1; // 1-12
  const actualQuarter = Math.ceil(actualMonth / 3); // 1-4

  let periodStart: Date;
  let periodEnd: Date;
  let periodMonth: number; // Normalized month for period grouping

  if (frequency === "Monthly") {
    periodMonth = actualMonth;
    periodStart = new Date(year, actualMonth - 1, 1);
    periodEnd = new Date(year, actualMonth, 0); // Last day of month
  } else if (frequency === "Quarterly") {
    periodMonth = (actualQuarter - 1) * 3 + 1; // 1, 4, 7, or 10
    periodStart = new Date(year, periodMonth - 1, 1);
    periodEnd = new Date(year, periodMonth + 2, 0); // Last day of quarter
  } else if (frequency === "Semi-Annual") {
    periodMonth = actualMonth <= 6 ? 1 : 7; // First half (1) or second half (7)
    periodStart = new Date(year, periodMonth - 1, 1);
    periodEnd = new Date(year, periodMonth + 5, 0); // Last day of half-year
  } else if (frequency === "Annual") {
    periodMonth = 1; // Entire year uses month 1
    periodStart = new Date(year, 0, 1);
    periodEnd = new Date(year, 11, 31);
  } else {
    // One-Time or unknown: use actual month
    periodMonth = actualMonth;
    periodStart = new Date(year, actualMonth - 1, 1);
    periodEnd = new Date(year, actualMonth, 0);
  }

  return {
    year,
    month: periodMonth,
    quarter: Math.ceil(periodMonth / 3),
    periodStart,
    periodEnd,
  };
}

export function getPeriodId(
  contractItemId: string,
  periodInfo: PeriodInfo,
): string {
  const monthStr = String(periodInfo.month).padStart(2, "0");
  return `PER-${contractItemId}-${periodInfo.year}-${monthStr}`;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
