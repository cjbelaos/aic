/**
 * Expense Liquidation V2 — ISOLATED SANDBOX TYPES.
 *
 * NOT used by the production liquidation flow. These types back the
 * "Expense Liquidation V2" testing page which reads/writes the dedicated
 * `ReceiptItems_V2` (and `Liquidations_V2`) Google Sheets tabs. The
 * production `types/liquidation.ts` is left untouched.
 *
 * Database schema (two Google Sheets tabs in GOOGLE_SHEET_ID_DATABASE):
 *   Liquidations_V2 : LiquidationId | ControlNo | UserId | TotalAmount | Status
 *                     | ApprovedByUserId | ApprovedByName | ApprovedBySignatureUrl
 *                     | ApprovedDate | ApprovalComment | TotalAmountRequested
 *   ReceiptItems_V2 : ReceiptItemId | LiquidationId | Date | Description
 *                     | MiscellaneousCode | Amount | ReceiptImageUrl
 *                     | SINumber | SIDate | DRNumber | DRDate | CRNumber | CRDate
 *                     | BSNumber | BSDate | ORNumber | ORDate | OthersDate
 *                     | RefNo | TIN | SupplierName | Address
 *                     | CheckNo | CVNo | Particulars | GrossAmount | VAT | EWT
 */

import type {
  Liquidation,
  ReceiptItem,
} from "@/types/liquidation";

/** Full list of `ReceiptItems_V2` column headers (order = sheet columns A..AB). */
export const RECEIPT_ITEMS_V2_HEADERS = [
  "ReceiptItemId",
  "LiquidationId",
  "Date",
  "Description",
  "MiscellaneousCode",
  "Amount",
  "ReceiptImageUrl",
  // ── Document References ──
  "SINumber",
  "SIDate",
  "DRNumber",
  "DRDate",
  "CRNumber",
  "CRDate",
  "BSNumber",
  "BSDate",
  "ORNumber",
  "ORDate",
  "OthersDate",
  // ── Vendor Information ──
  "RefNo",
  "TIN",
  "SupplierName",
  "Address",
  // ── Accounting & Tax ──
  "CheckNo",
  "CVNo",
  "Particulars",
  "GrossAmount",
  "VAT",
  "EWT",
] as const;

/** Full list of `Liquidations_V2` column headers (mirrors production tab). */
export const LIQUIDATIONS_V2_HEADERS = [
  "LiquidationId",
  "ControlNo",
  "UserId",
  "TotalAmount",
  "Status",
  "ApprovedByUserId",
  "ApprovedByName",
  "ApprovedBySignatureUrl",
  "ApprovedDate",
  "ApprovalComment",
  "TotalAmountRequested",
] as const;

export interface DocumentReferences {
  siNumber?: string;
  siDate?: string;
  drNumber?: string;
  drDate?: string;
  crNumber?: string;
  crDate?: string;
  bsNumber?: string;
  bsDate?: string;
  orNumber?: string;
  orDate?: string;
  othersDate?: string;
}

export interface VendorInformation {
  refNo?: string;
  tin?: string;
  supplierName?: string;
  address?: string;
}

export interface AccountingTaxFields {
  checkNo?: string;
  cvNo?: string;
  particulars?: string;
  grossAmount?: number;
  vat?: number;
  ewt?: number;
}

/**
 * Child row in the `ReceiptItems_V2` sheet. Extends the production
 * `ReceiptItem` (keeps `category`/`amount`/`receiptImageUrl` contract) and
 * adds all new document-reference, vendor and tax fields. `category` is
 * mirrored from `MiscellaneousCode` for compatibility with shared renderers.
 */
export interface ReceiptItemV2 extends ReceiptItem, DocumentReferences, VendorInformation, AccountingTaxFields {
  /** Replaces `category` in the V2 schema (e.g. "MEAL", "FARE"). */
  miscellaneousCode: string;
}

/** A single V2 line item supplied by the client before IDs / URLs are assigned. */
export interface ReceiptItemV2Input extends DocumentReferences, VendorInformation, AccountingTaxFields {
  date: string;
  description: string;
  miscellaneousCode: string;
  /** Net amount of the line (stored in the Amount column). */
  amount: number;
  receiptImageUrl?: string;
  /** Client-only proxy URL (/api/images/drive/{fileId}) used for thumbnail previews. */
  receiptPreviewUrl?: string;
  /** Client-only flag: true when the uploaded receipt is an image (else PDF). */
  receiptIsImage?: boolean;
}

/** Payload accepted by POST /api/liquidation-v2. */
export interface NewLiquidationV2Input {
  userId: string;
  controlNo: string;
  items: ReceiptItemV2Input[];
}

/** V2 liquidation joined with its V2 receipt items. */
export interface LiquidationFullV2 extends Liquidation {
  items: ReceiptItemV2[];
  requesterName?: string;
  requesterDepartmentId?: number;
}