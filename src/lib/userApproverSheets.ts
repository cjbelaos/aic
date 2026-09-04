import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type { UserApprover } from "@/types/userApprover";

const APPROVERS_SHEET = "UserApprovers";
const APPROVERS_RANGE = `${APPROVERS_SHEET}!A2:F`;
// A=configId, B=departmentId, C=requesterUserId, D=approverUserId, E=approvalLevel,
// F=approvalType (FTI | LIQUIDATION | * = all modules)

function parseId(value: string): number {
  const n = parseInt(value.trim(), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Load all user-approver mappings. When `approvalType` is provided, only
 * mappings that apply to that module are returned: an exact module match or a
 * wildcard ("*" or empty) mapping. When omitted, every mapping is returned.
 */
export async function getUserApprovers(
  approvalType?: string,
): Promise<UserApprover[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: APPROVERS_RANGE,
  });
  const rows = res.data.values || [];
  let approvers = rows
    .map(
      (row): UserApprover => ({
        configId: (row[0] || "").toString().trim(),
        departmentId: parseId((row[1] || "0").toString()),
        requesterUserId: (row[2] || "").toString().trim(),
        approverUserId: (row[3] || "").toString().trim(),
        approvalLevel: parseId((row[4] || "0").toString()),
        approvalType: (row[5] || "").toString().trim(),
      }),
    )
    .filter((a) => a.configId && a.approverUserId);
  if (approvalType) {
    approvers = approvers.filter(
      (a) =>
        !a.approvalType ||
        a.approvalType === "*" ||
        a.approvalType === approvalType,
    );
  }
  return approvers;
}

export async function getApproverForRequester(
  requesterUserId: string,
  departmentId: number,
  approvalType?: string,
): Promise<UserApprover | null> {
  const all = await getUserApprovers();
  const matches = all.filter(
    (a) =>
      a.requesterUserId === requesterUserId &&
      a.departmentId === departmentId,
  );
  if (approvalType) {
    // Prefer an exact module match; otherwise fall back to wildcard mappings.
    const exact = matches
      .filter((a) => a.approvalType === approvalType)
      .sort((a, b) => a.approvalLevel - b.approvalLevel);
    if (exact.length) return exact[0];
    const wildcard = matches
      .filter((a) => !a.approvalType || a.approvalType === "*")
      .sort((a, b) => a.approvalLevel - b.approvalLevel);
    if (wildcard.length) return wildcard[0];
    return null;
  }
  const sorted = [...matches].sort((a, b) => a.approvalLevel - b.approvalLevel);
  return sorted[0] || null;
}

export async function addUserApprover(
  input: Omit<UserApprover, "configId"> & { configId?: string },
): Promise<UserApprover> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const approver: UserApprover = {
    configId: input.configId || crypto.randomUUID(),
    departmentId: input.departmentId,
    requesterUserId: input.requesterUserId,
    approverUserId: input.approverUserId,
    approvalLevel: input.approvalLevel,
    approvalType: input.approvalType,
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${APPROVERS_SHEET}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          approver.configId,
          String(approver.departmentId),
          approver.requesterUserId,
          approver.approverUserId,
          String(approver.approvalLevel),
          approver.approvalType,
        ],
      ],
    },
  });
  return approver;
}

export async function deleteUserApprover(configId: string): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: APPROVERS_RANGE,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex(
    (r) => (r[0] || "").toString().trim() === configId,
  );
  if (idx === -1) {
    throw new Error(`UserApprover ${configId} not found`);
  }
  const rowNumber = idx + 2;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${APPROVERS_SHEET}!A${rowNumber}:F${rowNumber}`,
  });
}
