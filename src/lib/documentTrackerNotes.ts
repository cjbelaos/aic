import type { DocumentHandover } from "@/types/documentHandover";

/** Display-only annotations; never overwrite the saved custody notes or status. */
export function annotateInvoiceStatuses(handovers: DocumentHandover[], invoiceRows: unknown[][]): DocumentHandover[] {
  const statuses = new Map(invoiceRows.map(row => [String(row[0] ?? "").trim(), String(row[8] ?? "").trim().toLowerCase()]));
  return handovers.map(handover => {
    const status = handover.documentType === "service_invoice" ? statuses.get(handover.documentNumber.trim()) : undefined;
    return { ...handover, sourceStatusNote: status === "cancelled" ? "Service invoice is Cancelled." : status === "void" ? "Service invoice is Void." : undefined };
  });
}
