import crypto from "crypto";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type { UserApprover } from "@/types/userApprover";

const APPROVERS_SHEET = "UserApprovers";
const APPROVERS_RANGE = `${APPROVERS_SHEET}!A2:E`;
// A=configId, B=departmentId, C=requesterUserId, D=approverUserId, E=approvalLevel

function parseId(value: string): number {
  const n = parseInt(value.trim(), 10);
  return isNaN(n) ? 0 : n;
}

export async function getUserApprovers(): Promise<UserApprover[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: APPROVERS_RANGE,
  });
  const rows = res.data.values || [];
  return rows
    .map(
      (row): UserApprover => ({
        configId: (row[0] || "").toString().trim(),
        departmentId: parseId((row[1] || "0").toString()),
        requesterUserId: (row[2] || "").toString().trim(),
        approverUserId: (row[3] || "").toString().trim(),
        approvalLevel: parseId((row[4] || "0").toString()),
      }),
    )
    .filter((a) => a.configId && a.approverUserId);
}

export async function getApproverForRequester(
  requesterUserId: string,
  departmentId: number,
): Promise<UserApprover | null> {
  const all = await getUserApprovers();
  const matches = all
    .filter(
      (a) =>
        a.requesterUserId === requesterUserId &&
        a.departmentId === departmentId,
    )
    .sort((a, b) => a.approvalLevel - b.approvalLevel);
  return matches[0] || null;
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
  };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${APPROVERS_SHEET}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          approver.configId,
          String(approver.departmentId),
          approver.requesterUserId,
          approver.approverUserId,
          String(approver.approvalLevel),
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
    range: `${APPROVERS_SHEET}!A${rowNumber}:E${rowNumber}`,
  });
}
