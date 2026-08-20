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
  const month = date.getMonth() + 1; // 1-12
  const quarter = Math.ceil(month / 3); // 1-4

  let periodStart: Date;
  let periodEnd: Date;

  if (frequency === "Monthly") {
    periodStart = new Date(year, month - 1, 1);
    periodEnd = new Date(year, month, 0); // Last day of month
  } else if (frequency === "Quarterly") {
    const quarterMonth = (quarter - 1) * 3;
    periodStart = new Date(year, quarterMonth, 1);
    periodEnd = new Date(year, quarterMonth + 3, 0); // Last day of quarter
  } else {
    // Handle other frequencies...
    periodStart = new Date(year, month - 1, 1);
    periodEnd = new Date(year, month, 0);
  }

  return {
    year,
    month,
    quarter,
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
