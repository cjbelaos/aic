import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  DocumentHandover,
  CreateDocumentHandoverInput,
  ReturnDocumentHandoverInput,
  WorkflowDocumentHandoverInput,
  DocumentType,
} from "@/types/documentHandover";
import { getUserById } from "@/lib/userSheets";
import { canReceiveAndVerifyDocuments, isAfterSalesDocumentReceiver } from "@/lib/documentHandoverWorkflow";
import { isAdminUser } from "@/lib/auth/session";
import { pickScanReturnEntry, scanReturnPlan, SCAN_RETURN_NOTE, type ScanReturnOutcome } from "@/lib/documentScanReturn";
import type { SessionUser } from "@/types/user";

const SHEET_NAME = "DocumentHandover";
const RANGE = `${SHEET_NAME}!A2:X`;
// Columns:
// A: id
// B: documentType
// C: documentNumber
// D: customerName
// E: assignedToId
// F: assignedToName
// G: assignedBy
// H: assignedByName
// I: assignedAt
// J: status
// K: returnedBy
// L: returnedByName
// M: returnedAt
// N: notes
// O: assigneeType
// P:R: received by After Sales (id, name, timestamp)
// S:U: verified by Admin (id, name, timestamp)
// V:X: unassigned by After Sales (id, name, timestamp)

export async function getDocumentHandovers(): Promise<DocumentHandover[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });

    const rows = response.data.values || [];
    return rows
      .map((row): DocumentHandover => ({
        id: String(row[0] ?? "").trim(),
        documentType: row[1] as DocumentType,
        documentNumber: String(row[2] ?? "").trim(),
        customerName: String(row[3] ?? "").trim() || undefined,
        assignedToId: String(row[4] ?? "").trim(),
        assignedToName: String(row[5] ?? "").trim(),
        assigneeType: String(row[14] ?? "").trim() === "external" ? "external" : "internal",
        assignedBy: String(row[6] ?? "").trim(),
        assignedByName: String(row[7] ?? "").trim(),
        assignedAt: String(row[8] ?? "").trim(),
        status: row[9] as DocumentHandover["status"],
        returnedBy: String(row[10] ?? "").trim() || undefined,
        returnedByName: String(row[11] ?? "").trim() || undefined,
        returnedAt: String(row[12] ?? "").trim() || undefined,
        notes: String(row[13] ?? "").trim() || undefined,
        receivedByAfterSales: String(row[15] ?? "").trim() || undefined,
        receivedByAfterSalesName: String(row[16] ?? "").trim() || undefined,
        receivedByAfterSalesAt: String(row[17] ?? "").trim() || undefined,
        verifiedBy: String(row[18] ?? "").trim() || undefined,
        verifiedByName: String(row[19] ?? "").trim() || undefined,
        verifiedAt: String(row[20] ?? "").trim() || undefined,
        unassignedBy: String(row[21] ?? "").trim() || undefined,
        unassignedByName: String(row[22] ?? "").trim() || undefined,
        unassignedAt: String(row[23] ?? "").trim() || undefined,
      }))
      .filter((h) => h.id);
  } catch (error) {
    console.error("Failed to fetch document handovers:", error);
    throw error;
  }
}

export async function getPendingDocumentHandovers(): Promise<
  DocumentHandover[]
> {
  const all = await getDocumentHandovers();
  return all.filter((h) => h.status === "handed_over");
}

export async function getDocumentHandoverStats(): Promise<{
  total: number;
  handedOver: number;
  returned: number;
}> {
  const all = await getDocumentHandovers();
  return {
    total: all.length,
    handedOver: all.filter((h) => h.status === "handed_over").length,
    returned: all.filter((h) => h.status === "returned").length,
  };
}

export async function createDocumentHandovers(
  handovers: CreateDocumentHandoverInput[],
  assignedBy: string,
  assignedByName: string,
): Promise<DocumentHandover[]> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const now = new Date().toISOString();
    const rows = handovers.map((h) => {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `ho_${Date.now()}_${h.documentNumber}`;
      return [
        id, // A: id
        h.documentType, // B: documentType
        h.documentNumber, // C: documentNumber
        h.customerName || "", // D: customerName
        h.assignedToId || "", // E: assignedToId (blank for external holder)
        h.assignedToName, // F: assignedToName
        assignedBy, // G: assignedBy
        assignedByName, // H: assignedByName
        now, // I: assignedAt
        "handed_over", // J: status
        "", // K: returnedBy
        "", // L: returnedByName
        "", // M: returnedAt
        h.notes || "", // N: notes
        h.assigneeType || "internal", // O: assigneeType
      ];
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    return rows.map((row) => ({
      id: row[0],
      documentType: row[1] as DocumentType,
      documentNumber: row[2],
      customerName: row[3] || undefined,
      assignedToId: row[4],
      assignedToName: row[5],
      assigneeType: row[14] === "external" ? "external" : "internal",
      assignedBy: row[6],
      assignedByName: row[7],
      assignedAt: row[8],
      status: "handed_over",
      notes: row[13] || undefined,
    }));
  } catch (error) {
    console.error("Failed to create document handovers:", error);
    throw error;
  }
}

