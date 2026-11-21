import { getContracts } from "@/lib/contractSheets";
import { getContractItems } from "@/lib/contractItemSheets";
import { getContractReleases } from "@/lib/contractReleaseSheets";
import { getDeliveryReceipts } from "@/lib/deliverySheets";
import { manilaToday } from "@/lib/contractStatus";
import { computeLedgers } from "@/lib/contractReleases/ledger";
import type { Contract, ContractItem } from "@/types/contract";
import type { ContractPeriodSummary, ContractRelease, ItemLedger } from "@/types/contract-release";
import type { DeliveryReceiptSummary } from "@/types/deliveryReceipt";

export async function loadLedgers(): Promise<{
  ledgers: ItemLedger[];
  contracts: Contract[];
  items: ContractItem[];
  releases: ContractRelease[];
  drs: DeliveryReceiptSummary[];
  today: string;
}> {
  const [contracts, items, releases, drs] = await Promise.all([
    getContracts(), getContractItems(), getContractReleases(), getDeliveryReceipts(),
  ]);
  const today = manilaToday();
  const drStatus = new Map<number, string>(drs.map((d) => [d.drNumber, d.status]));
  return { ledgers: computeLedgers({ contracts, items, releases, drStatus, today }), contracts, items, releases, drs, today };
}

export async function getComputedPeriodSummaries(
  contractItemId?: string,
  periodYear?: number,
  periodMonth?: number,
  contractId?: string,
): Promise<ContractPeriodSummary[]> {
  const { ledgers } = await loadLedgers();
  let summaries: ContractPeriodSummary[] = ledgers.flatMap((l) => l.periods);
  if (contractItemId) summaries = summaries.filter((s) => s.contractItemId === contractItemId);
  if (contractId) summaries = summaries.filter((s) => s.contractId === contractId);
  if (periodYear) summaries = summaries.filter((s) => s.periodYear === periodYear);
  if (periodMonth) summaries = summaries.filter((s) => s.periodMonth === periodMonth);
  return summaries;
}
