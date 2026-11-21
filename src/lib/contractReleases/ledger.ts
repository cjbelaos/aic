// Pure catch-up ledger: contract period status computed from the release log (no stored summaries).
// A release pays the oldest open period first (only periods already started); leftover is extraQty.
import type { Contract, ContractItem } from "../../types/contract.ts";
import type {
  AgreementLedger, BacklogCustomer, ContractRelease, CustomerLedger, ItemLedger, LedgerPeriod, LinkedDr,
} from "../../types/contract-release.ts";
import type { DeliveryReceiptSummary } from "../../types/deliveryReceipt.ts";
import { effectiveContractStatus } from "../contractStatus.ts";
import { isCountedDrStatus, toIsoDate } from "../inventory/domain.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;

export function isReleaseCounted(release: ContractRelease, drStatus: Map<number, string>): boolean {
  if (release.status === "Deleted" || release.status === "Cancelled") return false;
  if (release.drNumber) {
    const s = drStatus.get(release.drNumber);
    // Spec §1: only created/printed/completed DRs count; an unknown DR (legacy) counts.
    if (s !== undefined && !isCountedDrStatus(s)) return false;
  }
  return true;
}

function monthsPerPeriod(frequency: string): number {
  switch (frequency) {
    case "Monthly": return 1;
    case "Quarterly": return 3;
    case "Semi-Annual": return 6;
    case "Annual": return 12;
    default: return 0; // One-Time
  }
}

export function generatePeriods(frequency: string, startDate: string, endDate: string, today: string) {
  const out: { periodStart: string; periodEnd: string; year: number; month: number; quarter: number }[] = [];
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || startDate > endDate) return out;
  const step = monthsPerPeriod(frequency);
  const limit = today < endDate ? today : endDate;
  let year = Number(startDate.slice(0, 4));
  const startMonth = Number(startDate.slice(5, 7));
  let month = step === 0 || step === 1 ? startMonth : Math.floor((startMonth - 1) / step) * step + 1;
  for (let i = 0; i < 600; i++) {
    const periodStart = `${year}-${pad(month)}-01`;
    if (periodStart > limit) break;
    let periodEnd: string;
    let nextYear = year;
    let nextMonth = month + step;
    if (step === 0) {
      periodEnd = endDate;
    } else {
      const endMonthIdx = month + step - 1; // may exceed 12 only for misaligned steps; aligned never does
      periodEnd = `${year}-${pad(endMonthIdx)}-${pad(lastDay(year, endMonthIdx))}`;
      if (nextMonth > 12) { nextYear += 1; nextMonth -= 12; }
      if (periodEnd > endDate) periodEnd = endDate;
    }
    out.push({ periodStart, periodEnd, year, month, quarter: Math.floor((month - 1) / 3) + 1 });
    if (step === 0) break;
    year = nextYear;
    month = nextMonth;
  }
  return out;
}

export function computeItemLedger(
  item: ContractItem,
  contract: Contract,
  releases: ContractRelease[],
  drStatus: Map<number, string>,
  today: string,
): ItemLedger {
  const gen = generatePeriods(item.frequency, contract.startDate, contract.endDate, today);
  const allocated = gen.map(() => 0);
  const relIds = gen.map(() => new Set<string>());
  const firsts: string[] = gen.map(() => "");
  const lasts: string[] = gen.map(() => "");
  const entitled = item.entitledQty;
  let extraQty = 0;

  // Sheet dates can read back as e.g. "11/2/2026"; normalize, and drop rows with no usable date
  // rather than letting a string comparison push them into extra.
  const counted = releases
    .filter(r => r.contractItemId === item.id && isReleaseCounted(r, drStatus))
    .flatMap(r => {
      const releaseDate = DATE_RE.test(r.releaseDate) ? r.releaseDate : toIsoDate(r.releaseDate || "");
      return releaseDate ? [{ ...r, releaseDate }] : [];
    })
    .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const r of counted) {
    let remaining = Number(r.quantity) || 0;
    for (let i = 0; i < gen.length && remaining > 0; i++) {
      if (allocated[i] >= entitled || gen[i].periodStart > r.releaseDate) continue;
      const take = Math.min(remaining, entitled - allocated[i]);
      allocated[i] += take;
      remaining -= take;
      relIds[i].add(r.id);
      if (!firsts[i] || r.releaseDate < firsts[i]) firsts[i] = r.releaseDate;
      if (!lasts[i] || r.releaseDate > lasts[i]) lasts[i] = r.releaseDate;
    }
    extraQty += remaining;
  }

  const periods: LedgerPeriod[] = gen.map((g, i) => {
    const status: LedgerPeriod["status"] =
      allocated[i] >= entitled ? "Completed" : g.periodEnd < today ? "Overdue" : allocated[i] > 0 ? "Partial" : "Pending";
    const p: LedgerPeriod = {
      periodId: `PER-${item.id}-${g.year}-${pad(g.month)}`,
      contractItemId: item.id,
      contractId: contract.id,
      productCode: item.productCode,
      periodYear: g.year,
      periodMonth: g.month,
      periodQuarter: g.quarter,
      frequency: item.frequency,
      entitledQty: entitled,
      releasedQty: allocated[i],
      releaseCount: relIds[i].size,
      status,
      periodStart: g.periodStart,
      periodEnd: g.periodEnd,
      shortfall: Math.max(0, entitled - allocated[i]),
    };
    if (firsts[i]) { p.firstReleaseDate = firsts[i]; p.lastReleaseDate = lasts[i]; }
    if (status === "Completed" && firsts[i]) p.daysToComplete = dayNumber(lasts[i]) - dayNumber(firsts[i]);
    return p;
  });

  const open = periods.filter(p => p.shortfall > 0);
  return {
    contractItemId: item.id,
    contractId: contract.id,
    productCode: item.productCode,
    productId: item.productId ?? "",
    frequency: item.frequency,
    entitledQty: entitled,
    periods,
    owedNow: open.reduce((s, p) => s + p.shortfall, 0),
    openPeriods: open.length,
    oldestOpen: open.length ? `${open[0].periodYear}-${pad(open[0].periodMonth)}` : "",
    extraQty,
  };
}