export async function ensureAutomaticDocumentHandover(input: CreateDocumentHandoverInput & { assignedBy: string; assignedByName: string }): Promise<{ outcome: "created" | "updated" | "unchanged" | "already_returned" | "unassigned" }> {
  if (!input.documentNumber.trim() || input.documentNumber.startsWith("DRAFT-")) return { outcome: "unassigned" };
  const assigneeType = input.assigneeType || "internal";
  let assignedToId = input.assignedToId || "";
  let assignedToName = input.assignedToName.trim();
  if (!assignedToName) return { outcome: "unassigned" };
  if (assigneeType === "internal" && assignedToId) {
    const assignee = await getUserById(assignedToId);
    if (!assignee || !assignee.fullName.trim()) return { outcome: "unassigned" };
    assignedToId = assignee.userId;
    assignedToName = assignee.fullName;
  }
  const normalizedType = input.documentType.trim().toLowerCase(); const normalizedNumber = input.documentNumber.trim().toLowerCase();
  const all = await getDocumentHandovers(); const existing = all.find((entry) => entry.documentType.toLowerCase() === normalizedType && entry.documentNumber.trim().toLowerCase() === normalizedNumber);
  if (!existing) { await createDocumentHandovers([{ ...input, assignedToId, assignedToName, assigneeType, notes: input.notes || "Automatically assigned from Delivery Receipt" }], input.assignedBy, input.assignedByName); return { outcome: "created" }; }
  if (existing.status === "returned") return { outcome: "already_returned" };
  if ((existing.assignedToId || "") === assignedToId && existing.assignedToName === assignedToName && (existing.assigneeType || "internal") === assigneeType) return { outcome: "unchanged" };
  const sheets = await getSheetsClient(); const spreadsheetId = await getDatabaseSpreadsheetId(); const rows = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE }); const index = (rows.data.values ?? []).findIndex((row) => String(row[0] ?? "").trim() === existing.id);
  if (index < 0) throw new Error("Document Tracker assignment could not be located for update.");
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: [{ range: `${SHEET_NAME}!E${index + 2}:H${index + 2}`, values: [[assignedToId, assignedToName, input.assignedBy, input.assignedByName]] }, { range: `${SHEET_NAME}!O${index + 2}`, values: [[assigneeType]] }] } });
  return { outcome: "updated" };
}

export async function returnDocumentHandovers(
  input: ReturnDocumentHandoverInput,
): Promise<void> {
  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });

    const rows = response.data.values || [];
    const now = new Date().toISOString();

    const updateRequests: Array<{
      range: string;
      values: string[][];
    }> = [];

    const ids = new Set(input.ids);

    rows.forEach((row, index) => {
      const id = String(row[0] ?? "").trim();
      if (ids.has(id) && row[9] === "handed_over") {
        const rowNumber = index + 2;
        updateRequests.push({
          range: `${SHEET_NAME}!J${rowNumber}:N${rowNumber}`,
          values: [
            [
              "returned", // J: status
              input.returnedBy, // K: returnedBy
              input.returnedByName, // L: returnedByName
              now, // M: returnedAt
              input.notes || row[13] || "", // N: notes
            ],
          ],
        });
      }
    });

    if (updateRequests.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updateRequests,
        },
      });
    }
  } catch (error) {
    console.error("Failed to return document handovers:", error);
    throw error;
  }
}

async function updateWorkflowDocumentHandovers(
  input: WorkflowDocumentHandoverInput,
  fromStatus: DocumentHandover["status"],
  toStatus: DocumentHandover["status"],
  auditStartColumn: "P" | "S" | "V",
  receiveAndVerify = false,
): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const ids = new Set(input.ids);
  const now = new Date().toISOString();
  const requests = (response.data.values || []).flatMap((row, index) => {
    const combinedReceipt = receiveAndVerify && row[9] === "handed_over";
    if (!ids.has(String(row[0] ?? "").trim()) || (row[9] !== fromStatus && !combinedReceipt)) return [];
    const rowNumber = index + 2;
    return [
      {
        range: `${SHEET_NAME}!J${rowNumber}`,
        values: [[toStatus]],
      },
      {
        range: `${SHEET_NAME}!${auditStartColumn}${rowNumber}:${String.fromCharCode(auditStartColumn.charCodeAt(0) + 2)}${rowNumber}`,
        values: [[input.actorId, input.actorName, now]],
      },
      ...(combinedReceipt ? [{
        range: `${SHEET_NAME}!P${rowNumber}:R${rowNumber}`,
        values: [[input.actorId, input.actorName, now]],
      }] : []),
      ...(input.notes ? [{ range: `${SHEET_NAME}!N${rowNumber}`, values: [[input.notes]] }] : []),
    ];
  });
  if (requests.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: requests },
    });
  }
}

