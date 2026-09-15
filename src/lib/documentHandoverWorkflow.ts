import type { SessionUser } from "@/types/user";

/** The After Sales custodian for documents returned by technicians. */
export const AFTER_SALES_DOCUMENT_RECEIVER_ID =
  "bb71f1fb-daba-47d6-b70e-5b5bff3339ba";

export function isAfterSalesDocumentReceiver(user: SessionUser): boolean {
  return user.userId === AFTER_SALES_DOCUMENT_RECEIVER_ID;
}
