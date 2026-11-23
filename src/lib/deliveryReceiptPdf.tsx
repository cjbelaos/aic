"use client";

import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { DeliveryReceiptPrintDocument } from "@/components/delivery-receipt-print-document";
import { generateBusinessDocumentPdf } from "./businessDocumentPdf";
import { resolveUserSignatureUrls } from "./userSignatures";
import { defaultDeliveryReceiptPrintForm, type DeliveryReceiptPrintForm } from "./deliveryPrintForm";

/** Renders the DR on `form`, or on its company's default form (Golden East for COMP-96). */
export async function generateDeliveryReceiptPdfBase64(dr: DeliveryReceiptResponse, form?: DeliveryReceiptPrintForm): Promise<string> {
  const signatureUrls = await resolveUserSignatureUrls([dr.preparedBy, dr.deliveredBy]);
  return generateBusinessDocumentPdf(<DeliveryReceiptPrintDocument dr={dr} signatureUrls={signatureUrls} form={form ?? defaultDeliveryReceiptPrintForm(dr)} />);
}