export function receiveDocumentHandovers(input: WorkflowDocumentHandoverInput): Promise<void> {
  return updateWorkflowDocumentHandovers(input, "handed_over", "received_by_after_sales", "P");
}

export function verifyDocumentHandovers(input: WorkflowDocumentHandoverInput): Promise<void> {
  return updateWorkflowDocumentHandovers(input, "received_by_after_sales", "returned", "S", canReceiveAndVerifyDocuments({ userId: input.actorId }));
}

export function unassignDocumentHandovers(input: WorkflowDocumentHandoverInput): Promise<void> {
  return updateWorkflowDocumentHandovers(input, "handed_over", "unassigned", "V");
}

/** A scan upload may return a tracker entry only for someone who could receive and verify it by hand. */
export function canAutoReturnDocuments(user: SessionUser): boolean {
  const canReceive = isAfterSalesDocumentReceiver(user) || canReceiveAndVerifyDocuments(user);
  const canVerify = isAdminUser(user) || canReceiveAndVerifyDocuments(user);
  return canReceive && canVerify;
}

/**
 * Marks a document received and verified after its signed scan is saved:
 * handed over → returned (receipt and verification stamped), received → returned,
 * no entry → a new returned entry, returned/unassigned → unchanged.
 */
export async function returnDocumentFromScan(input: {
  documentType: DocumentType;
  documentNumber: string;
  /** Only called when a new entry has to be created. */
  resolveCustomerName?: () => Promise<string | undefined>;
  actor: SessionUser;
}): Promise<ScanReturnOutcome> {
  const { actor } = input;
  if (!canAutoReturnDocuments(actor)) return "not_permitted";
  const number = input.documentNumber.trim().toLowerCase();
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
  const matches = (response.data.values || [])
    .map((row, index) => ({ row, rowNumber: index + 2, status: String(row[9] ?? "").trim() }))
    .filter(({ row }) =>
      String(row[0] ?? "").trim() &&
      String(row[1] ?? "").trim().toLowerCase() === input.documentType &&
      String(row[2] ?? "").trim().toLowerCase() === number,
    );
  const entry = pickScanReturnEntry(matches);
  const plan = scanReturnPlan(entry?.status);
  const now = new Date().toISOString();
  const stamp = [actor.userId, actor.fullName, now];

  if (plan === "create") {
    const customerName = (await input.resolveCustomerName?.().catch(() => undefined)) || "";
    const row = [
      crypto.randomUUID(), input.documentType, input.documentNumber.trim(), customerName,
      actor.userId, actor.fullName, actor.userId, actor.fullName, now,
      "returned", "", "", "", SCAN_RETURN_NOTE, "internal",
      ...stamp, // P:R received
      ...stamp, // S:U verified
    ];
    await sheets.spreadsheets.values.append({ spreadsheetId, range: RANGE, valueInputOption: "USER_ENTERED", requestBody: { values: [row] } });
    return "created";
  }
  if (plan === "skip" || !entry) return entry?.status.toLowerCase() === "unassigned" ? "unassigned" : "already_returned";

  const r = entry.rowNumber;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${SHEET_NAME}!J${r}`, values: [["returned"]] },
        ...(plan === "return_both" ? [{ range: `${SHEET_NAME}!P${r}:R${r}`, values: [stamp] }] : []),
        { range: `${SHEET_NAME}!S${r}:U${r}`, values: [stamp] },
      ],
    },
  });
  return "returned";
}

/** Runs the tracker step after a scan is saved; never throws. Returns a warning for the uploader, if any. */
export async function trackerWarningAfterScan(input: Parameters<typeof returnDocumentFromScan>[0]): Promise<string | undefined> {
  try {
    const outcome = await returnDocumentFromScan(input);
    if (outcome === "not_permitted") return "Scan saved. The Document Tracker was not updated because only users who can receive and verify documents update it.";
    if (outcome === "unassigned") return "Scan saved. Its Document Tracker entry is unassigned, so it was left unchanged.";
    return undefined;
  } catch (error) {
    console.error("Scan saved but the Document Tracker update failed:", error);
    return `Scan saved, but the Document Tracker was not updated: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}
