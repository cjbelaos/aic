export function parseSheetNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value ?? "").replace(/[\u20b1$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSheetBoolean(value: unknown): boolean {
  return ["true", "yes", "1"].includes(String(value ?? "").trim().toLowerCase());
}

export function nextStableId(prefix: string, ids: string[], width = 6): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const max = ids.reduce((current, id) => {
    const match = pattern.exec(id.trim());
    return match ? Math.max(current, Number.parseInt(match[1], 10)) : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

export function rowNumberFromStableId(id: string, ids: string[]): number {
  const index = ids.findIndex((candidate) => candidate === id);
  if (index < 0) throw new Error(`Record "${id}" was not found.`);
  return index + 2;
}

export function isMissingSheetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unable to parse range|requested entity was not found|not found/i.test(message);
}
