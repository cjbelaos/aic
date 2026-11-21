// Pure catch-up ledger: contract period status computed from the release log (no stored summaries).
// A release pays the oldest open period first (only periods already started); leftover is extraQty.
import type { Contract, ContractItem } from "../../types/contract.ts";
import type { ContractRelease, ItemLedger, LedgerPeriod } from "../../types/contract-release.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_COUNTED_DR = new Set(["draft", "pending_approval", "rejected", "deleted"]);
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;

export function isReleaseCounted(release: ContractRelease, drStatus: Map<number, string>): boolean {
  if (release.status === "Deleted" || release.status === "Cancelled") return false;
  if (release.drNumber) {
    const s = drStatus.get(release.drNumber);
    if (s !== undefined && NOT_COUNTED_DR.has(s.trim().toLowerCase())) return false;
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

  const counted = releases
    .filter(r => r.contractItemId === item.id && isReleaseCounted(r, drStatus))
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
    out.push(computeItemLedger(item, c, input.releases, input.drStatus, input.today));
  }
  return out;
}
