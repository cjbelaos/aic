/**
 * Expense liquidation feature types.
 *
 * Database schema (two Google Sheets tabs in GOOGLE_SHEET_ID_DATABASE):
 *   Liquidations : LiquidationId | UserId | TotalAmount
 *   ReceiptItems : ReceiptItemId | LiquidationId | Date | Description | Category | Amount | ReceiptImageUrl
 */

export const RECEIPT_CATEGORIES = [
  "Meal",
  "Fare",
  "Materials",
  "Fuel",
  "Hotel",
  "Others",
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

/** Parent row in the `Liquidations` sheet. */
export interface Liquidation {
  liquidationId: string;
  userId: string;
  totalAmount: number;
}

/** Child row in the `ReceiptItems` sheet. */
export interface ReceiptItem {
  receiptItemId: string;
  liquidationId: string;
  date: string;
  description: string;
  category: ReceiptCategory | string;
  amount: number;
  receiptImageUrl: string;
}

/** A single line item supplied by the client before IDs / URLs are assigned. */
export interface ReceiptItemInput {
  date: string;
  description: string;
  category: string;
  amount: number;
  /** Public file URL returned by the upload endpoint, if a receipt photo was attached. */
  receiptImageUrl?: string;
  /** Client-only proxy URL (/api/images/drive/{fileId}) used for thumbnail previews. */
  receiptPreviewUrl?: string;
  /** Client-only flag: true when the uploaded receipt is an image (else PDF). */
  receiptIsImage?: boolean;
}

/** Payload accepted by POST /api/liquidations. */
export interface NewLiquidationInput {
  /** The authenticated user's ID (set server-side from the session). */
  userId: string;
  items: ReceiptItemInput[];
}

/** Liquidation joined with its receipt items. */
export interface LiquidationFull extends Liquidation {
  items: ReceiptItem[];
}