export const CONTRACT_ID_PATTERN = /^CTR-(\d+)$/i;

export class ContractConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractConflictError";
  }
}

export function nextContractId(ids: string[], width = 4): string {
  const max = ids.reduce((highest, value) => {
    const match = CONTRACT_ID_PATTERN.exec(String(value).trim());
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest;
  }, 0);
  return `CTR-${String(max + 1).padStart(width, "0")}`;
}

export function duplicateContractIds(ids: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of ids) {
    const id = String(value).trim();
    if (!CONTRACT_ID_PATTERN.test(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
}
