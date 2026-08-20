/**
 * Expense liquidation feature types.
 *
 * Database schema (two Google Sheets tabs in GOOGLE_SHEET_ID_DATABASE):
 *   Liquidations : LiquidationId | ControlNo | UserId | TotalAmount | Status
 *   ReceiptItems : ReceiptItemId | LiquidationId | Date | Description | Category | Amount | ReceiptImageUrl
 *
 * ControlNo links the liquidation to an FTI (Field Travel Itinerary) request.
 * When a ControlNo exists, TotalAmountRequested is taken from the FTI's
 * TotalAmount. When there is no ControlNo ("Other" liquidation), the
 * TotalAmountRequested is entered manually.
 *
 * Status lifecycle mirrors FTI: SAVED (items being added) → SUBMITTED (sent
 * for approval) → APPROVED / REQUESTED_FOR_CHANGE / REJECTED.
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

export type LiquidationStatus =
  | "SAVED"
  | "SUBMITTED"
  | "APPROVED"
  | "REQUESTED_FOR_CHANGE"
  | "REJECTED";

/** Parent row in the `Liquidations` sheet. */
export interface Liquidation {
  liquidationId: string;
  /** Links the liquidation to an FTI request (e.g. CTRL-20260812...). Empty for "Other" liquidations. */
  controlNo: string;
  userId: string;
  totalAmount: number;
  /**
   * The total amount being requested for liquidation. Auto-filled from the
   * FTI request's TotalAmount when a ControlNo exists; manually entered when
   * the liquidation has no ControlNo.
   */
  totalAmountRequested?: number;
  status: LiquidationStatus | string;
  /** Auto-assigned approver when submitted (mirrors FTI). */
  approvedByUserId?: string;
  approvedByName?: string;
  approvedBySignatureUrl?: string;
  approvedDate?: string;
  approvalComment?: string;
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
  /** The FTI ControlNo this liquidation is linked to. Empty for "Other" liquidations. */
  controlNo: string;
  items: ReceiptItemInput[];
}

/** Liquidation joined with its receipt items. */
export interface LiquidationFull extends Liquidation {
  items: ReceiptItem[];
}