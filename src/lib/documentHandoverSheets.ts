import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import {
  DocumentHandover,
  DocumentOption,
  CreateDocumentHandoverInput,
  ReturnDocumentHandoverInput,
  DocumentType,
} from "@/types/documentHandover";
import { getUserById } from "@/lib/userSheets";

const SHEET_NAME = "DocumentHandover";
const RANGE = `${SHEET_NAME}!A2:O`;
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
        status: row[9] as "handed_over" | "returned",
        returnedBy: String(row[10] ?? "").trim() || undefined,
        returnedByName: String(row[11] ?? "").trim() || undefined,
        returnedAt: String(row[12] ?? "").trim() || undefined,
        notes: String(row[13] ?? "").trim() || undefined,
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
