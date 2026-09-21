/**
 * Delivery Release reference — one reference per release, in one of two modes:
 *
 *  - SALES_ORDER: the current system flow. The release stores the immutable
 *    `salesOrderId` and the reference column shows the Sales Order number.
 *  - TR_NUMBER: legacy records. The user types the TR number by hand. It is never
 *    auto-generated, and no Sales Order link is stored.
 *
 * Persistence (the DeliveryReceipts schema is unchanged):
 *  - Column E `SalesOrderNo (legacy TRNumber)` stores the display reference: the
 *    Sales Order number, or the manual TR number.
 *  - Column S `SalesOrderId` stores the immutable Sales Order link ("" when the
 *    release carries a legacy TR number). The Sales Order fulfillment
 *    integration keys on this column, so a TR-only release never posts
 *    fulfillment.
 *
 * The two modes are mutually exclusive: selecting a Sales Order clears the manual
 * TR number, and a manual TR number clears the Sales Order link.
 *
 * A reference stays optional. Callers send an explicit `referenceMode` only when
 * the user actually supplied a value, and each mode then requires that value.
 * Payloads without a mode keep the previous behaviour, so existing callers and
 * historical records are unaffected.
 *
 * Pure module: imported by the page, the API routes, the Sheets mapping and the
 * focused Node tests. Never import Google, React or node-only APIs here.
 */

export type DeliveryReferenceMode = "SALES_ORDER" | "TR_NUMBER";

export const DELIVERY_REFERENCE_MODES: readonly DeliveryReferenceMode[] = [
  "SALES_ORDER",
  "TR_NUMBER",
];

/** Field label for the combined reference control (create and edit forms). */
export const DELIVERY_REFERENCE_FIELD_LABEL = "Sales Order / TR Number";

/** Label of the manual legacy input. */
export const TR_NUMBER_FIELD_LABEL = "TR Number";

/** Label of the Sales Order picker. */
export const SALES_ORDER_FIELD_LABEL = "Sales Order";

/** Mode choices for the reference switch. */
export const DELIVERY_REFERENCE_MODE_CHOICES: readonly {
  value: DeliveryReferenceMode;
  label: string;
  description: string;
}[] = [
  {
    value: "SALES_ORDER",
    label: SALES_ORDER_FIELD_LABEL,
    description: "Link this release to a confirmed Sales Order.",
  },
  {
    value: "TR_NUMBER",
    label: "Legacy TR Number",
    description: `Type the ${TR_NUMBER_FIELD_LABEL} recorded before Sales Orders.`,
  },
];

export const DELIVERY_REFERENCE_SELECT_SALES_ORDER_ERROR =
  "Select a Sales Order, or switch the reference to a Legacy TR Number.";
export const DELIVERY_REFERENCE_ENTER_TR_NUMBER_ERROR =
  `Enter a ${TR_NUMBER_FIELD_LABEL}, or switch the reference to a Sales Order.`;

export function isDeliveryReferenceMode(value: unknown): value is DeliveryReferenceMode {
  return value === "SALES_ORDER" || value === "TR_NUMBER";
}

