"use client";

import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { DeliveryReceiptPrintDocument } from "@/components/delivery-receipt-print-document";
import { generateBusinessDocumentPdf } from "./businessDocumentPdf";

export function generateDeliveryReceiptPdfBase64(dr: DeliveryReceiptResponse): Promise<string> {
  return generateBusinessDocumentPdf(<DeliveryReceiptPrintDocument dr={dr} />);
}
