import { txQuery } from "@/lib/db/postgres";

/** Last DR number of the old system; the first DR issued here is 3643 (deliverySheets DR_SEQUENCE_BASE). */
const DR_SEQUENCE_BASE = 3642;

/**
 * Next DR number, inside the save's transaction. A transaction-scoped advisory
 * lock serialises concurrent saves, so each gets the next number after the
 * previous one commits; the delivery_receipts primary key backs it up. Draft
 * placeholders (negative numbers) are ignored.
 */
export async function nextDrNumber(): Promise<number> {
  await txQuery("select pg_advisory_xact_lock(hashtext('aic:dr-number'))");
  const [{ next }] = await txQuery<{ next: number }>(
    "select greatest(coalesce(max(dr_number), 0), $1::int) + 1 as next from aic.delivery_receipts where dr_number > 0",
    [DR_SEQUENCE_BASE],
  );
  return Number(next);
}
