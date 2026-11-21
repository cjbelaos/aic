import type { Contract, ContractItem } from "../../types/contract.ts";
import type { ContractRelease } from "../../types/contract-release.ts";
import type { ContractLine, DeliveryItem } from "../../types/deliveryReceipt.ts";
import { effectiveContractStatus } from "../contractStatus.ts";

/**
 * Validates the contract entitlements a DR payload claims to release.
 * Pure: the caller supplies the sheet data. Returns the first problem found.
 */
export function validateContractLines(input: {
  lines: ContractLine[];
  companyId: string;
  salesOrderId?: string;
  items: DeliveryItem[];
  contractItems: ContractItem[];
  contracts: Contract[];
  /** DR date; release rows are dated with it, so it must be YYYY-MM-DD. */
  date: string;
  today: string;
}): { error: string } | { ok: true } {
  const { lines, companyId, salesOrderId, items, contractItems, contracts, date, today } = input;
  if (!lines.length) return { ok: true };
  if (salesOrderId) return { error: "Contract releases cannot be recorded on a DR linked to a Sales Order." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return { error: "A DR that releases contract items needs a valid date (YYYY-MM-DD)." };

  let agreementId = "";
  for (const line of lines) {
    const item = contractItems.find((ci) => ci.id === line.contractItemId);
    if (!item) return { error: `Contract item ${line.contractItemId} not found.` };
    if (item.status !== "Active") return { error: `Contract item ${item.id} is inactive.` };
    const contract = contracts.find((c) => c.id === item.contractId);
    if (!contract) return { error: `Agreement ${item.contractId} for contract item ${item.id} not found.` };
    if (contract.companyId !== companyId) return { error: `Contract item ${item.id} belongs to a different customer.` };
    if (effectiveContractStatus(contract, today) !== "Active") return { error: `Agreement ${contract.id} is not active.` };

    const idx = line.deliveryLineIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
      return { error: `Contract item ${item.id} points at a DR line that does not exist.` };
    }
    const dl = items[idx];
    const sameProduct =
      item.productId && dl.productId
        ? item.productId === dl.productId
        : item.productCode.trim().toLowerCase() === (dl.productCode || "").trim().toLowerCase();
    if (!sameProduct) return { error: `DR line ${idx + 1} product does not match contract item ${item.id}.` };

    const q = line.quantity;
    if (!Number.isInteger(q) || q < 1 || q > Number(dl.quantity)) {
      return { error: `Contract item ${item.id} quantity must be a whole number from 1 to the DR line's quantity (${dl.quantity}).` };
    }

    if (agreementId && agreementId !== contract.id) {
      return { error: "A DR can release items from one agreement only." };
    }
    agreementId = contract.id;
  }
  return { ok: true };
}

/**
 * Release rows for one DR, with sequential ids after `lastReleaseId` so a batch
 * never reuses an id. Lines must already be validated.
 */
export function buildContractReleaseRows(input: {
  lines: ContractLine[];
  contractItems: ContractItem[];
  lastReleaseId: string;
  date: string;
  releasedBy: string;
  remarks?: string;
  drNumber: number;
  periodOf: (frequency: string) => { year: number; month: number; quarter: number };
}): ContractRelease[] {
  let n = Number.parseInt(String(input.lastReleaseId).replace(/^REL-/, ""), 10);
  if (!Number.isFinite(n)) n = 0;
  return input.lines.map((line) => {
    const item = input.contractItems.find((ci) => ci.id === line.contractItemId)!;
    const period = input.periodOf(item.frequency);
    return {
      id: `REL-${String(++n).padStart(4, "0")}`,
      contractItemId: item.id,
      contractId: item.contractId,
      periodYear: period.year,
      periodMonth: period.month,
      periodQuarter: period.quarter,
      frequency: item.frequency,
      releaseDate: input.date,
      quantity: line.quantity,
      releasedBy: input.releasedBy,
      remarks: input.remarks,
      status: "Completed",
      drNumber: input.drNumber,
    };
  });
}
