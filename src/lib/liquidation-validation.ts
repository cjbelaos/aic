import type { ReceiptItemInput } from "@/types/liquidation";

export const VAT_DOCUMENT_REFERENCE_MESSAGE =
  "Enter at least one document reference (SI, OR, DR, CR, BS, Check No, CV No, or Ref No) for each receipt with VAT applied.";

export function hasDocumentReference(item: ReceiptItemInput): boolean {
  return [
    item.siNumber,
    item.orNumber,
    item.drNumber,
    item.crNumber,
    item.bsNumber,
    item.checkNo,
    item.cvNo,
    item.refNo,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

export function getVatReferenceError(items: ReceiptItemInput[]): string | null {
  const index = items.findIndex(
    (item) => Number(item.vat) > 0 && !hasDocumentReference(item),
  );
  return index === -1
    ? null
    : `Receipt item ${index + 1}: ${VAT_DOCUMENT_REFERENCE_MESSAGE}`;
}