export function computeLedgers(input: {
  contracts: Contract[];
  items: ContractItem[];
  releases: ContractRelease[];
  drStatus: Map<number, string>;
  today: string;
}): ItemLedger[] {
  const byId = new Map(input.contracts.map(c => [c.id, c]));
  const out: ItemLedger[] = [];
  for (const item of input.items) {
    if (item.status !== "Active") continue;
    const c = byId.get(item.contractId);
    if (!c) continue;
    const ledger = computeItemLedger(item, c, input.releases, input.drStatus, input.today);
    // A closed/expired/inactive agreement keeps its released history but owes nothing,
    // so Analytics does not count its unreleased periods as overdue.
    if (c.status !== "Active") {
      ledger.periods = ledger.periods.filter(p => p.releasedQty > 0).map(p => ({ ...p, shortfall: 0 }));
      ledger.owedNow = 0; ledger.openPeriods = 0; ledger.oldestOpen = "";
    }
    out.push(ledger);
  }
  return out;
}

const periodKey = (p: LedgerPeriod) => `${p.periodYear}-${pad(p.periodMonth)}`;

/** Customers owed something on an effective-Active agreement, most overdue first. */
export function buildBacklog(
  ledgers: ItemLedger[],
  contracts: Contract[],
  companyNames: Map<string, string>,
  today: string,
): BacklogCustomer[] {
  const active = new Map(contracts.filter(c => effectiveContractStatus(c, today) === "Active").map(c => [c.id, c]));
  const byCompany = new Map<string, BacklogCustomer & { agreements: Set<string> }>();
  for (const l of ledgers) {
    const c = active.get(l.contractId);
    if (!c || l.owedNow <= 0) continue;
    let row = byCompany.get(c.companyId);
    if (!row) {
      row = { companyId: c.companyId, companyName: companyNames.get(c.companyId) || c.companyName || c.companyId,
        owedQty: 0, overduePeriods: 0, oldestOverdue: "", agreementCount: 0, agreements: new Set() };
      byCompany.set(c.companyId, row);
    }
    row.owedQty += l.owedNow;
    row.agreements.add(c.id);
    for (const p of l.periods) {
      if (p.status !== "Overdue") continue;
      row.overduePeriods++;
      const key = periodKey(p);
      if (!row.oldestOverdue || key < row.oldestOverdue) row.oldestOverdue = key;
    }
  }
  return [...byCompany.values()]
    .map(({ agreements, ...row }) => ({ ...row, agreementCount: agreements.size }))
    .sort((a, b) => {
      if (a.oldestOverdue !== b.oldestOverdue) {
        if (!a.oldestOverdue) return 1;
        if (!b.oldestOverdue) return -1;
        return a.oldestOverdue < b.oldestOverdue ? -1 : 1;
      }
      return b.owedQty - a.owedQty;
    });
}

/** One customer's effective-Active agreements with their item ledgers and the DRs that released them. */
export function buildCustomerLedger(
  companyId: string,
  ledgers: ItemLedger[],
  contracts: Contract[],
  products: { code: string; name: string; unit: string }[],
  releases: ContractRelease[],
  drs: DeliveryReceiptSummary[],
  companyName: string,
  today: string,
): CustomerLedger {
  const mine = contracts
    .filter(c => c.companyId === companyId && effectiveContractStatus(c, today) === "Active")
    .sort((a, b) => a.id.localeCompare(b.id));
  const product = new Map(products.map(p => [p.code.toLowerCase(), p]));
  const agreements: AgreementLedger[] = mine.map(c => ({
    contractId: c.id,
    agreementType: c.agreementType,
    poNumber: c.poNumber || "",
    description: c.description || "",
    startDate: c.startDate,
    endDate: c.endDate,
    items: ledgers.filter(l => l.contractId === c.id).map(l => {
      const p = product.get(l.productCode.toLowerCase());
      return { ...l, productName: p?.name || l.productCode, unit: p?.unit || "" };
    }),
  }));

  const customerContracts = new Set(contracts.filter(c => c.companyId === companyId).map(c => c.id));
  const contractOfDr = new Map<number, string>();
  for (const r of releases) {
    if (r.drNumber && customerContracts.has(r.contractId) && !contractOfDr.has(r.drNumber)) contractOfDr.set(r.drNumber, r.contractId);
  }
  const drByNo = new Map(drs.map(d => [d.drNumber, d]));
  const linkedDrs: LinkedDr[] = [...contractOfDr.entries()]
    .map(([drNumber, contractId]) => {
      const d = drByNo.get(drNumber);
      return { drNumber, date: d?.date || "", status: d?.status || "", itemCount: d?.items?.length ?? 0, contractId,
        ...(d?.driveFileLink ? { driveFileLink: d.driveFileLink } : {}) };
    })
    .sort((a, b) => (a.date === b.date ? b.drNumber - a.drNumber : a.date < b.date ? 1 : -1));

  return { companyId, companyName, agreements, linkedDrs };
}
