export function isDraftQuotationReference(reference: string) {
  return !reference || reference.startsWith("DRAFT-");
}

export function quotationNumberLabel(reference: string) {
  return isDraftQuotationReference(reference) ? "Unnumbered draft" : reference;
}
