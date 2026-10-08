import type { Contract, ServiceFeeFrequency } from "../types/contract";
import type { ContractRelease } from "../types/contract-release";
import type { ServiceInvoiceItem } from "../types/serviceInvoice";
import { validateManualCategories } from "./serviceInvoiceFilters";

export type InvoiceBillingMode = "REGULAR" | "PMS_CONTRACT";

export class InvoiceBillingError extends Error {}

export function pmsContractForDelivery(
  drNumber: number,
  customerId: string,
  releases: ContractRelease[],
  contracts: Contract[],
): Contract | undefined {
  const ids = new Set(releases.filter(release =>
    release.drNumber === drNumber && release.status !== "Cancelled" && release.status !== "Deleted",
  ).map(release => release.contractId).filter(Boolean));
  // A receipt spanning multiple contracts needs an explicit billing choice.
  if (ids.size !== 1) return undefined;
  return contracts.find(contract => ids.has(contract.id) &&
    contract.companyId === customerId && contract.status === "Active" &&
    (contract.monthlyServiceFee ?? 0) > 0);
}

export function pmsInvoiceItem(date: string, fee: number, frequency: ServiceFeeFrequency = "Monthly"): ServiceInvoiceItem {
  const month = new Date(`${date.slice(0, 10)}T12:00:00`);
  const label = Number.isNaN(month.getTime()) ? "" : month.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  if (frequency === "Quarterly") {
    const quarter = Number.isNaN(month.getTime()) ? "" : `Q${Math.floor(month.getMonth() / 3) + 1} ${month.getFullYear()}`;
    return { description: `PMS FOR THE QUARTER${quarter ? ` OF ${quarter}` : ""}`, quantity: 1, unitPrice: fee };
  }
  return { description: `PMS FOR THE MONTH${label ? ` OF ${label}` : ""}`, quantity: 1, unitPrice: fee };
}

/** Validate billing intent independently of invoice totals or customer defaults. */
export function validateInvoiceBilling(input: {
  billingMode?: InvoiceBillingMode;
  contractId?: string;
  customerId: string;
  salesOrderId?: string;
  drNumber?: number | null;
  manualCategories?: string[];
  items: ServiceInvoiceItem[];
}, contract?: Contract, allowInactiveContract = false): { billingMode: InvoiceBillingMode; contractId: string; manualCategories: string[] } {
  const fail = (message: string): never => { throw new InvoiceBillingError(message); };
  const mode = input.billingMode ?? "REGULAR";
  if (mode !== "REGULAR" && mode !== "PMS_CONTRACT") fail("Choose a valid invoice billing type.");
  const categories = validateManualCategories(input.manualCategories ?? []);
  if (mode === "PMS_CONTRACT") {
    if (!input.contractId || !contract || contract.id !== input.contractId) fail("Select a PMS contract.");
    if (contract!.companyId !== input.customerId) fail("The PMS contract belongs to a different customer.");
    if ((!allowInactiveContract && contract!.status !== "Active") || !(Number(contract!.monthlyServiceFee) > 0)) fail("Select an active PMS contract with a service fee.");
    if (input.salesOrderId) fail("PMS contract billing must be a separate invoice without a Sales Order link.");
    if (categories.some(category => category !== "PMS")) fail("PMS and other categories must be billed on separate invoices.");
    const item = input.items[0];
    if (input.items.length !== 1 || !item || !(contract!.serviceFeeFrequency === "Quarterly" ? /^PMS FOR THE QUARTER\b/i : /^PMS FOR THE MONTH\b/i).test(item.description.trim()) || item.quantity !== 1 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0 || item.productId || item.salesOrderItemId) fail("PMS contract billing requires one PMS charge matching the contract frequency. Bill additional services or parts separately.");
    return { billingMode: mode, contractId: input.contractId!, manualCategories: [] };
  }
  if (input.contractId) fail("Choose PMS contract billing to attach a contract, or clear the contract for a regular invoice.");
  if (categories.includes("PMS") && categories.length > 1) fail("PMS and other categories must be billed on separate invoices.");
  if (input.items.length > 1 && input.items.some(item => /^PMS FOR THE (MONTH|QUARTER)\b/i.test(item.description.trim()))) fail("Bill the PMS charge on a separate invoice from additional services or parts.");
  if (!input.salesOrderId && !categories.length) fail("Select an invoice category before saving.");
  return { billingMode: mode, contractId: "", manualCategories: input.salesOrderId ? [] : categories };
}
