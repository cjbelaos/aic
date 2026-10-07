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

export function getVatVendorError(items: ReceiptItemInput[]): string | null {
  for (const [index, item] of items.entries()) {
    const missing = [
      ["Supplier Name", item.supplierName],
      ["Supplier Address", item.address],
      ...(Number(item.vat) > 0 ? [["TIN", item.tin]] : []),
    ].filter(([, value]) => typeof value !== "string" || !value.trim());
    if (missing.length) {
      return `Receipt item ${index + 1}: Enter ${missing.map(([label]) => label).join(", ")}. Supplier Name and Supplier Address are always required; TIN is required when VAT is applied.`;
    }
  }
  return null;
}
