import type { sheets_v4 } from "googleapis";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getUserById, getUsers } from "@/lib/userSheets";
import type { CreateDocumentHandoverInput } from "@/types/documentHandover";

type Assignment = CreateDocumentHandoverInput & { assignedBy: string; assignedByName: string; assignedAt?: string };
type Source = { sheet: "ServiceInvoices" | "DeliveryReceipts"; row: (string | number)[]; rowNumber?: number };

const cells = (row: (string | number)[]): sheets_v4.Schema$RowData => ({
  values: row.map(value => ({ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } })),
});

/** Sheets applies every request in this batch atomically: header and custody record together.
 * No automatic retry of appendCells: an ambiguous timeout may have committed the batch.
 * A subsequent save/recovery checks the document key before appending a handover.
 */
export async function commitDocumentWithHandover(source: Source | undefined, input: Assignment) {
  if (!input.documentNumber.trim() || input.documentNumber.startsWith("DRAFT-") || Number(input.documentNumber) <= 0) {
    throw new Error("A finalized document number is required for automatic handover.");
  }
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const existingResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: "DocumentHandover!A2:X" });
  const matches = (existingResponse.data.values ?? []).map((row, index) => ({ row, index }))
    .filter(({ row }) => String(row[1]).trim() === input.documentType && String(row[2]).trim() === input.documentNumber.trim());
  if (matches.length > 1) throw new Error(`Duplicate Document Tracker records for ${input.documentType} ${input.documentNumber}; review them before saving.`);
  const existing = matches[0];
  // Recovery only adds missing records. It never changes a manual custody decision.
  if (!source && existing) return "unchanged" as const;
  const preserve = existing && existing.row[9] !== "handed_over";
  let assignedToId = input.assignedToId?.trim() || "";
  let assignedToName = input.assignedToName.trim();
  const assigneeType = input.assigneeType || "internal";
  if (!preserve) {
    if (assigneeType === "internal") {
      if (!assignedToId && assignedToName) {
        const users = (await getUsers()).filter(user => user.fullName.trim().toLowerCase() === assignedToName.toLowerCase());
        if (users.length === 1) assignedToId = users[0].userId;
      }
      const user = assignedToId ? await getUserById(assignedToId) : undefined;
      if (!user?.fullName.trim()) throw new Error("Select a valid document holder before saving. Automatic handover is required.");
      assignedToId = user.userId;
      assignedToName = user.fullName;
    } else if (!assignedToName) {
      throw new Error("An external document holder name is required.");
    }
  }
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const sheetId = (title: string) => {
    const id = metadata.data.sheets?.find(sheet => sheet.properties?.title === title)?.properties?.sheetId;
    if (id == null) throw new Error(`Missing ${title} sheet. Document was not saved.`);
    return id;
  };
  const requests: sheets_v4.Schema$Request[] = [];
  if (source) {
    if (source.rowNumber !== undefined && source.rowNumber < 2) throw new Error("Invalid source document row.");
    requests.push(source.rowNumber === undefined
      ? { appendCells: { sheetId: sheetId(source.sheet), rows: [cells(source.row)], fields: "userEnteredValue" } }
      : { updateCells: { start: { sheetId: sheetId(source.sheet), rowIndex: source.rowNumber - 1, columnIndex: 0 }, rows: [cells(source.row)], fields: "userEnteredValue" } });
  }
  let outcome: "created" | "updated" | "unchanged" | "already_returned" = "unchanged";
  if (!existing) {
    requests.push({ appendCells: { sheetId: sheetId("DocumentHandover"), fields: "userEnteredValue", rows: [cells([
      crypto.randomUUID(), input.documentType, input.documentNumber.trim(), input.customerName || "",
      assignedToId, assignedToName, input.assignedBy, input.assignedByName,
      input.assignedAt || new Date().toISOString(), "handed_over", "", "", "",
      input.notes || "Automatically handed over when document was created", assigneeType,
    ])] } });
    outcome = "created";
  } else if (!preserve && (existing.row[4] !== assignedToId || existing.row[5] !== assignedToName || (existing.row[14] || "internal") !== assigneeType)) {
    const row = [...existing.row] as (string | number)[];
    row[4] = assignedToId; row[5] = assignedToName; row[6] = input.assignedBy; row[7] = input.assignedByName; row[14] = assigneeType;
    requests.push({ updateCells: { start: { sheetId: sheetId("DocumentHandover"), rowIndex: existing.index + 1, columnIndex: 0 }, rows: [cells(row)], fields: "userEnteredValue" } });
    outcome = "updated";
  } else if (existing.row[9] === "returned") outcome = "already_returned";
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }, { retry: false });
  return outcome;
}
