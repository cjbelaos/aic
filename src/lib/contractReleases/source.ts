import { getContracts } from "@/lib/contractSheets";
import { getContractItems } from "@/lib/contractItemSheets";
import { getContractReleases } from "@/lib/contractReleaseSheets";
import { getDeliveryReceipts } from "@/lib/deliverySheets";
import { manilaToday } from "@/lib/contractStatus";
import { getCompanies } from "@/lib/companySheets";
import { getProducts } from "@/lib/productSheets";
import { getProductUnits } from "@/lib/productReferenceSheets";
import { buildBacklog, buildCustomerLedger, computeLedgers } from "@/lib/contractReleases/ledger";
import type { Contract, ContractItem } from "@/types/contract";
import type {
  BacklogCustomer, ContractPeriodSummary, ContractRelease, CustomerLedger, ItemLedger,
} from "@/types/contract-release";
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

export async function getBacklog(): Promise<BacklogCustomer[]> {
  const [{ ledgers, contracts, today }, companies] = await Promise.all([loadLedgers(), getCompanies()]);
  const names = new Map(companies.map((c) => [c.companyId, c.companyName]));
  return buildBacklog(ledgers, contracts, names, today);
}

export async function getCustomerLedger(companyId: string): Promise<CustomerLedger> {
  const [{ ledgers, contracts, releases, drs, today }, companies, products, units] = await Promise.all([
    loadLedgers(), getCompanies(), getProducts(), getProductUnits(),
  ]);
  const unitCode = new Map(units.map((u) => [u.unitId, u.unitCode]));
  const productRows = products.map((p) => ({ code: p.productCode, name: p.productName, unit: unitCode.get(p.unitId) || "" }));
  const companyName = companies.find((c) => c.companyId === companyId)?.companyName || companyId;
  return buildCustomerLedger(companyId, ledgers, contracts, productRows, releases, drs, companyName, today);
}
