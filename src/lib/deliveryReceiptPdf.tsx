"use client";

import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { DeliveryReceiptPrintDocument } from "@/components/delivery-receipt-print-document";
import { generateBusinessDocumentPdf } from "./businessDocumentPdf";
import { resolveUserSignatureUrls } from "./userSignatures";

export async function generateDeliveryReceiptPdfBase64(dr: DeliveryReceiptResponse): Promise<string> {
  const signatureUrls = await resolveUserSignatureUrls([dr.preparedBy, dr.deliveredBy]);
  return generateBusinessDocumentPdf(<DeliveryReceiptPrintDocument dr={dr} signatureUrls={signatureUrls} />);
}
