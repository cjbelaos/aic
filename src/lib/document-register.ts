/** Search the displayed fields before applying the status selected in the register. */
export function matchesDocumentSearch(search: string, fields: readonly unknown[]): boolean {
  const query = search.trim().toLowerCase();
  return !query || fields.some(field => String(field ?? "").toLowerCase().includes(query));
}
