const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" or "2026-09-01" → "Sep 2026"; "" stays "". */
export function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}/.test(ym)) return ym;
  return `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`;
}

/** "2026-09-01" → "Sep". */
export function shortMonth(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? date;
}
