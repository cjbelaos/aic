import { txQuery } from "@/lib/db/postgres";
import { col, iso, ref, sheetRows } from "@/lib/db/sheetRows";

/**
 * Delivery Receipt storage on PostgreSQL. deliverySheets.ts keeps every business rule and builds the
 * same DeliveryReceipts!A:AD row it always did; these helpers read and write that row as typed
 * columns, inside the caller's transaction (all writes use txQuery).
 */

/** DeliveryReceipts!A:AD, as the Sheets API returned it. */
export const DELIVERY_RECEIPT_COLUMNS = [
  col("dr_number"), col("delivery_date"), ref("company_id", "CompanyId"), col("po_number"), col("sales_order_no"),
  col("sr_number"), col("comments"), col("prepared_by"), col("delivered_by"), iso("created_at"), col("status"),
  col("drive_file_link"), col("created_by"), col("updated_by"), iso("updated_at"), col("delivered_by_id"),
  col("delivered_by_type"), col("delivered_by_option_id"), ref("sales_order_id", "SalesOrderId"),
  ref("warehouse_id", "WarehouseId"), col("approved_by"), iso("approved_at"), col("approval_note"),
  col("requested_status"), col("for_company_id"), col("no_charge_reason"), col("no_charge_note"),
  col("scanned_file_link"), iso("scanned_at"), col("scanned_by"),
];

/** The DR's A:AD row, or undefined when the DR does not exist. */
export async function readDrRowPg(drNumber: number): Promise<string[] | undefined> {
  return (await sheetRows("aic.delivery_receipts", DELIVERY_RECEIPT_COLUMNS, "dr_number = $1", [drNumber]))[0];
}

export async function drNumberExistsPg(drNumber: number): Promise<boolean> {
  return (await txQuery("select 1 from aic.delivery_receipts where dr_number = $1", [drNumber])).length > 0;
}

const text = (value: unknown) => {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
};

/** Columns A:S of the sheet row, in order. */
const HEADER_COLUMNS = [
  "dr_number", "delivery_date", "company_id", "po_number", "sales_order_no", "sr_number", "comments", "prepared_by",
  "delivered_by", "created_at", "status", "drive_file_link", "created_by", "updated_by", "updated_at", "delivered_by_id",
  "delivered_by_type", "delivered_by_option_id", "sales_order_id",
] as const;

/**
 * Inserts (no currentDrNumber) or updates the DR from its A:S row. On update the row's own DR number
 * may differ from currentDrNumber (draft promotion); references follow via ON UPDATE CASCADE.
 * The audit trigger owns created_at/created_by/updated_at/updated_by.
 */
export async function writeDrHeaderPg(row: readonly unknown[], currentDrNumber?: number): Promise<void> {
  const audit = new Set(["created_at", "created_by", "updated_at", "updated_by"]);
  const columns = HEADER_COLUMNS.map((name, index) => ({ name, value: text(row[index]) })).filter((c) => !audit.has(c.name));
  if (currentDrNumber === undefined) {
    await txQuery(
      `insert into aic.delivery_receipts (${columns.map((c) => c.name).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
      columns.map((c) => c.value),
    );
    return;
  }
  const result = await txQuery<{ dr_number: number }>(
    `update aic.delivery_receipts set ${columns.map((c, i) => `${c.name} = $${i + 1}`).join(", ")} where dr_number = $${columns.length + 1} returning dr_number`,
    [...columns.map((c) => c.value), currentDrNumber],
  );
  if (!result.length) throw new Error(`DR #${currentDrNumber} not found.`);
}

const EXTRA_COLUMNS: Record<string, string> = {
  warehouseId: "warehouse_id", approvedBy: "approved_by", approvedAt: "approved_at", approvalNote: "approval_note",
  requestedStatus: "requested_status", forCompanyId: "for_company_id", noChargeReason: "no_charge_reason", noChargeNote: "no_charge_note",
};

/** Columns T:AA (inventory approval, FOR client, no-charge). Undefined fields are left unchanged. */
export async function updateDrExtrasPg(drNumber: number, extras: Partial<Record<keyof typeof EXTRA_COLUMNS, string>>): Promise<void> {
  const entries = Object.entries(extras).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  await txQuery(
    `update aic.delivery_receipts set ${entries.map(([k], i) => `${EXTRA_COLUMNS[k]} = $${i + 2}`).join(", ")} where dr_number = $1`,
    [drNumber, ...entries.map(([, v]) => text(v))],
  );
}

export async function setDrStatusPg(drNumber: number, status: string): Promise<void> {
  await txQuery("update aic.delivery_receipts set status = $2 where dr_number = $1", [drNumber, status]);
}

export async function appendDrStatusHistoryPg(drNumber: number, oldStatus: string, newStatus: string, changedBy: string, changedAt: string): Promise<void> {
  const [{ next }] = await txQuery<{ next: number }>("select coalesce(max(line_no), 0) + 1 as next from aic.delivery_receipt_status_history");
  await txQuery(
    "insert into aic.delivery_receipt_status_history (line_no, dr_number, old_status, new_status, changed_by, changed_at) values ($1, $2, $3, $4, $5, $6)",
    [next, drNumber, oldStatus, newStatus, changedBy, changedAt],
  );
}
