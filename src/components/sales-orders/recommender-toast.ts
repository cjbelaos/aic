import { toast } from "sonner";
import type { RecommenderNotice } from "@/lib/salesOrders/recommenderNotice";

/** Tells admin whether the recommending technician was emailed. */
export function showRecommenderNotice(notice: RecommenderNotice | undefined): void {
  if (!notice) return;
  if (notice.warning) toast.warning(notice.warning);
  else if (notice.status === "SENT") toast.success("Technician notified.");
}
