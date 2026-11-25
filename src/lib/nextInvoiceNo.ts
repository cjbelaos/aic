/**
 * Suggests the next invoice number: the highest saved number + 1.
 * Drafts (DRAFT-…) and numbers without trailing digits are ignored.
 * A prefix and zero padding are kept, e.g. "SI-0099" -> "SI-0100".
 */
export function suggestNextInvoiceNo(invoiceNos: string[]): string {
  let best: { prefix: string; digits: string; value: bigint } | null = null;
  for (const raw of invoiceNos) {
    const no = raw.trim();
    if (!no || no.toUpperCase().startsWith("DRAFT-")) continue;
    const match = /^(.*?)(\d+)$/.exec(no);
    if (!match) continue;
    const value = BigInt(match[2]);
    if (!best || value > best.value)
      best = { prefix: match[1], digits: match[2], value };
  }
  if (!best) return "";
  return best.prefix + String(best.value + BigInt(1)).padStart(best.digits.length, "0");
}
