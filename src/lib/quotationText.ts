/**
 * Quotation text normalisation.
 *
 * Every free-text field in the Quotations module (quotation description, service
 * line descriptions, line unit and notations) is stored, displayed and printed in
 * UPPERCASE. The rule is applied when the form loads a saved quotation, on every
 * change — which covers both typing and pasting — and again when the payload is
 * built, so the editor, the Quotations sheet and the PDF always agree.
 *
 * Numbers, dates, catalogue product names and select values are deliberately not
 * touched.
 *
 * Pure module (no React, no Google, no node APIs) so the form and the focused
 * tests share the same rule.
 */

/** Uppercases a text value; null/undefined/numbers become "" safely. */
export function upperText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toUpperCase();
}

/** Uppercases every entry of a text list (e.g. notations), preserving order. */
export function upperTextList(values: readonly unknown[]): string[] {
  return values.map((value) => upperText(value));
}
