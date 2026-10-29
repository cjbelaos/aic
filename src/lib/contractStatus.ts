import type { Contract, ContractStatus } from "../types/contract";

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function effectiveContractStatus(contract: Pick<Contract, "status" | "endDate">, today = manilaToday()): ContractStatus {
  return contract.status === "Active" && /^\d{4}-\d{2}-\d{2}$/.test(contract.endDate) && contract.endDate < today
    ? "Expired" : contract.status;
}

export function contractReady(contract: Pick<Contract, "status" | "endDate" | "paperworkStatus">, today = manilaToday()): boolean {
  return effectiveContractStatus(contract, today) === "Active" && contract.paperworkStatus === "Complete";
}

export function contractRowClass(contract: Contract): string {
  const status = effectiveContractStatus(contract);
  if (status === "Expired") return "bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60";
  if (status !== "Active") return "";
  return contract.paperworkStatus === "Complete"
    ? "bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-950/60"
    : "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60";
}
