"use client";

import { assertQuotationTerms } from "./quotationTerms";
import type { Quotation } from "@/types/quotation";
import { QuotationPrintDocument } from "@/components/quotation-print-document";
import { generateBusinessDocumentPdf } from "./businessDocumentPdf";
import { resolveUserSignatureUrls } from "./userSignatures";

export async function generateQuotationPdfBase64(quotation: Quotation): Promise<string> {
  assertQuotationTerms(quotation);
  const signatureUrls = await resolveUserSignatureUrls([quotation.preparedBy, quotation.approvedBy]);
  return generateBusinessDocumentPdf(<QuotationPrintDocument quotation={quotation} signatureUrls={signatureUrls} />);
}
