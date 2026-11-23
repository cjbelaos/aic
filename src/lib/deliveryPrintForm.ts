// Which printed form a Delivery Receipt uses, and which "FOR" client it may name.
//
// Golden East (COMP-96) DRs print on Golden East's letterhead by default; the
// preview can switch back to the Aerich form. The FOR client is a company billed
// to the DR's company (Companies column I, BillingCompanyId).
//
// Pure module: no "@/" imports, so the focused tests can compile it.

export type DeliveryReceiptPrintForm = "golden-east" | "aerich";

export const GOLDEN_EAST_COMPANY_ID = "COMP-96";

export function defaultDeliveryReceiptPrintForm(dr: { companyId?: string }): DeliveryReceiptPrintForm {
  return dr.companyId?.trim() === GOLDEN_EAST_COMPANY_ID ? "golden-east" : "aerich";
}

export interface ForCompanyCandidate {
  companyId: string;
  companyName: string;
  status?: string;
  billingCompanyId?: string;
}

/** Active companies billed to `companyId`, sorted by name, as dropdown options. */
export function forCompanyOptions(companies: ForCompanyCandidate[], companyId: string): { value: string; label: string }[] {
  if (!companyId) return [];
  return companies
    .filter((c) => c.billingCompanyId === companyId && (c.status ?? "active").toLowerCase() === "active")
    .map((c) => ({ value: c.companyId, label: c.companyName }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Null when the FOR client is blank or billed to the DR's company; otherwise the error to show. */
export function validateForCompany(companies: ForCompanyCandidate[], companyId: string, forCompanyId: string | undefined): string | null {
  if (!forCompanyId) return null;
  const forCompany = companies.find((c) => c.companyId === forCompanyId);
  return forCompany && forCompany.billingCompanyId === companyId ? null : "The FOR client must be a company billed to this DR's company.";
}

/**
 * Billing company choices for a company: active customers other than itself
 * (mirrors validateBillingCompany in companySheets.ts), labelled "NAME (ID)".
 */
export function billingCompanyOptions(
  companies: { companyId: string; companyName: string; companyType?: string; status?: string }[],
  ownCompanyId: string,
): { value: string; label: string }[] {
  return companies
    .filter((c) => (c.companyType === "Customer" || c.companyType === "Both") && (c.status ?? "active").toLowerCase() === "active" && c.companyId !== ownCompanyId)
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
    .map((c) => ({ value: c.companyId, label: `${c.companyName} (${c.companyId})` }));
}
