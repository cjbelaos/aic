import type { SessionUser } from "@/types/user";

/** The After Sales custodian for documents returned by technicians. */
export const AFTER_SALES_DOCUMENT_RECEIVER_ID =
  "bb71f1fb-daba-47d6-b70e-5b5bff3339ba";

export const DOCUMENT_RECEIVE_AND_VERIFY_USER_ID =
  "3c32886b-eded-4025-b6c3-247bc60b961a";

export function canReceiveAndVerifyDocuments(user: { userId: string }): boolean {
  return user.userId === DOCUMENT_RECEIVE_AND_VERIFY_USER_ID;
}

export function isAfterSalesDocumentReceiver(user: SessionUser): boolean {
  return user.userId === AFTER_SALES_DOCUMENT_RECEIVER_ID;
}