/** Trimmed TR number. TR numbers have no enforced format yet. */
export function normalizeTrNumber(value: unknown): string {
  return String(value ?? "").trim();
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export interface DeliveryReferenceInput {
  /** Explicit mode. Omit for legacy payloads that predate reference modes. */
  referenceMode?: DeliveryReferenceMode | string | null;
  salesOrderId?: string | null;
  /** Sales Order number the caller already knows (the API re-resolves it). */
  salesOrderNo?: string | null;
  trNo?: string | null;
}

export interface DeliveryReferenceResolution {
  /** Requested mode, or null when the payload carried no mode. */
  mode: DeliveryReferenceMode | null;
  /** Immutable Sales Order link to persist ("" when unlinked). */
  salesOrderId: string;
  /** Value for column E: the Sales Order number, or the manual TR number. */
  trNo: string;
  /** Reference shown in the UI, the print document and the PDF. */
  displayReference: string;
  /** User-facing validation message when the requested mode is incomplete. */
  error?: string;
}

/**
 * Validates and normalizes a requested reference.
 *
 * - SALES_ORDER requires a Sales Order id; the Sales Order number is taken from
 *   the caller only as a display fallback because the API re-resolves it.
 * - TR_NUMBER requires a non-empty TR number after trimming and clears the link.
 * - No mode keeps the previous "Sales Order number, else TR number" behaviour.
 */
export function resolveDeliveryReference(
  input: DeliveryReferenceInput = {},
): DeliveryReferenceResolution {
  const mode = isDeliveryReferenceMode(input.referenceMode) ? input.referenceMode : null;
  const salesOrderId = text(input.salesOrderId);
  const salesOrderNo = text(input.salesOrderNo);
  const trNo = normalizeTrNumber(input.trNo);

  if (mode === "SALES_ORDER") {
    if (!salesOrderId) {
      return { mode, salesOrderId: "", trNo: "", displayReference: "", error: DELIVERY_REFERENCE_SELECT_SALES_ORDER_ERROR };
    }
    const displayReference = salesOrderNo || trNo;
    return { mode, salesOrderId, trNo: displayReference, displayReference };
  }

  if (mode === "TR_NUMBER") {
    if (!trNo) {
      return { mode, salesOrderId: "", trNo: "", displayReference: "", error: DELIVERY_REFERENCE_ENTER_TR_NUMBER_ERROR };
    }
    // Mutually exclusive: a manual TR number clears the Sales Order link.
    return { mode, salesOrderId: "", trNo, displayReference: trNo };
  }

  const displayReference = salesOrderNo || trNo;
  return { mode: null, salesOrderId, trNo: displayReference, displayReference };
}

export interface DeliveryReferenceRecord {
  referenceMode: DeliveryReferenceMode;
  salesOrderId: string;
  /** Sales Order number when linked, otherwise "". */
  salesOrderNo: string;
  /** Column E value: the Sales Order number, or the manual TR number. */
  trNo: string;
  /** Column E value (Sales Order number or TR number). */
  displayReference: string;
  isLinkedToSalesOrder: boolean;
}

/** Column indexes of the DeliveryReceipts reference columns. */
export const DELIVERY_REFERENCE_COLUMN = 4; // E: SalesOrderNo (legacy TRNumber)
export const DELIVERY_SALES_ORDER_ID_COLUMN = 18; // S: SalesOrderId

/** Reads the reference from a DeliveryReceipts row. */
export function deliveryReferenceFromRow(row: readonly unknown[]): DeliveryReferenceRecord {
  const displayReference = text(row[DELIVERY_REFERENCE_COLUMN]);
  const salesOrderId = text(row[DELIVERY_SALES_ORDER_ID_COLUMN]);
  const isLinkedToSalesOrder = Boolean(salesOrderId);
  return {
    referenceMode: isLinkedToSalesOrder ? "SALES_ORDER" : "TR_NUMBER",
    salesOrderId,
    salesOrderNo: isLinkedToSalesOrder ? displayReference : "",
    trNo: displayReference,
    displayReference,
    isLinkedToSalesOrder,
  };
}

/**
 * Mode of an already-persisted release. A stored Sales Order id means the current
 * flow; anything else is a legacy reference. Records with no reference at all
 * default to the Sales Order mode so a form opens on the current flow.
 */
export function referenceModeForRecord(record: {
  salesOrderId?: string | null;
  trNo?: string | null;
}): DeliveryReferenceMode {
  if (text(record.salesOrderId)) return "SALES_ORDER";
  if (normalizeTrNumber(record.trNo)) return "TR_NUMBER";
  return "SALES_ORDER";
}

/** Manual TR number to pre-fill in the edit form ("" for linked releases). */
export function legacyTrNumberForRecord(record: {
  salesOrderId?: string | null;
  trNo?: string | null;
}): string {
  return text(record.salesOrderId) ? "" : normalizeTrNumber(record.trNo);
}

/** Reference shown in lists, previews and the print document ("" when absent). */
export function deliveryReferenceDisplay(record: {
  salesOrderNo?: string | null;
  trNo?: string | null;
}): string {
  return text(record.salesOrderNo) || normalizeTrNumber(record.trNo);
}

/** Short kind label shown next to the reference in the UI. */
export function deliveryReferenceKindLabel(record: {
  salesOrderId?: string | null;
  salesOrderNo?: string | null;
  trNo?: string | null;
}): string {
  if (text(record.salesOrderId)) return SALES_ORDER_FIELD_LABEL;
  return normalizeTrNumber(record.trNo) ? TR_NUMBER_FIELD_LABEL : "";
}

export interface DeliveryReferenceRowValues {
  /** Column E value. */
  reference: string;
  /** Column S value. */
  salesOrderId: string;
  error?: string;
}

/**
 * Column E/S values for a DeliveryReceipts header row.
 *
 * `current` is the persisted row for an update; omit it for a create. Without an
 * explicit mode this reproduces the previous mapping exactly (create: "Sales
 * Order number, else TR number"; update: supplied TR number, else the stored
 * one), so historical rows and unrelated callers keep working.
 */
export function deliveryReferenceRowValues(
  input: DeliveryReferenceInput,
  current?: { trNo?: string | null; salesOrderId?: string | null },
): DeliveryReferenceRowValues {
  const resolved = resolveDeliveryReference(input);
  if (resolved.mode) {
    if (resolved.error) return { reference: "", salesOrderId: "", error: resolved.error };
    return { reference: resolved.trNo, salesOrderId: resolved.salesOrderId };
  }

  const reference = current === undefined
    ? text(input.salesOrderNo) || normalizeTrNumber(input.trNo)
    : input.trNo === undefined || input.trNo === null
      ? normalizeTrNumber(current.trNo)
      : normalizeTrNumber(input.trNo);
  const salesOrderId = input.salesOrderId === undefined || input.salesOrderId === null
    ? text(current?.salesOrderId)
    : text(input.salesOrderId);
  return { reference, salesOrderId };
}


